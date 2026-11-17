# Action called by action-endpoint.yml. Lives at actions/customer_totals.py.
#
# config.yml:
#   actions:
#     - path: actions/customer_totals.py
#
# Every endpoint parameter reaches the function as a string, whatever its type hint says,
# so convert each one. The function must return a list.
from datazone.actions import action, execute_query

REGIONS = {"EU", "US", "APAC"}


@action
def customer_totals(region: str, min_total: float = 0, include_orders: bool = False,
                    limit_rows: int = 20, offset_rows: int = 0):
    """Revenue per customer in a region, largest first."""
    # Endpoint parameters arrive as strings, whatever the type hints say.
    if region not in REGIONS:
        raise ValueError(f"region must be one of {sorted(REGIONS)}")
    min_total = float(min_total)
    include_orders = str(include_orders).lower() == "true"   # "false" is truthy
    limit_rows, offset_rows = int(limit_rows), int(offset_rows)

    rows = execute_query(
        f"""
        SELECT customer_name, sum(amount) AS total, count() AS orders
        FROM orders_7d8caa
        WHERE region = '{region}'
        GROUP BY customer_name
        HAVING total >= {min_total}
        ORDER BY total DESC, customer_name
        """
    ).data

    records = []
    for row in rows[offset_rows:offset_rows + limit_rows]:
        record = {"customer_name": row["customer_name"], "total": row["total"]}
        if include_orders:
            record["orders"] = row["orders"]
        records.append(record)
    return records   # must be a list
