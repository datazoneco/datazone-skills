# Endpoint API reference

Load this when calling an endpoint, handing one to a consumer, or reading an error. The
rules are in `SKILL.md`. Checked on Datazone 1.8.0.

## Routes

All under `https://<your-host>/api/v1/endpoint`, with an `x-api-key` header.

| Route | Purpose |
|---|---|
| `GET /{slug}` | Call the endpoint. The only route a consumer needs |
| `GET /list?branch=<b>&filters=…` | Endpoints deployed on a branch (default `main`), each with its `definition` |
| `GET /get-by-id/{id}?branch=<b>` | One endpoint with its definition on a branch |
| `GET /playground/{id}?branch=<b>&<filters>` | Run a branch definition by endpoint id. **Not cached.** Returns a bare list |
| `POST /validate-template` | Render and run a query template before you deploy it. Body: `{project_id, query_template, filters, limit}`. Answers `{is_valid, error, rendered_query, preview_data}` with a 200 even when the SQL fails |
| `GET /{slug}/openapi.json`, `GET /{slug}/docs` | Generated spec and Swagger UI |
| `POST /create`, `DELETE /delete/{id}?branch=<b>` | Add or remove the YAML file and its `config.yml` entry as commits, then redeploy |

## Looking up a slug

```bash
curl -g -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/list?branch=main&filters=[name][\$eq]:Orders%20By%20Region&filters=[project.\$id][\$eq]:<project_id>"
```

```json
{"items": [{
  "id": "6afc8139233ea43405bba91b",
  "name": "Orders By Region",
  "file_path": "endpoints/orders-by-region.yml",
  "branches": ["main"],
  "definition": {
    "branch": "main",
    "slug": "orders-by-region-f9f216b7",
    "raw_content": "endpoint:\n  name: Orders By Region\n…",
    "content": {"name": "Orders By Region", "type": "query", "config": {"query": "…", "filters": […]}}
  }}],
 "total_count": 1}
```

The slug is `items[0].definition.slug`; there is no top-level slug. `id` is the endpoint
id, the same on every branch, and is what `get-by-id`, `playground` and `delete` take.

The CLI does the same: `datazone endpoint list --project-id <id> [--branch b]`, then
`datazone endpoint show <endpoint_id>`.

## Calling

```bash
curl -G -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/orders-by-region-f9f216b7" \
  --data-urlencode region=EU --data-urlencode "customers=O'Brien Ltd,Acme GmbH"
```

Use `--data-urlencode` (or your client's params encoder) for every value. A raw space,
`&`, `#` or `+` in the URL breaks or changes the call.

From the CLI: `datazone endpoint call <slug> --filter region=EU --filter limit_rows=2`.

## Response shapes

Every successful call is `200` with `{"records": [...]}`. Nothing else: no `total`,
`page` or `total_pages`, whatever the OpenAPI spec says.

| Type | Each record |
|---|---|
| `query` | One row, keyed by the column aliases of the `SELECT`. Dates come back as `"YYYY-MM-DD"` strings |
| `action` | Whatever dicts the action put in the list it returned |
| `vector` | `{"id": "<point uuid>", "score": <float>, "payload": {...}}` |

Vector `payload` for a dataset-backed vector:

```json
{"vector_index_id": "6afc81fe33966f79223b86bf", "document_id": "2", "chunk_index": 1,
 "index_id": "c08312d5-…", "source": "dataset", "dataset_id": "6afc81c4…",
 "dataset_name": "help_articles", "dataset_alias": "help_articles_d53586", "row_index": 1,
 "content": "Shipping times EU orders ship in 2 to 4 business days. …"}
```

`document_id` is the value of the vector's primary-key column, as a string. `content` is
the text columns joined with spaces.

`playground` returns the bare list, without the `records` wrapper.

## Errors

Every error body has the same shape:

```json
{"message": "Filter 'foo' not found in endpoint definition.", "detail": {}, "error_class": "BadRequestError"}
```

| Status | `error_class` | When |
|---|---|---|
| 400 | `BadRequestError` | Query: a parameter that is not a declared filter. Action: a missing required or an unknown parameter. Vector: no `query`, or a non-numeric `limit` / `score_threshold` (since 1.8; was 500) |
| 400 | `DatazoneReaderQueryError` | ClickHouse rejected the rendered SQL. `detail.message` holds ClickHouse's error, including the SQL |
| 400 | `DatazoneQueryError` | The rendered SQL is not a `SELECT` |
| 401 | `MissingTokenError` | No `x-api-key` header |
| 403 | `PermissionDenied` | The key or user lacks a permission; see "Access" |
| 404 | `EndpointNotFoundError` | No definition has this slug, for example after the endpoint was removed |
| 422 | `RequestValidationError` | `page` or `page_size` is not an integer |
| 422 | `UnexpectedResponse` | Vector `limit=0` |
| 500 | `ValidationError` | `page=0` or `page_size=0` |
| 500 | `ActionExecutionFailedError` | The action raised. `message` contains the exception, traceback, stdout and stderr |
| 500 | `ActionEndpointResultMustBeListError` | The action returned something other than a list |

The action error text goes to whoever called the endpoint. Do not print secrets in an
action, and raise messages you are happy for consumers to read.

## Access

A call runs as the API key's user. Since 1.8 an API key can be limited to scopes. What
each endpoint type needs, checked with scoped keys:

| Call | Scopes needed |
|---|---|
| Query endpoint | `endpoint:invoke` |
| Action endpoint | `endpoint:invoke` and `action:invoke` |
| Vector endpoint | `endpoint:invoke` and `vector:read` |
| `GET /endpoint/list` (slug lookup) | `endpoint:read` |

- **A missing `action:invoke` or `vector:read` is a 403 on the call**, not at deploy. The
  message is about the action (`You do not have permission to execute this action.`) or
  the vector, not the endpoint.
- **Without `endpoint:read`, `/endpoint/list` returns `{"items": [], "total_count": 0}`**,
  not a 403. Give a consumer the slug, or add `endpoint:read`.
- **A query endpoint needs no dataset scope.** The SQL runs with the user's own database
  grants, which scopes do not narrow.
- **Scopes limit API actions, not data.** To limit what a consumer can read, issue the
  key from a user whose roles grant only those datasets.

Create a scoped key for a consumer with `POST /api-key/create` and
`{"name": "...", "expiration": "90d", "scopes": ["endpoint:invoke"]}`. The response is the
key itself, shown once. `datazone api-key create` takes no scopes. See the
`datazone-settings` skill.

## Generated OpenAPI

- **The spec's description holds the full query template.** Keep secrets and sensitive
  literals out of the query.
- **`servers` is always `https://app.datazone.co`.** On any other deployment, Swagger's
  "Try it out" and generated clients call the wrong host. Override the base URL.
- **The response schema promises `total`, `page`, `page_size` and `total_pages`** as
  required fields. They never come back. Only rely on `records`.
- **`page`, `page_size` and `sort_by` are listed** for every endpoint, and do nothing.
- **Query endpoints list their filters.** `optional: false` shows as `required: true`, and
  `enum` filters show their values, but neither is enforced.
- **Action endpoints list the function's parameters**, with Python type hints mapped to
  OpenAPI types and defaults as strings (`"False"`, `"0"`).
- **Vector endpoints list no parameters at all**: `query`, `limit` and `score_threshold`
  are missing. Document them for the consumer yourself.

## Caching

`GET /{slug}` caches query results for one hour, per user, endpoint definition, and
rendered SQL. Action and vector calls are not cached. `playground` is never cached, so use
it (or `datazone endpoint playground <id> --filter k=v`) to check fresh data during
development.

## Branches

Every branch a project is pushed to gets its own definition and its own slug. Deleting
the branch does not remove them: the branch's slugs keep answering with the last
definition pushed there, which can be broken. A branch definition goes away only when
its file is removed from `config.yml` on that branch.
