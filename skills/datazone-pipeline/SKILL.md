---
name: datazone-pipeline
description: Use when writing, editing, or debugging a Datazone pipeline — Python files with @transform functions that read Datasets and produce Datasets. Triggers on "datazone pipeline", "@transform", "input_mapping", "output_mapping", "materialized", editing a file registered under `pipelines:` in config.yml, or a pipeline that fails to deploy or run.
---

# Writing Datazone pipelines

A pipeline is one Python file containing `@transform`-decorated functions. Each
transform reads inputs (Datasets or other transforms) and returns a DataFrame. Datazone
builds the DAG from the decorators.

## The workflow

1. Write the pipeline file (convention: `pipelines/<name>.py`)
2. Register it in `config.yml` under `pipelines:` with a unique `alias`
3. `git add`, `git commit`, `git push`
4. Check the deploy result — validation is server-side and asynchronous

## Registering the pipeline

```yaml
# config.yml
project_name: my-project
project_id: 68f1a2b3c4d5e6f7a8b9c0d1
pipelines:
  - alias: sales_pipeline        # required, must be unique in the project
    path: pipelines/sales.py     # required
    name: "Sales"                # optional; defaults to the filename
    compute: SMALL               # XSMALL | SMALL | MEDIUM | LARGE | XLARGE
    python_dependencies:
      - name: scikit-learn
        version: "1.5.0"
    spark_config:
      deploy_mode: local         # local | client
      executor_instances: 2
```

`alias` is the pipeline's identity. Changing it creates a new pipeline and deletes the
old one. Removing the entry deletes the pipeline.

## A minimal pipeline

```python
from datazone import transform, Input, Output, Dataset


@transform(
    input_mapping={"orders_df": Input(Dataset(alias="orders"))},
    output_mapping={"daily_sales": Output(materialized=True)},
)
def aggregate_sales(orders_df):
    return orders_df.groupBy("order_date").sum("amount")
```

Import only from `datazone`: `transform`, `Input`, `Output`, `Dataset`, `Variable`,
`OutputMode`, `logger`.

**The keys of `input_mapping` must exactly match the function's parameter names.** That
is how arguments are bound — not by position.

## Chaining transforms

Reference another transform's function object as an input. Use `output=` to pick a
specific named output:

```python
@transform(output_mapping={"clean": Output(materialized=True)})
def clean_orders():
    ...


@transform(
    input_mapping={"df": Input(clean_orders, output="clean")},
    output_mapping={"summary": Output(materialized=True)},
)
def summarise(df):
    ...
```

**The referenced transform must be defined earlier in the file.** Definitions are
evaluated top to bottom, so a forward reference fails the deploy with
`NameError: name 'clean_orders' is not defined`.

## Inputs

```python
Input(Dataset(alias="orders"))                        # by alias
Input(Dataset(id="68f1..."))                          # by id
Input(Dataset(alias="orders", run_upstream=True))     # refresh the producer first
Input(Dataset(alias="orders", run_upstream=True, freshness_duration=720))
Input(other_transform)                                # default output
Input(other_transform, output="clean")                # named output
```

`freshness_duration` is in **minutes**. Combined with `run_upstream=True`, it re-runs the
producing job only when the data is older than that.

## Outputs

```python
Output(materialized=True)                             # persist as a new dataset
Output(dataset=Dataset(alias="existing"), mode="append")
Output(materialized=True, partition_by=["country"])
```

- `materialized=True` persists the result as a queryable dataset. Without it the output
  is intermediate — available to downstream transforms in the same run, but not stored.
- `mode` is `overwrite` (default) or `append`.
- When you pass `dataset=`, that Dataset must have an `id` or `alias`.

Do not set `materialized=True` on the decorator *and* supply an `output_mapping`. Deploy
accepts it silently, then the run fails with `If you define a output_mapping, the
transform cannot be materialized.` Put `materialized` on each `Output` instead.

## Decorator options

| Option | Purpose |
|---|---|
| `input_mapping` | `{param_name: Input(...)}` |
| `output_mapping` | `{output_name: Output(...)}` |
| `materialized` | Shorthand persist — only when there is no `output_mapping` |
| `depends` | Ordering-only dependencies on other transforms |
| `partition_by` | Partition columns |
| `engine` | `pyspark` (default) or `pandas` |
| `name`, `description`, `tags` | Metadata |

## PySpark vs Pandas

Default is PySpark; your function receives Spark DataFrames. Set `engine="pandas"` to
receive pandas DataFrames instead — appropriate for small data, and it avoids Spark
startup cost. Do not mix engines within a single transform.

## The deploy-time trap: decorator arguments are evaluated in isolation

Datazone does not import your file at deploy. It parses it, then evaluates **each
decorated function on its own** in a namespace containing only `transform`, `Input`,
`Output`, and `Dataset`.

This means **module-level names are invisible inside decorator arguments**:

```python
FRESHNESS = 720

@transform(
    input_mapping={"df": Input(Dataset(alias="orders", freshness_duration=FRESHNESS))},
)                                     # ← NameError: name 'FRESHNESS' is not defined
def t(df):
    ...
```

Use literals in decorator arguments. Constants, helper functions, config lookups, and
imported values all fail. Inside the function *body* they are fine — the body is only
executed at run time, where the whole module is loaded normally.

## Gotchas

- **`input_mapping` keys must equal parameter names.** A mismatch fails at run time with
  a confusing binding error, not at deploy.
- **Referenced transforms must appear above the reference.** No forward references.
- **Only literals in decorator arguments.** See above.
- **A transform removed from the file is deleted on the next deploy**, along with its
  datasets if they were materialized only by it.
- **Only top-level functions are collected.** A `@transform` nested inside another
  function is invisible.
- **`alias` collisions across pipelines fail the whole config**, not just that entry.

## Verifying

After pushing, do not assume success — validation runs server-side afterwards.

Check the project page in the UI for deploy status, the failed step, and the error. Or
via the API with an `x-api-key` header:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/project/activities/<project_id>"
```

If you have the CLI installed, `datazone project activities` and `datazone project
summary` show the same information.

Deploy errors quote the Python exception from evaluating your decorators — a `NameError`
almost always means a non-literal in a decorator argument.

## Related

- `datazone-project-setup` — cloning, profiles, the deploy loop
- `datazone-intelligent-app` — visualising the datasets a pipeline produces

Official docs: https://docs.datazone.co
