---
name: datazone-api
description: Use when calling the Datazone REST API — authenticating with an API key, listing resources, filtering, sorting, pagination, or fetching linked documents. Triggers on "datazone api", "x-api-key", "how do I list datasets/projects/pipelines", filter query syntax, or scripting against a Datazone deployment.
---

# Using the Datazone API

Every Datazone deployment serves its own REST API at `https://<your-host>/api/v1/`.
The interactive spec is at `https://<your-host>/docs`.

## Authentication

Send your API key in the `x-api-key` header:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/user/me"
```

Keys belong to a **user**, not the organisation, so every call runs with that user's
permissions. A request that returns 403 means the key's owner lacks the policy, not that
the key is wrong.

Create keys in the UI under API Keys. `GET /user/me` is the cheapest way to verify one.

**Never echo the key.** Reference it as `$DATAZONE_API_KEY` from the environment so its
value stays out of logs, transcripts, and shell history.

## List endpoints

Most resources expose `GET /<resource>/list` with a uniform contract:

| Parameter | Default | Purpose |
|---|---|---|
| `page` | `1` | Page number |
| `page_size` | `20` | Items per page |
| `sort_by` | `-created_at` | Field name; `-` prefix means descending |
| `filters` | – | Repeatable; see below |
| `fetch_links` | `false` | Resolve linked documents inline |
| `fetch_fields` | – | Repeatable; resolve only these links |

The response is always:

```json
{ "items": [ ... ], "total_count": 137 }
```

`total_count` is the count for the whole filtered set, not the page.

## Filter syntax

Filters use a bracketed string, repeated once per condition:

```
filters=[field][$operator]:value
```

```bash
# datasets in one project
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<host>/api/v1/dataset/list?filters=\[project.\$id\]\[\$eq\]:68f1a2b3c4d5e6f7a8b9c0d1"

# name contains "sales", newest first, 50 per page
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<host>/api/v1/pipeline/list?filters=\[name\]\[\$containsi\]:sales&sort_by=-created_at&page_size=50"
```

Combine conditions by repeating `filters=`. They are ANDed.

Note the two things that trip people up: a **link field is filtered on `.$id`**, not
`.id`, and `$` must be escaped in most shells (or the URL single-quoted).

### Operators

| Operator | Meaning |
|---|---|
| `$eq` / `$eqi` | Equals / equals, case-insensitive |
| `$ne` / `$nei` | Not equals / not equals, case-insensitive |
| `$gt` `$gte` `$lt` `$lte` | Comparisons |
| `$in` / `$notIn` | Value in / not in a set |
| `$all` | Array contains all values |
| `$contains` / `$containsi` | Substring / substring, case-insensitive |
| `$notContains` / `$notContainsi` | Negated substring |
| `$startsWith` / `$startsWithi` | Prefix match |
| `$endsWith` / `$endsWithi` | Suffix match |
| `$null` / `$notNull` | Null checks |

For multi-value operators, add an index:

```
filters=[status][$in][0]:ACTIVE&filters=[status][$in][1]:PENDING
```

## Resolving links

Documents reference others by link. By default you get the reference, not the document:

```bash
# just the reference
GET /api/v1/dataset/list

# resolve every link
GET /api/v1/dataset/list?fetch_links=true

# resolve only what you need — cheaper
GET /api/v1/dataset/list?fetch_fields=project
```

Prefer `fetch_fields` on large result sets; `fetch_links=true` resolves everything and
gets expensive quickly.

## Common resources

`project`, `dataset`, `pipeline`, `transform`, `execution`, `extract`, `source`,
`endpoint`, `intelligent-app`, `knowledge-object`, `flow`, `schedule`, `action`,
`api-key`, `user`, `organisation`.

Most follow the same shape:

```
GET    /<resource>/list
GET    /<resource>/get-by-id/{id}
POST   /<resource>/create
PUT    /<resource>/update/{id}
DELETE /<resource>/delete/{id}
```

Not every resource implements all five — check `https://<your-host>/docs`. Resources
that are defined in the repository (pipelines, apps, endpoints, flows, knowledge
objects) are usually **read-only over the API**: they are created by pushing to git, not
by POSTing.

## Useful calls

```bash
# who am I
GET /api/v1/user/me

# deploy status of recent pushes
GET /api/v1/project/activities/{project_id}

# call a published endpoint
GET /api/v1/endpoint/{slug}?page=1&page_size=50
```

## Gotchas

- **`sort_by` defaults to `-created_at`**, not natural order. Pass it explicitly when
  order matters.
- **`page_size` has no documented maximum**, but large pages with `fetch_links=true`
  will time out. Paginate.
- **A malformed filter string raises an error rather than being ignored** — the bracket
  pattern must match exactly.
- **403 vs 404**: policy denials can surface as 404 on some routes to avoid leaking
  existence. Check the key's user permissions before assuming the id is wrong.

## Related

- `datazone-endpoint` — publishing your own query as an API
- `datazone-project-setup` — profiles and where the API key lives

Official docs: https://docs.datazone.co/reference/integration/overview
