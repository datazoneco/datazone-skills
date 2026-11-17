# Debugging pipelines

Two different failures, found in two different places:

| | Deploy error | Run error |
|---|---|---|
| When | After `git push` | After `datazone execution run` or a schedule |
| Where | Project deploy activity | Execution: status, log, steps, Spark profile |
| Effect | Nothing in the commit is deployed | Earlier transforms' outputs are already written |
| Typical cause | Config, syntax, decorator arguments, missing input dataset | Code in the function body, data, memory |

## Deploy errors

```bash
datazone project activities list <project_id>          # status per commit, no error text
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/project/activities/<project_id>"   # deploy_steps[].errors
```

The steps run in this order, and the first failure stops the deploy:

| Step | Error seen | Fix |
|---|---|---|
| `CONFIG_FILE_CHECK` | `Pipeline 'report' depends on undefined pipelines: ordrs` | Alias typo, or the upstream was removed |
| `CONFIG_FILE_CHECK` | `Pipeline dependencies form a cycle: a -> b -> a` | Break the cycle |
| `CONFIG_FILE_CHECK` | `Alias must be unique` | Two entries share an `alias` |
| `FETCHED_CODE` | `Pipeline file not found` | `path` does not match the file |
| `VALIDATE_SYNTAX` | A Python syntax error with its `path` | Fix the syntax |
| `PIPELINE_CHECK` | `name 'X' is not defined` (no path given) | A module-level name in a decorator argument, or a forward reference |
| `PIPELINE_CHECK` | `Input.__init__() got an unexpected keyword argument 'output_name'` | `Input(t, "name")` |
| `PIPELINE_CHECK` | `Dataset with alias X does not exist.` | Run the producer once, then push the consumer |
| `PIPELINE_CHECK` | `No pipeline definition found` | A registered file with no `@transform` |

`PIPELINE_CHECK` errors carry no file path. With several pipelines in the commit, search
them all for the name in the message.

Things the deploy does **not** catch — they fail the run: `input_mapping` keys that do not
match parameter names, `Input(t, output="x")`, `materialized=True` together with
`output_mapping`, `Variable(...).get_value()`, `from datazone import OutputMode`, engine
mismatches.

## Run errors

```bash
datazone project summary                       # in the repo: pipeline ids and transforms
datazone execution run --pipeline-id <id>      # start; tails the log until it finishes
datazone execution run --pipeline-id <id> --transform-selection "*build_report"
datazone execution list --pipeline-id <id>     # recent runs and their status
datazone execution show <execution_id>         # status, exception, error_insight
datazone execution log <execution_id>          # full log, follows a running execution
datazone execution steps <execution_id>        # INITIALIZATION / PREPARATION / EXECUTION / FINALIZATION
datazone execution transforms <execution_id>   # per-transform status and timings
datazone execution outputs <execution_id>      # datasets written, mode, rows, bytes
datazone execution upstreams <execution_id>    # child runs from depends / run_upstream
datazone execution pod-metrics <execution_id>  # driver and executor pods, CPU, memory
datazone execution rerun <execution_id>        # same parameters again
datazone execution terminate <execution_id>
```

Start with `execution show`: `exception` holds the error, and `error_insight` an
AI-written explanation once generated. Then `execution log` for the traceback — the
failing transform is in the `Step` column, as `Error in transform <name>: <message>`.

`--transform-selection` reruns part of a pipeline: `name` alone, `*name` with its
ancestors, `name*` with its descendants, `+name` with direct parents. A selection that
leaves out a non-materialized input of a selected transform is refused.

### Statuses

| Status | Meaning |
|---|---|
| `WAITING_UPSTREAMS` | Child runs from `depends` / `run_upstream` are running |
| `UPSTREAM_FAILURE` | A child run failed; this one never started |
| `FAILURE` | The run itself failed |
| `SUCCESS` | Done |

When an upstream fails, debug the child: take its id from `execution upstreams`.

### Lazy Spark errors surface at the write

PySpark is lazy, so an error in a UDF or a cast is raised when the output is written, not
in your function. The log shows `Finished transform X`, then `Write attempt 1 failed`,
`2`, `3` — the write is retried three times — then the Python traceback inside a
`PythonException`. The traceback names your file and line.

### Datasets after a failed run

A materialized output whose first run failed is left as a `CORRUPTED` dataset. The next
successful run fixes it. Outputs written before the failing transform keep their new data.

## The Spark profile

Every execution that starts Spark (any PySpark transform, or a pandas transform that
uses `context`) records a Spark profile. A pandas-only run has none.

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/execution/get-spark-profiles/<execution_id>"
```

There is no CLI command for it. It returns a list, one item per execution job:

```json
[{
  "profile": {
    "status": "COMPLETED",
    "application": {"spark_version": "4.1.1", "start_time": "...", "end_time": "..."},
    "spark_properties": {"spark.sql.shuffle.partitions": "8", "...": "..."},
    "metrics": {"executor_run_time_ms": 13353, "jvm_gc_time_ms": 679,
                "shuffle_read_bytes": 6941, "memory_bytes_spilled": 0,
                "disk_bytes_spilled": 0, "peak_execution_memory": 67370992},
    "jobs": [...], "stages": [...], "executors": [...], "sql_executions": [...],
    "errors": ["org.apache.spark.api.python.PythonException: Traceback ..."]
  },
  "insights": [{"level": "WARNING", "code": "TASK_FAILURES",
                "message": "3 task attempt(s) failed and were retried."}]
}]
```

- `status`: `RUNNING` while the job runs (parts arrive every ~30 s), `COMPLETED`, or
  `INCOMPLETE` — the job ended but Spark never reported the application end.
- `spark_properties` shows what Spark really ran with. Check `extra_spark_config` there.
- `executors` lists the driver and, in client mode, each executor pod, with peak memory
  and `removed_reason`. Peak memory arrives with ~10 s heartbeats, so short jobs show 0.
- `stages[].failure_reason`, `jobs[].error` and `errors` hold Spark-side errors.
- Each upstream run has its own profile, under its own execution id.

### What to do for each insight

| Code | Fires when | Do this |
|---|---|---|
| `DRIVER_STOPPED` (ERROR) | Profile `INCOMPLETE`: the driver pod died before Spark ended, usually OOM-killed | Check `execution pod-metrics` memory. Raise `compute`. Do not `collect()` / `toPandas()` large frames, and do not use `engine="pandas"` for large data |
| `EXECUTOR_OUT_OF_MEMORY` (ERROR) | An executor's `removed_reason` mentions OOM / exit code 137 | Executors are sized from `compute`: raise it. Spread the work: more `executor_instances`, `repartition()` before wide operations, fix skew (below) |
| `SPILL` (WARNING) | Any memory or disk spill | Raise `compute`, or set more `spark.sql.shuffle.partitions` in `extra_spark_config`. Select only needed columns and filter before joins and aggregations |
| `HIGH_GC` (WARNING) | GC ≥ 10% of task time, on runs with ≥ 60 s of task time | Memory pressure: raise `compute`, drop unused columns early, avoid `cache()` of large frames, replace Python UDFs with built-in functions |
| `DATA_SKEW` (WARNING) | In a stage with ≥ 4 tasks, the slowest task took ≥ 30 s and > 3× the average | One key holds most rows. Filter nulls and hot keys before the join, `F.broadcast()` the small side, or salt the key |
| `TASK_FAILURES` (WARNING) | Any failed task attempt | On a failed run it is almost always your code raising inside a task: read `errors` and the execution log. One bad row shows as 3 failures because the write is retried three times. On a successful run, look for a lost executor |

No insights and `status: COMPLETED` means Spark itself was healthy; a slow run then
usually comes from the work itself (input size, wide joins) or from waiting —
`execution steps` shows time spent before `EXECUTION` (node scale-up, image pull,
upstreams).

## Common failures

| Message | Cause | Fix |
|---|---|---|
| `Output name must be provided when there are multiple outputs.` | `Input(t, output="x")` — the keyword is dropped at run time | `Input(t, "x")` |
| `Error in transform t: 0` | A single non-materialized `Output()` in `output_mapping` | Drop `output_mapping` for intermediates, or materialize |
| `Engine mismatch. You must use the same engine as the transform.` | A pandas transform reads a PySpark transform, or vice versa | Same `engine` on both, or materialize and read the dataset |
| `'Variable' object has no attribute 'get_value'` | The type stub advertises `get_value()`; the runtime class has none | `str(Variable("key"))` |
| `cannot import name 'OutputMode' from 'datazone'` | Not exported at run time | `mode="append"` |
| `If you define a output_mapping, the transform cannot be materialized.` | `materialized=True` on the decorator plus `output_mapping` | Put `materialized=True` on each `Output` |
| `Number of inputs does not match function signature.` | `context` is not the last parameter, or a parameter has no `input_mapping` entry | `def t(df, context)` |
| `Pipeline/Extract that is trying to run has a execution already.` | One execution per pipeline at a time | Wait, or `execution terminate` |
| `Executor does not have permission to execute an upstream of the pipeline.` | The runner lacks execute on an upstream pipeline or extract | Grant it, or run as someone who has it |
| `Input dataset is not ready and there is no extract or pipeline that produces it.` | `run_upstream=True` on a dataset nobody produces, and it is not `READY` | Fix or load the dataset; drop `run_upstream` |
| `Pipeline in depends is not found. It might not be deployed yet.` | The upstream alias is in `config.yml` but its deploy failed | Fix the upstream's deploy |

## Checking the result

```bash
datazone execution outputs <execution_id>              # rows and bytes written per dataset
datazone sql "select count(*) from daily_sales"         # query by alias
datazone dataset table daily_sales_3f9a1c               # resolve a table name to its dataset
```

In SQL, `col IS NOT NULL` returns **0 rows** on materialized tables (`IS NULL` works).
Use `isNotNull(col)`; `col != ''` also works but drops empty strings too.
