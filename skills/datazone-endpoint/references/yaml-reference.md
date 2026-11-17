# Endpoint YAML reference

Load this when writing an endpoint file or reading a deploy error. The rules and gotchas
are in `SKILL.md`. Taken from the backend model on Datazone 1.8.0 and checked on a
deployment.

## File shape

One endpoint per file, as a mapping under a top-level `endpoint:` key. Register each file
in `config.yml`:

```yaml
# config.yml
endpoints:
  - path: endpoints/orders-by-region.yml   # `path` is the only key
```

The extension can be `.yml` or `.yaml`. Endpoints created in the UI or with
`POST /endpoint/create` are written to `endpoints/<name>_<6 hex>.yaml`.

## `endpoint`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name, and the base of the slug. Synced from the default branch only |
| `type` | `query` \| `action` \| `vector` | no | `query` | Decides which `config` shape is accepted |
| `config` | mapping | yes | | One of the three shapes below |

Any other key under `endpoint:` is ignored.

## `config` for `type: query`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | | Jinja2 template. Rendered SQL must be a `SELECT` (a `WITH … SELECT` is fine) |
| `filters` | list of filter | no | `null` | The only query-string parameters the call accepts |

## `config` for `type: action`

| Field | Type | Required | Notes |
|---|---|---|---|
| `action_id` | ObjectId string | yes | The action's id. Not checked at deploy, so a wrong id fails at call time |

No `filters`. The parameters come from the action function's signature.

## `config` for `type: vector`

| Field | Type | Required | Notes |
|---|---|---|---|
| `vector_id` | ObjectId string | yes | Not checked at deploy |
| `filters` | list of filter | no | Accepted, but **not applied, validated, or listed in the OpenAPI spec** |

The call takes `query` (required), `limit` (default 10) and `score_threshold`.

## Filter

| Field | Type | Required | Default | Validation |
|---|---|---|---|---|
| `name` | string | yes | | At least 3 characters; `^[a-zA-Z0-9_-]+$` |
| `type` | enum | yes | | `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `enum` |
| `optional` | bool | no | `true` | Only marks the parameter `required` in the OpenAPI spec |
| `possible_values` | list of strings | no | `null` | Only lists the values in the OpenAPI spec |

At call time none of `type`, `optional` or `possible_values` is enforced. The value is
the raw query-string text, a missing filter is undefined in the template, and a filter
named `page`, `page_size` or `sort_by` never reaches the template.

`type` sets the OpenAPI schema only:

| `type` | OpenAPI schema |
|---|---|
| `string` | `string` |
| `integer` | `integer` |
| `float` | `number` |
| `boolean` | `boolean` |
| `date` | `string`, format `date` |
| `datetime` | `string`, format `date-time` |
| `enum` | `string` with `enum: possible_values` |

**Duplicate names (case-insensitive) are rejected only by `POST /endpoint/create`.** A
pushed file with both `Region` and `region` deploys. Avoid it: matching at call time is
case-sensitive, so the two act as separate parameters.

## Validation errors

A pushed file is checked in the deploy's `VALIDATE_SYNTAX` step. One bad endpoint file
fails the whole deploy. Nothing in that commit is loaded, and the endpoints keep their
last good definitions. Read the error from `GET /project/activities/<project_id>`:
`items[0].deploy_steps[].errors[]` has `message` and `path`.

| File content | Error message |
|---|---|
| List form (`endpoints: - name: …`) or no `endpoint` key | `Endpoint file must contain a top-level 'endpoint' mapping.` |
| `config: {}` or a missing `query` / `action_id` / `vector_id` | `3 validation errors for EndpointContent` then `config.QueryConfig.query Field required`, `config.ActionConfig.action_id Field required`, `config.VectorConfig.vector_id Field required` |
| `type: action` with a query config | `Value error, Action type endpoints must have ActionConfig` (likewise `Query…QueryConfig`, `Vector…VectorConfig`) |
| Filter name `id` | `config.QueryConfig.filters.0.name String should have at least 3 characters` |
| Filter name with a space or `.` | `String should match pattern '^[a-zA-Z0-9_-]+$'` |
| Unknown filter `type` | `Input should be 'string', 'integer', 'datetime', 'date', 'float', 'boolean' or 'enum'` |

When a config shape does not match, pydantic reports the error against every member of
the union, so expect noise about `ActionConfig` and `VectorConfig` under a query
endpoint. Read the line for the shape you meant.

**API writes that reload the project return 422.** Since 1.8, `POST /endpoint/create`, and
other API calls that write to the repository and redeploy, answer an invalid endpoint
file anywhere in the project with:

```json
HTTP 422
{"message": "Endpoint file is not valid.",
 "detail": {"file_path": "endpoints/broken.yml",
            "error": "3 validation errors for EndpointContent\nconfig.QueryConfig.query\n  Field required …"},
 "error_class": "InvalidEndpointContentError"}
```

The 422 comes back **after** the write was committed. A `POST /endpoint/create` that
answers 422 has still added its file and its `config.yml` entry, so pull before you retry,
or you create a duplicate. Before 1.8 the same case returned a bare 500.

## Not checked at deploy

These deploy cleanly and fail when called:

- Table names in the SQL. A missing table returns 400 `DatazoneReaderQueryError` with
  ClickHouse's `UNKNOWN_TABLE` message.
- A non-`SELECT` query. It returns 400 `DatazoneQueryError`, `"Only SELECT queries are allowed."`
- Jinja that renders bad SQL.
- `action_id` and `vector_id`.

Render and run the template before you push: `datazone endpoint validate "<sql>"
--project-id <id> --filters '{"region": "EU"}'`, or `POST /endpoint/validate-template`.
