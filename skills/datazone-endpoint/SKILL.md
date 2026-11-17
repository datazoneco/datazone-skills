---
name: datazone-endpoint
description: Use when creating or debugging a Datazone Endpoint — a YAML-defined REST API over a dataset query, action, or vector search. Triggers on "datazone endpoint", "expose this query as an API", editing a file registered under `endpoints:` in config.yml, endpoint filters, calling an endpoint by slug, an endpoint returning 400/403/422, or an API key scoped to `endpoint:invoke`.
---

# Building Datazone endpoints

An endpoint turns a SQL query, an action, or a vector search into an authenticated REST
API with generated OpenAPI docs. It is defined in YAML in your project repository.

## The workflow

1. Make sure what the endpoint reads exists: the dataset's **alias** for a query, the
   deployed action's **id**, or the indexed vector's **id**
2. Write the endpoint YAML (convention: `endpoints/<name>.yml`)
3. Register it in `config.yml` under `endpoints:`
4. `git add`, `git commit`, `git push`, then check the deploy succeeded
5. Look up the generated slug (see "Calling an endpoint"). You need it to call the endpoint

```yaml
# config.yml
endpoints:
  - path: endpoints/orders-by-region.yml
```

Copy a tested file from `examples/` rather than starting from scratch.

## One endpoint per file, under a top-level `endpoint` key

Each file declares exactly one endpoint, as a mapping under `endpoint:`. The older list
form (`endpoints:` followed by `- name: …`) fails the deploy with *"Endpoint file must
contain a top-level 'endpoint' mapping."*

## A query endpoint

```yaml
endpoint:
  name: Orders By Region
  type: query
  config:
    query: |
      SELECT order_id, order_date, customer_name, amount
      FROM orders_7d8caa
      WHERE region = '{{ region | replace("\\", "\\\\") | replace("'", "\\'") }}'
      {% if min_amount %}AND amount >= {{ min_amount | float }}{% endif %}
      ORDER BY order_date, order_id
      LIMIT {{ (limit_rows or 50) | int }} OFFSET {{ (offset_rows or 0) | int }}
    filters:
      - name: region
        type: string
        optional: false
      - name: min_amount
        type: float
      - name: limit_rows
        type: integer
      - name: offset_rows
        type: integer
```

`type` is `query` (default), `action`, or `vector`. The rendered SQL must be a `SELECT`
(`WITH … SELECT` is fine). Anything else returns 400 *"Only SELECT queries are allowed."*

### The table name is the dataset's alias

A materialized pipeline output named `orders` gets an alias like `orders_7d8caa`, and that
alias is the table name. Look it up (`GET /dataset/list?filters=[project.$id][$eq]:<id>` →
`items[].alias`) and use it. **A bare `FROM orders` can resolve to a different table**
that the user can read, from another project, and return the wrong data without an error.

## Filters

Filters become query-string parameters on the generated API, and are available in the
query template by name.

| Key | Notes |
|---|---|
| `name` | **Minimum 3 characters**, and only `a-z A-Z 0-9 _ -` |
| `type` | `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `enum` |
| `optional` | Defaults to `true` |
| `possible_values` | List of allowed values, for `enum` |

**`type`, `optional: false` and `possible_values` only document the parameter.** None of
them is enforced when the endpoint is called. A missing required filter is undefined in
the template, so `WHERE region = '{{ region }}'` becomes `WHERE region = ''` and the call
returns `{"records": []}` with a 200. An enum value outside `possible_values` passes
through the same way. Check required values in the SQL if an empty result would mislead
the caller.

A parameter that is not a declared filter returns 400.

Keep filter names unique, ignoring case. `Region` and `region` are rejected only when
the endpoint is created through the API; a pushed file deploys with both, and they then
act as two separate parameters.

### The query is a Jinja2 template, and you do the quoting

The query is rendered with plain Jinja2 and the result goes to ClickHouse as-is. **Filter
values are not quoted, escaped or type-checked.** This has consequences:

- **Strings need quotes.** `WHERE region = {{ region }}` renders as `WHERE region = EU`,
  which fails as an unknown identifier.
- **Quotes alone are not enough.** With `'{{ region }}'`, a value containing `'` rewrites
  the query. Escape backslashes, then quotes:
  `'{{ v | replace("\\", "\\\\") | replace("'", "\\'") }}'`.
- **Numbers go through a filter.** Use `{{ v | int }}` or `{{ v | float }}`. A non-numeric
  value then renders as `0` instead of as SQL. Remember that `0` is then a real bound:
  `min_amount=abc` keeps every row.
- **Optional filters need a guard.** Wrap the clause in `{% if name %}…{% endif %}`.
  Otherwise an absent filter renders as an empty string in the middle of the SQL.
- **Dates are strings too.** Quote and escape them, then convert:
  `toDate('{{ since | replace("\\", "\\\\") | replace("'", "\\'") }}')`.

Treat every filter as untrusted, because anyone who can invoke the endpoint controls it.

### Several values, and paging

- **A repeated parameter keeps only its last value.** `?country=TR&country=DE` renders as
  `DE`. Pass a comma-separated string and split it in SQL:
  `WHERE has(splitByChar(',', '{{ countries | replace("\\", "\\\\") | replace("'", "\\'") }}'), country)`.
- **Page in the SQL, with your own filters.** The route accepts `page`, `page_size` and
  `sort_by`, but ignores them. Declare filters such as `limit_rows` and `offset_rows`, and
  end the query with
  `LIMIT {{ (limit_rows or 50) | int }} OFFSET {{ (offset_rows or 0) | int }}`. A filter
  named `page`, `page_size` or `sort_by` never reaches the template.
- **Results are capped** at the deployment's query row limit (`DATASET_QUERY_ROW_LIMIT`, 500
  on dev). A larger `LIMIT` is clamped to it.

## Action endpoints

```yaml
endpoint:
  name: Customer Totals
  type: action
  config:
    action_id: 6afc817f233ea43405bba945
```

`action` takes only `action_id`: no filters. The parameters are the action function's
arguments. **Deploy the action first and look up its id** (`GET /action/list`): endpoints
load before actions, and the id does not exist until the action has deployed once. The id
stays the same across branches, so one file works on every branch.

```python
# actions/customer_totals.py — excerpt; the full file is examples/customer_totals.py
from datazone.actions import action, execute_query

@action
def customer_totals(region: str, min_total: float = 0, include_orders: bool = False):
    min_total = float(min_total)                         # every parameter is a string
    include_orders = str(include_orders).lower() == "true"
    ...
    return records                                       # must be a list
```

How action endpoints behave:

- **Every parameter is passed to the action as a string.** The type hints are not
  applied: `year: int` receives `"2024"`, and `flag: bool` receives `"false"`, which is
  truthy. Convert the values inside the action.
- **A missing required parameter returns 400**, and so does a parameter the function does
  not take. Both messages name the parameter.
- **The action must return a list**, which becomes `records`. Returning a dict is a 500,
  *"must return a list for endpoint usage. Got dict instead."*
- **An exception in the action is a 500** whose `message` carries the exception text,
  traceback, stdout and stderr. The caller sees all of it, so never print secrets.
- **`page` and `page_size` are ignored**, and the whole list comes back. If the list can
  be large, take your own `limit_rows` / `offset_rows` parameters and page inside the action.
- **The call is synchronous, with a 300s limit.** For longer work, use a flow.

## Vector endpoints

```yaml
endpoint:
  name: Search Help Articles
  type: vector
  config:
    vector_id: 6afc81fe33966f79223b86bf
```

The vector must exist and be `INDEXED`. Vectors are not declared in the repository:
create one in the UI or with `POST /vector/create`, and take its id from `GET /vector/list`.

- **The call takes exactly `query` (required), `limit` (default 10) and
  `score_threshold`.** Anything else is ignored silently, without a 400.
- **`filters` under a vector config do nothing.** They deploy, but are neither applied nor
  validated nor listed in the OpenAPI spec.
- **A non-numeric `limit` or `score_threshold` returns 400** (since 1.8; it was a 500).
  `limit=0` returns 422.
- **Each record is `{id, score, payload}`**, and `payload.content` is the matched text.
- **Check real scores before picking `score_threshold`.** Cosine scores on short text are
  often well below 0.5, so a threshold copied from elsewhere can return nothing.

## Calling an endpoint

Each endpoint gets a slug made of its name plus a random suffix, for example
`orders-by-region-f9f216b7`. The suffix is random, so **you cannot predict the URL**; it
stays the same across later deploys. **Each branch gets its own slug**, so the same file
deployed on `feat` and `main` has two URLs. After a deploy, look the slug up by name and
branch:

```bash
curl -g -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/list?branch=main&filters=[name][\$eq]:Orders%20By%20Region&filters=[project.\$id][\$eq]:<project_id>"
# → items[0].definition.slug
```

```bash
curl -G -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/orders-by-region-f9f216b7" \
  --data-urlencode region=EU --data-urlencode "customers=O'Brien Ltd,Acme GmbH"
```

The call is `GET` only, and a success is always `{"records": [...]}`. Errors are
`{"message", "detail", "error_class"}`. Status codes, response shapes and every route:
`references/api-reference.md`.

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

During development, use `datazone endpoint playground <endpoint_id> --filter k=v`, which
is never cached.

## API keys and access

The call runs as the API key's user. Since 1.8 a key can be limited to scopes:

- **Query endpoint:** `endpoint:invoke`.
- **Action endpoint:** `endpoint:invoke` **and** `action:invoke`. Without it the call is a
  403 about the action, not the endpoint.
- **Vector endpoint:** `endpoint:invoke` **and** `vector:read`.
- **Slug lookup:** `endpoint:read`. Without it, `/endpoint/list` returns an empty list,
  not a 403, so give a consumer the slug itself.

**Scopes limit API actions, not data.** The SQL runs with the key user's own database
grants. To limit what a consumer can read, issue its key from a user whose roles grant
only the datasets the endpoint needs.

## Generated documentation

Every endpoint publishes its own OpenAPI spec and Swagger UI:

```
https://<your-host>/api/v1/endpoint/<slug>/openapi.json
https://<your-host>/api/v1/endpoint/<slug>/docs
```

Before pointing a client generator at the spec, know that it hardcodes
`servers` to `https://app.datazone.co`, promises `total` / `page` fields that never come
back, and lists no parameters for vector endpoints. Details:
`references/api-reference.md`.

## Deploy errors

A pushed file is validated in the deploy's `VALIDATE_SYNTAX` step. **One invalid endpoint
file fails the whole deploy**, and nothing in that commit is loaded. Read the error, with
the file path, from `GET /project/activities/<project_id>` → `items[0].deploy_steps`.

API calls that write to the repository and redeploy, such as `POST /endpoint/create`,
return **422 `InvalidEndpointContentError`** when any endpoint file in the project is
invalid. `detail.file_path` names the file (since 1.8; it was a 500). The write has
already been committed by then, so pull before retrying.

Every validation error, and what deploys fine but fails at call time:
`references/yaml-reference.md`.

## Gotchas

- **The file needs a single top-level `endpoint:` mapping.** The list form fails the deploy.
- **The table name is the dataset alias with its suffix.** A bare name can silently read
  another project's table.
- **Filter values are pasted into the SQL unquoted and unescaped.** Quote and escape them
  in the template.
- **`optional: false` and `possible_values` are not enforced.** A missing required filter
  renders as empty and returns no rows.
- **`page`, `page_size` and `sort_by` do nothing.** Page and sort in the SQL. `page=0`
  returns a 500, not a 400.
- **A repeated parameter keeps its last value.** Pass lists comma-separated.
- **Query results are cached for an hour** per user and rendered query, so they can be stale
  right after the data changes.
- **Filter names shorter than 3 characters fail validation.** `id` is rejected; `key` is
  fine.
- **Action parameters are strings; unknown ones are a 400.** Vector endpoints ignore
  unknown parameters instead.
- **The action must deploy before the endpoint that points at it.** Use two pushes.
- **Slugs are unpredictable and differ per branch.** Look a slug up after deploy
  (`definition.slug`) rather than guessing it.
- **Renaming an endpoint does not change its slug.** The slug is generated once, on
  insert.
- **Removing the entry from `config.yml` deletes the endpoint** on that branch, and its
  slug is gone for good. Redeploying mints a new slug and breaks existing callers.
- **Deleting a branch does not delete its endpoints.** Its slugs keep answering.
- **Bound datasets, action ids and vector ids are not validated at deploy.** A query that
  references a missing table deploys fine and fails at call time.

## Verifying

Render and run a query template before you push:

```bash
datazone endpoint validate "SELECT * FROM orders_7d8caa WHERE region = '{{ region }}'" \
  --project-id <project_id> --filters '{"region": "EU"}'
```

After pushing, check the deploy (`datazone project activities list <project_id>`, or
`GET /project/activities/<project_id>`), then find the slug and call it:

```bash
datazone endpoint list --project-id <project_id>
datazone endpoint call <slug> --filter region=EU
```

Call it once with realistic filter values, including one that contains a `'`, once with a
required filter missing, and once with an undeclared parameter, which must return 400.

## Reference

- `references/yaml-reference.md` — every field with type, default and validation; deploy errors and their messages; what is only checked at call time
- `references/api-reference.md` — routes, slug lookup, response shapes, status codes and error bodies, API key scopes, OpenAPI caveats, caching, branches
- `examples/query-endpoint.yml` — filters, quoting and escaping, a comma-separated list, `| int` / `| float`, paging in SQL
- `examples/action-endpoint.yml` with `examples/customer_totals.py` — an action endpoint and the action it calls
- `examples/vector-search-endpoint.yml` — a vector search endpoint

Each example carries its `config.yml` entry, a `curl` call and a trimmed real response.

## Related

- `datazone-api` — auth, filtering, and pagination conventions across the whole API
- `datazone-project-setup` — the deploy loop
- `datazone-pipeline` — producing the dataset a query endpoint reads
- `datazone-settings` — API keys and their scopes

Official docs: https://docs.datazone.co/reference/integration/endpoints
