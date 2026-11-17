from datazone import transform, Output


@transform(
    engine="pandas",
    output_mapping={"sales": Output(materialized=True)},
)
def demo_sales():
    """90 days of made-up sales, so the endpoints have something to read. Replace with your own data."""
    import datetime
    import random

    import pandas as pd

    rng = random.Random(42)
    start = datetime.date.today() - datetime.timedelta(days=89)
    rows = []
    for offset in range(90):
        day = start + datetime.timedelta(days=offset)
        for region in ["EU", "UK", "US", "APAC"]:
            for _ in range(rng.randint(1, 4)):
                rows.append(
                    {
                        "order_no": f"S-{len(rows) + 1:05d}",
                        "day": day,
                        "region": region,
                        "category": rng.choice(["Hardware", "Software", "Services"]),
                        "amount": round(rng.uniform(40, 900), 2),
                    }
                )
    return pd.DataFrame(rows)
