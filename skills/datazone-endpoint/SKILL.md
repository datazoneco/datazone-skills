---
name: datazone-endpoint
description: Use when creating or debugging a Datazone Endpoint — a YAML-defined REST API over a dataset query, action, or vector search. Triggers on "datazone endpoint", "expose this query as an API", editing a file registered under `endpoints:` in config.yml, endpoint filters, or calling an endpoint by slug.
---

# Building Datazone endpoints

An endpoint turns a SQL query, an action, or a vector search into an authenticated REST
API with generated OpenAPI docs. It is defined in YAML in your project repository.

## The workflow

1. Write the endpoint YAML (convention: `endpoints/<name>.yml`)
2. Register it in `config.yml` under `endpoints:`
3. `git add`, `git commit`, `git push`
4. Look up the generated slug (see "Calling an endpoint"). You need it to call the endpoint

```yaml
# config.yml
endpoints:
  - path: endpoints/top-customers.yml
```

## One endpoint per file, under a top-level `endpoint` key

Each file declares exactly one endpoint, as a mapping under `endpoint:`. The older list
form (`endpoints:` followed by `- name: …`) fails the deploy with *"Endpoint file must
contain a top-level 'endpoint' mapping."*

## A query endpoint

```yaml
endpoint:
  name: Top Customers
  type: query
  config:
    query: |
      SELECT customer_name, sum(amount) AS revenue
      FROM orders
      WHERE region = '{{ region | replace("\\", "\\\\") | replace("'", "\\'") }}'
      {% if min_amount %}AND amount >= {{ min_amount | float }}{% endif %}
      GROUP BY customer_name
      ORDER BY revenue DESC
    filters:
      - name: region
        type: string
        optional: false
      - name: min_amount
        type: float
```

`type` is `query` (default), `action`, or `vector`.

## Filters

Filters become query-string parameters on the generated API, and are available in the
query template by name.

| Key | Notes |
|---|---|
| `name` | **Minimum 3 characters**, and only `a-z A-Z 0-9 _ -` |
| `type` | `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `enum` |
| `optional` | Defaults to `true` |
| `possible_values` | List of allowed values, for `enum` |

Filter names must be unique **case-insensitively** — `Region` and `region` collide and
fail the deploy. A parameter that is not a declared filter returns 400.

### The query is a Jinja2 template, and you do the quoting

The query is rendered with plain Jinja2 and the result goes to ClickHouse as-is. **Filter
values are not quoted, escaped or type-checked.** The declared `type` documents the
parameter but is not enforced. This has consequences:

- **Strings need quotes.** `WHERE region = {{ region }}` renders as `WHERE region = EU`,
  which fails as an unknown identifier.
- **Quotes alone are not enough.** With `'{{ region }}'`, a value containing `'` rewrites
  the query. Escape backslashes, then quotes:
  `'{{ v | replace("\\", "\\\\") | replace("'", "\\'") }}'`.
- **Numbers go through a filter.** Use `{{ v | int }}` or `{{ v | float }}`. A non-numeric
  value then renders as `0` instead of as SQL.
- **Optional filters need a guard.** Wrap the clause in `{% if name %}…{% endif %}`.
  Otherwise an absent filter renders as an empty string in the middle of the SQL.

Treat every filter as untrusted, because anyone who can invoke the endpoint controls it.

### Several values, and paging

- **A repeated parameter keeps only its last value.** `?country=TR&country=DE` renders as
  `DE`. Pass a comma-separated string and split it in SQL:
  `WHERE has(splitByChar(',', '{{ countries | replace("\\", "\\\\") | replace("'", "\\'") }}'), country)`.
- **Page in the SQL, with your own filters.** The route accepts `page`, `page_size` and
  `sort_by`, but ignores them (see "Calling an endpoint"). Declare filters such as
  `limit_rows` and `offset_rows`, and end the query with
  `LIMIT {{ (limit_rows or 50) | int }} OFFSET {{ (offset_rows or 0) | int }}`. A filter
  named `page`, `page_size` or `sort_by` never reaches the template.
- **Results are capped** at the deployment's query row limit (`DATASET_QUERY_ROW_LIMIT`, 500
  on dev). A larger `LIMIT` is clamped to it.

## Action and vector endpoints

```yaml
endpoint:
  name: Send Report
  type: action
  config:
    action_id: 68f1a2b3c4d5e6f7a8b9c0d1
```

```yaml
endpoint:
  name: Search Docs
  type: vector
  config:
    vector_id: 68f1a2b3c4d5e6f7a8b9c0d1
    filters:
      - name: category
        type: string
```

The `config` shape must match `type`, or the deploy fails. `action` takes only
`action_id` — no filters.

How action endpoints behave:

- **Every query parameter except `page`, `page_size` and `sort_by` is passed to the action
  as a string.** The action's type hints are not applied: `year: int` receives `"2024"`,
  and `flag: bool` receives `"false"`, which is truthy. Convert the values inside the action.
- **A missing required parameter returns 400** and names the parameter.
- **The action must return a list**, which becomes `records`. Returning a dict fails the
  call.
- **`page` and `page_size` are ignored**, and the whole list comes back. If the list can
  be large, take your own `limit_rows` / `offset_rows` parameters and page inside the action.
- **The call is synchronous, with a 300s limit.** For longer work, use a flow.

## Calling an endpoint

Each endpoint gets a slug made of its name plus a random suffix, for example
`top-customers-9f3a2b1c`. The suffix is random, so **you cannot predict the URL**; it
stays the same across later deploys. **Each branch gets its own slug**, so the same file
deployed on `feat` and `main` has two URLs. After a deploy, look the slug up by name and
branch:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/list?branch=main&filters=[name][\$eq]:Top%20Customers&filters=[project.\$id][\$eq]:<project_id>"
# → items[0].definition.slug  (the top-level slug field is empty)
```

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/top-customers-9f3a2b1c?region=EU&page=1&page_size=50"
```

The call is `GET` only, and the response is always `{"records": [...]}`.

Query parameters:

| Parameter | Notes |
|---|---|
| *filter names* | One per declared filter. An undeclared name returns 400 |
| `page`, `page_size`, `sort_by` | Accepted and validated (≥ 1), then **ignored** for every endpoint type. Order and page in the SQL |

**Query results are cached for one hour**, per user and per rendered query. A second call
with the same filters returns the first answer even if the underlying data changed, for
example after a view refresh or a pipeline run. When a caller needs fresh data, give it a
filter that changes the rendered SQL, such as the source's `last_sync_at`, placed in a
comment:

```yaml
    query: |
      SELECT … FROM budget_plan
      {% if synced_at %}/* {{ synced_at | replace("*/", "") }} */{% endif %}
    filters:
      - name: synced_at
        type: string
```

## Generated documentation

Every endpoint publishes its own OpenAPI spec and Swagger UI:

```
https://<your-host>/api/v1/endpoint/<slug>/openapi.json
https://<your-host>/api/v1/endpoint/<slug>/docs
```

Point client generators at the `openapi.json` rather than hand-writing a client.

## Gotchas

- **The file needs a single top-level `endpoint:` mapping.** The list form fails the deploy.
- **Filter values are pasted into the SQL unquoted and unescaped.** Quote and escape them
  in the template.
- **`page`, `page_size` and `sort_by` do nothing.** Page and sort in the SQL.
- **A repeated parameter keeps its last value.** Pass lists comma-separated.
- **Query results are cached for an hour** per user and rendered query, so they can be stale
  right after the data changes.
- **Filter names shorter than 3 characters fail validation.** `id` is rejected; `key` is
  fine.
- **Slugs are unpredictable and differ per branch.** Look a slug up after deploy
  (`definition.slug`) rather than guessing it.
- **Renaming an endpoint does not change its slug.** The slug is generated once, on
  insert.
- **Removing the entry from `config.yml` deletes the endpoint**, and its slug is gone for
  good. Redeploying mints a new slug and breaks existing callers.
- **Bound datasets are not validated at deploy.** A query that references a missing table
  deploys fine and fails at call time.

## Verifying

Check deploy status on the project page, or:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/list?branch=main&filters=[project.\$id][\$eq]:<project_id>"
```

Then call the endpoint once with realistic filter values, including one that contains a
`'`.

## Related

- `datazone-api` — auth, filtering, and pagination conventions across the whole API
- `datazone-project-setup` — the deploy loop

Official docs: https://docs.datazone.co/reference/integration/endpoints
