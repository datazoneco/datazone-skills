"""<One line: what this pipeline produces, from which datasets.>

Register it in config.yml (see assets/config.yml), push, then check the deploy
activity before running it. Replace every <...> placeholder.
"""

from pyspark.sql import functions as F

from datazone import transform, Input, Output, Dataset, logger

# Module-level names are fine in function BODIES, never in decorator arguments.


@transform(
    input_mapping={"source_df": Input(Dataset(alias="<source_alias>"))},
)
def clean(source_df):
    # Not materialized: kept in memory for the next transform in this run only.
    return source_df.dropDuplicates()


@transform(
    input_mapping={"clean_df": Input(clean)},  # must be defined above this one
    output_mapping={
        # Set an alias, or the dataset gets <name>_<random hex> as its table name.
        "result": Output(dataset=Dataset(alias="<result_alias>"), materialized=True),
    },
)
def build_result(clean_df):
    logger.info("Building <result_alias>")
    return clean_df.withColumn("loaded_at", F.current_timestamp())
