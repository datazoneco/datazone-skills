---
name: datazone-pipeline
description: Use when writing, editing, or debugging a Datazone pipeline — Python files with @transform functions that read Datasets and produce Datasets. Triggers on "datazone pipeline", "@transform", "input_mapping", "output_mapping", "materialized", "run_upstream", a pipeline that depends on another pipeline (`depends:` in config.yml), editing a file registered under `pipelines:` in config.yml, a Spark profile or insight (SPILL, DATA_SKEW, EXECUTOR_OUT_OF_MEMORY), or a pipeline that fails to deploy or run.
---

# Writing Datazone pipelines

A pipeline is one Python file containing `@transform`-decorated functions. Each
transform reads inputs (Datasets or other transforms) and returns a DataFrame. Datazone
builds the DAG from the decorators. A pipeline can also wait for other pipelines
(`depends:` in `config.yml`).

## The workflow

1. Write the pipeline file (convention: `pipelines/<name>.py`). Start from
   `assets/pipeline_template.py`.
2. Register it in `config.yml` under `pipelines:` with a unique `alias`
3. `git add`, `git commit`, `git push`
4. Check the deploy activity — validation is server-side and asynchronous
5. Run it (`datazone execution run --pipeline-id <id>`) and check the execution

A failed deploy changes nothing: **one bad file fails the whole commit**, and the
pipelines that were fine are not deployed either.

## Registering the pipeline

```yaml
# config.yml
project_name: my-project
project_id: 68f1a2b3c4d5e6f7a8b9c0d1
pipelines:
  - alias: daily_sales           # required, must be unique in the project
    path: pipelines/daily_sales.py   # required
    name: "Daily sales"          # optional; defaults to the path
    compute: SMALL               # XSMALL | SMALL | MEDIUM | LARGE | XLARGE
    depends:                     # optional; pipelines that run in full first
      - raw_orders
    python_dependencies:         # pip-installed before the transforms run
      - name: tabulate
        version: "0.9.0"
    spark_config:
      deploy_mode: client        # local (default): driver only | client: + executor pods
      executor_instances: 1      # client mode only; executors are sized from compute
      extra_spark_config:        # any Spark property, values as strings
        spark.sql.shuffle.partitions: "8"
```

`alias` is the pipeline's identity. Changing it creates a new pipeline and deletes the
old one. Removing the entry deletes the pipeline. A copyable version is in
`assets/config.yml`.

## A minimal pipeline

```python
from pyspark.sql import functions as F

from datazone import transform, Input, Output, Dataset


@transform(
    input_mapping={"orders_df": Input(Dataset(alias="orders"))},
    output_mapping={"daily_sales": Output(dataset=Dataset(alias="daily_sales"), materialized=True)},
)
def aggregate_sales(orders_df):
    return orders_df.groupBy("order_date").agg(F.sum("amount").alias("amount"))
```

Import from `datazone`: `transform`, `Input`, `Output`, `Dataset`, `Variable`, `logger`
(and `Agent` for LLM calls). **`OutputMode` is not importable at run time** — the deploy
passes, then the run fails with `cannot import name 'OutputMode' from 'datazone'`.
Write `mode="append"` as a string.

**The keys of `input_mapping` must exactly match the function's parameter names.** That
is how arguments are bound — not by position.

## Name every output dataset

Without an alias, a materialized output gets a dataset whose alias — and SQL table
name — is `<name>_<6 random hex>`: `daily_sales_3f9a1c`, or
`<transform>_result_3f9a1c` for `@transform(materialized=True)`. Nothing else can refer
to it by a stable name. Give anything another pipeline, app or query reads an alias:

```python
Output(dataset=Dataset(alias="daily_sales"), materialized=True)
```

The alias is created on the first run. Aliases are unique across the organisation, so
prefix them in shared environments.

## Chaining transforms

Reference another transform's function object as an input. With several outputs, pass
the output name **positionally**:

```python
@transform(output_mapping={"clean": Output(materialized=True), "rejected": Output(materialized=True)})
def split_orders(context):
    ...
    return clean_df, rejected_df          # tuple, in output_mapping order


@transform(
    input_mapping={"df": Input(split_orders, "clean")},   # NOT output="clean"
    output_mapping={"summary": Output(dataset=Dataset(alias="summary"), materialized=True)},
)
def summarise(df):
    ...
```

`Input(t, output="clean")` deploys, then the run fails with `Output name must be
provided when there are multiple outputs.` `Input(t, output_name="clean")` fails the
deploy with `Input.__init__() got an unexpected keyword argument 'output_name'`. The
positional form is the only one both sides accept.

**The referenced transform must be defined earlier in the file.** A forward reference
fails the deploy with `name 'clean_orders' is not defined`.

**Both transforms must use the same `engine`.** A pandas transform reading a PySpark
transform fails with `Engine mismatch.` Datasets can be read by either engine.

## Inputs

```python
Input(Dataset(alias="orders"))                        # by alias
Input(Dataset(id="68f1..."))                          # by id
Input(Dataset(alias="orders", run_upstream=True))     # always refresh the producer first
Input(Dataset(alias="orders", run_upstream=True, freshness_duration=720))
Input(other_transform)                                # its only output
Input(other_transform, "clean")                       # a named output
```

Input datasets **must exist at deploy time**, or the deploy fails with `Dataset with
alias X does not exist.` A dataset is created by the first run of its producer. To add a
pipeline that reads a new pipeline's output, push and run the producer first, then push
the consumer.

`run_upstream=True` runs whatever produces the dataset before this pipeline: its extract,
or the pipeline that materializes it. A producer pipeline runs only the transform that
writes the dataset plus that transform's ancestors. `freshness_duration` is in
**minutes**: the producer runs only when the data is older than that.

## Outputs

```python
Output(dataset=Dataset(alias="sales"), materialized=True)        # persist under a fixed alias
Output(dataset=Dataset(alias="events"), materialized=True, mode="append")
Output(materialized=True)                                        # persist, random-suffixed alias
```

- `materialized=True` persists the result as a queryable dataset. **Without it nothing is
  written** — not even with `dataset=` or `mode="append"`.
- `mode` is `overwrite` (default) or `append`.
- `partition_by=[...]` is recorded on the dataset, but the Delta table is **written
  unpartitioned** (checked on 1.8.0). Do not count on it for file pruning.
- An intermediate (not materialized) result lives in memory for the current run only.
  Get one by leaving out `output_mapping` and `materialized`. A single non-materialized
  `Output()` inside `output_mapping` fails the run with the error `0`.

Do not set `materialized=True` on the decorator *and* supply an `output_mapping`. Deploy
accepts it, then the run fails with `If you define a output_mapping, the transform cannot
be materialized.` Put `materialized` on each `Output` instead.

## Decorator options

| Option | Purpose |
|---|---|
| `input_mapping` | `{param_name: Input(...)}` |
| `output_mapping` | `{output_name: Output(...)}` |
| `materialized` | Shorthand persist — only when there is no `output_mapping` |
| `depends` | Ordering-only dependencies on other transforms in the same file |
| `partition_by` | Partition columns (metadata only, see above) |
| `engine` | `pyspark` (default) or `pandas` |
| `name`, `description`, `tags` | Metadata |

## PySpark vs pandas

Default is PySpark; your function receives Spark DataFrames. Set `engine="pandas"` to
receive and return pandas DataFrames — right for small data, and it skips Spark startup.

## The `context` parameter

Name the **last** parameter `context` and the executor passes it in:

- `context.resources["pyspark"].spark` — the Spark session, for `createDataFrame` or SQL
- `context.state.read(key=..., default=...)` / `context.state.write(key=..., value=...,
  on="success")` — string key-values kept across runs; the watermark for incremental loads

`def t(df, context)` works; `def t(context, df)` fails with `Number of inputs does not
match function signature.` Touching `context` starts a Spark session even in a pandas
transform (~15 s).

## Variables

Read a project or organisation variable **inside the function body**:

```python
region = str(Variable("sales_region"))
```

`Variable(...).get_value()` deploys, then fails the run with `'Variable' object has no
attribute 'get_value'`. The project's variable wins over an organisation one with the
same key.

## Pipelines as upstreams

List other pipelines' aliases under `depends` and they run **in full** before this one,
every time this one runs, as child executions:

```yaml
pipelines:
  - alias: orders
    path: pipelines/orders.py
  - alias: report
    path: pipelines/report.py
    depends:
      - orders
```

- Every alias must be a pipeline in the same `config.yml`. A typo fails the deploy at
  `CONFIG_FILE_CHECK` with `depends on undefined pipelines: ...`.
- No cycles: `Pipeline dependencies form a cycle: orders -> report -> orders`.
- It is pull-only. Running `orders` does not trigger `report`; schedule the downstream.
- `depends` waits for the pipeline, `run_upstream=True` waits for a dataset's producer.
  `depends` always runs the upstream; `run_upstream` respects `freshness_duration`.
  Reading another pipeline's dataset does not need `depends`.
- The user who starts the run (or owns the schedule) needs execute permission on every
  upstream extract and pipeline, transitively. Otherwise the run is refused before it
  starts: `Executor does not have permission to execute an upstream of the pipeline.`
- A failed upstream fails the downstream with `UPSTREAM_FAILURE`; it never starts.
- Removing a pipeline that others `depends` on fails the config validation (or the
  delete API refuses it). Remove it from their `depends` first.

`datazone execution upstreams <execution_id>` lists the child runs.

## The deploy-time trap: decorator arguments are evaluated in isolation

Datazone does not import your file at deploy. It parses it, then evaluates **each
decorated function on its own** in a namespace containing only `transform`, `Input`,
`Output`, and `Dataset`, plus the transforms defined above it.

This means **module-level names are invisible inside decorator arguments**:

```python
FRESHNESS = 720

@transform(
    input_mapping={"df": Input(Dataset(alias="orders", freshness_duration=FRESHNESS))},
)                                     # ← name 'FRESHNESS' is not defined
def t(df):
    ...
```

Use literals in decorator arguments (`12 * 60` is fine). Constants, helper functions,
config lookups and imported values all fail. Inside the function *body* they are fine —
the body only runs at run time, where the whole module loads normally, and the project
root is on `sys.path`.

## Gotchas

- **`input_mapping` keys must equal parameter names.** A mismatch fails at run time.
- **Named outputs are passed positionally:** `Input(t, "name")`.
- **Referenced transforms must appear above the reference.** No forward references.
- **Only literals in decorator arguments.** See above.
- **Input datasets must exist before the deploy** that reads them.
- **No `materialized=True`, no dataset.** `dataset=` alone writes nothing.
- **Unaliased outputs get random table names.** Alias every dataset you share.
- **A transform removed from the file is deleted on the next deploy.** Its dataset is
  not: it stays queryable and orphaned. Delete it yourself if it is not needed.
- **`mode="append"` appends again on every run, reruns included.** Pair it with a
  `context.state` watermark — see `references/examples.md`.
- **One execution per pipeline at a time.** A second run request fails while one is
  active; an upstream already running is reused.
- **Only top-level functions are collected.** A `@transform` nested inside another
  function is invisible.
- **`alias` collisions across pipelines fail the whole config**, not just that entry.
- **`col IS NOT NULL` returns 0 rows on materialized tables** in SQL (apps, endpoints,
  `datazone sql`). Use `isNotNull(col)`. Inside the pipeline, PySpark's `isNotNull()` is
  fine.

## Verifying

After pushing, do not assume success — validation runs server-side afterwards.

```bash
datazone project activities list <project_id>      # deploy status per commit
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/project/activities/<project_id>"   # failed step + error
datazone project summary                          # in the repo: pipeline ids, transforms
datazone execution run --pipeline-id <id>          # starts and tails the log
```

Deploy steps run in order: `CONFIG_FILE_CHECK`, `FETCHED_CODE`, `VALIDATE_SYNTAX`,
`PIPELINE_CHECK`, `LOAD_PROJECT_ENTITIES`. A `NameError` in `PIPELINE_CHECK` almost
always means a non-literal in a decorator argument; that error carries no file path.

For failed runs, execution logs, upstream runs and the Spark profile, see
`references/debugging.md`.

## Reference

- `references/examples.md` — tested pipelines: pandas, PySpark, multiple outputs,
  incremental append, `partition_by`, `run_upstream`, variables, logging, `depends`
- `references/debugging.md` — deploy vs run errors, the `datazone execution` commands,
  the Spark profile and what to do for each insight, common failures
- `assets/pipeline_template.py` — starter pipeline
- `assets/config.yml` — the `pipelines:` entry with every option

## Related

- `datazone-project-setup` — cloning, profiles, the deploy loop
- `datazone-intelligent-app` — visualising the datasets a pipeline produces

Official docs: https://docs.datazone.co
