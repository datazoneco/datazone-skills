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
4. Find the generated slug in the UI — you need it to call the endpoint

```yaml
# config.yml
endpoints:
  - path: endpoints/top-customers.yml
```

## One endpoint per file

The file format takes a list, but **the loader keys stored endpoints on the file path**,
so when a file declares several endpoints only the last one survives the deploy. Put
each endpoint in its own file until this changes.

## A query endpoint

```yaml
endpoints:
  - name: Top Customers
    type: query
    config:
      query: |
        SELECT customer_name, sum(amount) AS revenue
        FROM orders
        WHERE region = {{ region }}
        GROUP BY customer_name
        ORDER BY revenue DESC
      filters:
        - name: region
          type: string
          optional: false
```

`type` is `query` (default), `action`, or `vector`.

## Filters

Filters become query-string parameters on the generated API, and are interpolated into
the SQL as `{{ name }}`.

| Key | Notes |
|---|---|
| `name` | **Minimum 3 characters**, and only `a-z A-Z 0-9 _ -` |
| `type` | `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `enum` |
| `optional` | Defaults to `true` |

Filter names must be unique **case-insensitively** — `Region` and `region` collide and
fail the deploy.

## Action and vector endpoints

```yaml
endpoints:
  - name: Send Report
    type: action
    config:
      action_id: 68f1a2b3c4d5e6f7a8b9c0d1
```

```yaml
endpoints:
  - name: Search Docs
    type: vector
    config:
      vector_id: 68f1a2b3c4d5e6f7a8b9c0d1
      filters:
        - name: category
          type: string
```

The `config` shape must match `type`, or the deploy fails. `action` takes only
`action_id` — no filters.

## Calling an endpoint

Each endpoint gets a slug generated from its name plus a random suffix, for example
`top-customers-9f3a2b1c`. **The suffix is random, so you cannot predict the URL** — read
it from the UI after the first deploy. It is stable across later deploys.

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/top-customers-9f3a2b1c?region=EU&page=1&page_size=50"
```

Query parameters:

| Parameter | Default | Notes |
|---|---|---|
| `page` | `1` | Must be ≥ 1 |
| `page_size` | `20` | Must be ≥ 1 |
| `sort_by` | – | Field name; prefix with `-` for descending |
| *filter names* | – | One per declared filter |

## Generated documentation

Every endpoint publishes its own OpenAPI spec and Swagger UI:

```
https://<your-host>/api/v1/endpoint/<slug>/openapi.json
https://<your-host>/api/v1/endpoint/<slug>/docs
```

Point client generators at the `openapi.json` rather than hand-writing a client.

## Gotchas

- **Only the last endpoint in a file is kept.** One per file.
- **Filter names shorter than 3 characters fail validation** — `id` is rejected, `key`
  is fine.
- **Slugs are unpredictable.** Do not hardcode a guessed slug; read it after deploy.
- **Renaming an endpoint does not change its slug** — the slug is generated once, on
  insert.
- **Removing the entry from `config.yml` deletes the endpoint**, and its slug is gone
  for good; redeploying mints a new one and breaks existing callers.
- Bound datasets are not validated at deploy — a query referencing a missing table
  deploys fine and fails at call time.

## Verifying

Check deploy status on the project page, or:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/endpoint/list?filters=[project.\$id][\$eq]:<project_id>"
```

## Related

- `datazone-api` — auth, filtering, and pagination conventions across the whole API
- `datazone-project-setup` — the deploy loop

Official docs: https://docs.datazone.co/reference/integration/endpoints
