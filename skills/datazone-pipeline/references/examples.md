# Pipeline examples

Every pipeline here was pushed to a Datazone 1.8.0 project and run to `SUCCESS`. The data
is built inside the pipelines, so they need no source. On a shared organisation, prefix
the aliases: dataset aliases are unique across the organisation.

The `config.yml` that registers them:

```yaml
pipelines:
  - alias: orders
    path: pipelines/orders.py
    name: Orders
    compute: XSMALL
  - alias: customers
    path: pipelines/customers.py
    name: Customers
  - alias: events
    path: pipelines/events.py
    name: Events
  - alias: report                # push this entry only after orders and customers ran once
    path: pipelines/report.py
    name: Report
    depends:
      - orders
  - alias: labelled_totals       # likewise, after orders ran once
    path: pipelines/labelled_totals.py
```

## PySpark: multiple outputs, `partition_by`, logging

`pipelines/orders.py`. One transform splits the rows into two datasets, the next reads
one of them by name.

```python
from pyspark.sql import functions as F

from datazone import transform, Input, Output, Dataset, logger


@transform(
    output_mapping={
        "orders": Output(dataset=Dataset(alias="orders"), materialized=True, partition_by=["country"]),
        "rejected": Output(dataset=Dataset(alias="rejected_orders"), materialized=True),
    },
)
def split_orders(context):
    spark = context.resources["pyspark"].spark
    df = spark.createDataFrame(
        [
            (1, "TR", 120.0, "2026-11-01"),
            (2, "DE", 80.5, "2026-11-01"),
            (3, "TR", -5.0, "2026-11-02"),
            (4, "US", 42.0, "2026-11-02"),
            (5, None, 10.0, "2026-11-03"),
        ],
        "order_id INT, country STRING, amount DOUBLE, order_date STRING",
    )
    valid = df.filter((F.col("amount") > 0) & F.col("country").isNotNull())
    rejected = df.subtract(valid)
    logger.info(f"valid={valid.count()} rejected={rejected.count()}")
    return valid, rejected  # tuple order = output_mapping order


@transform(
    input_mapping={"orders": Input(split_orders, "orders")},  # positional output name
    output_mapping={"totals": Output(dataset=Dataset(alias="country_totals"), materialized=True)},
)
def country_totals(orders):
    return orders.groupBy("country").agg(
        F.sum("amount").alias("total_amount"),
        F.count("*").alias("order_count"),
    )
```

- `context` gives the Spark session for a transform with no inputs.
- `logger.info` lines show in the execution log under the transform's name.
- `Input(split_orders, "orders")` — positional. `output="orders"` fails the run.
- `partition_by` lands on the dataset (`partition_by: ['country']`), but
  `DeltaTable.detail()` reports `partitionColumns=[]`: the files are not partitioned.

## pandas engine, chained transforms, a variable

`pipelines/customers.py`. Create the variable first (UI, or
`datazone variable create`, scoped to the project).

```python
import pandas as pd

from datazone import transform, Input, Output, Dataset, Variable, logger


@transform(engine="pandas", materialized=True)
def raw_customers():
    return pd.DataFrame(
        {
            "customer_id": [1, 2, 3],
            "name": ["Ada", "Linus", "Grace"],
            "segment": ["smb", "enterprise", None],
        }
    )


@transform(
    engine="pandas",
    input_mapping={"raw": Input(raw_customers)},
    output_mapping={"customers": Output(dataset=Dataset(alias="customers"), materialized=True)},
)
def customers(raw):
    region = str(Variable("sales_region"))
    logger.info(f"Tagging {len(raw)} customers with region {region}")
    raw["region"] = region
    return raw
```

- `raw_customers` has no alias, so its dataset is `raw_customers_result_<hex>`. Fine for
  a staging table nobody else reads.
- `str(Variable(...))`, in the body. `.get_value()` fails the run.
- Both transforms are pandas; mixing engines between chained transforms fails.

## Incremental load: append + a state watermark

`pipelines/events.py`. Each run appends only the rows after the last loaded id.

```python
import pandas as pd

from datazone import transform, Output, Dataset, logger


@transform(
    engine="pandas",
    output_mapping={"events": Output(dataset=Dataset(alias="events"), materialized=True, mode="append")},
)
def load_new_events(context):
    last_id = int(context.state.read(key="last_event_id", default="0"))

    # Stand-in for "SELECT ... WHERE event_id > :last_id" against a real source
    new = pd.DataFrame({"event_id": range(last_id + 1, last_id + 4), "kind": ["click", "view", "click"]})
    new["loaded_at"] = pd.Timestamp.now(tz="UTC").floor("s")
    new["loaded_at"] = new["loaded_at"].astype("datetime64[us, UTC]")

    logger.info(f"Appending {len(new)} events after id {last_id}")
    context.state.write(key="last_event_id", value=str(int(new["event_id"].max())), on="success")
    return new
```

Three runs gave 9 rows, ids 1–9, logged as `after id 0`, `after id 3`, `after id 6`.

- `on="success"` defers the write until the transform succeeds, so a failed run retries
  the same window instead of skipping it.
- State values are non-empty strings; keys match `^[A-Za-z0-9_-]+$`.
- Keep timestamps at microseconds (`datetime64[us]`). Datasets store microseconds; a
  nanosecond watermark compared against them lets the boundary row through again.
- `context` starts a Spark session even here, which adds ~15 s to a pandas run.

## A pipeline that depends on another pipeline, with `run_upstream`

`pipelines/report.py`, registered with `depends: [orders]` (see the config above).

```python
from pyspark.sql import functions as F

from datazone import transform, Input, Output, Dataset


@transform(
    input_mapping={
        "totals": Input(Dataset(alias="country_totals")),
        "customers": Input(Dataset(alias="customers", run_upstream=True, freshness_duration=5)),
    },
    output_mapping={"report": Output(dataset=Dataset(alias="report"), materialized=True)},
)
def build_report(totals, customers):
    return totals.crossJoin(customers.agg(F.count("*").alias("customer_count")))
```

What happened on three runs:

| Run | `customers` dataset age | Child executions |
|---|---|---|
| 1 | 4.5 min (fresh) | `Orders` |
| 2 | 6.5 min (stale) | `Customers` (selection `*customers`), `Orders` |
| 3 | 2 min (fresh) | `Orders` |

- `depends` runs `orders` in full every time. `country_totals` comes from it, so that
  input needs no `run_upstream`.
- `run_upstream` ran only the transform writing `customers` and its ancestors
  (`*customers`), and only when the data was older than `freshness_duration` minutes.
- The run waits in `WAITING_UPSTREAMS`; `datazone execution log` shows "Waiting for
  upstream executions..." and then the downstream's own log.
- Pushing this file before `orders` and `customers` had run once failed the deploy with
  `Dataset with alias country_totals does not exist.`
- With an upstream that failed, the downstream ended as `UPSTREAM_FAILURE` without
  starting.

## pandas reading a Spark-written dataset, with a helper module

`pipelines/labelled_totals.py` plus `pipelines/helpers.py` (not registered in
`config.yml`; it has no `@transform`).

```python
# pipelines/helpers.py
def label(total: float) -> str:
    return "big" if total > 100 else "small"
```

```python
# pipelines/labelled_totals.py
from datazone import transform, Input, Output, Dataset, logger


@transform(
    engine="pandas",
    input_mapping={"totals": Input(Dataset(alias="country_totals"))},
    output_mapping={"labelled": Output(dataset=Dataset(alias="labelled_totals"), materialized=True)},
)
def label_totals(totals):
    from pipelines.helpers import label

    totals["size"] = totals["total_amount"].map(label)
    logger.info(totals.to_dict("records"))
    return totals
```

- Datasets can be read by either engine, whoever wrote them.
- The whole repository is checked out at run time with its root on `sys.path`, so
  shared code imports by its path from the root. Use it in the body; in a decorator
  argument it is a `NameError` at deploy.

## Starter template

`assets/pipeline_template.py` (staging transform + aliased materialized output) was run
with `python_dependencies` and `spark_config: {deploy_mode: client, executor_instances:
1, extra_spark_config: {spark.sql.shuffle.partitions: "8"}}`. The Spark profile showed
one executor pod beside the driver and `spark.sql.shuffle.partitions = 8`; the
dependency was installed before the transforms ran ("Installed python dependencies.").
