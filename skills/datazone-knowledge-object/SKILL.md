---
name: datazone-knowledge-object
description: Use when defining or changing a Datazone Knowledge Object — versioned business entities declared in YAML with fields, primary keys, relationships, and action handlers. Triggers on "knowledge object", "datazone object", editing a file registered under `objects:` in config.yml, object relationships, or an object stuck in PENDING_MIGRATION.
---

# Defining Datazone Knowledge Objects

A Knowledge Object is a business entity — Employee, Customer, Contract — declared in
YAML and stored as a versioned table. Objects have typed fields, a primary key,
relationships to other objects, and optional Python action handlers.

## The workflow

1. Write the object YAML (convention: `objects/<name>.yml`)
2. Register it in `config.yml` under `objects:`
3. `git add`, `git commit`, `git push`
4. Wait for migration — the object is not usable until its status reaches `READY`

```yaml
# config.yml
objects:
  - path: objects/employee.yml
```

## A minimal object

```yaml
name: Employee
description: A person employed by the company

fields:
  - name: id
    type: int
    primary_key: true
  - name: name
    type: str
  - name: email
    type: str
    optional: true

settings:
  label_column: name
```

`name` and `fields` are required, and **at least one field must be a primary key**.

Several objects can share one file, separated by `---`.

## Fields

| Key | Default | Notes |
|---|---|---|
| `name` | – | Required |
| `type` | – | Required. `int`, `str`, `float`, `bool`, `datetime`, `date` |
| `primary_key` | `false` | At least one field must set it |
| `optional` | `false` | Whether the field is nullable |
| `mutable` | `true` | `false` freezes the value after creation |
| `default` | – | Database-level default |
| `db_column` / `db_type` | – | Override storage name and type |
| `relationship` | – | See below |
| `options` | – | Allowed values for a `str` field; renders as a dropdown |

The type list is closed. Anything else — `decimal`, `json`, `uuid` — fails validation
with the supported list in the error.

The definition uses `extra="forbid"` at every level, so a misspelled key fails the
deploy rather than being ignored.

## Relationships

A relationship field stores the *related instance's key*:

```yaml
fields:
  - name: department
    type: str
    relationship:
      - object: Department
```

The referenced object does not need to exist yet. If it has no definition on the branch,
the relationship is recorded as `BROKEN` rather than failing the deploy — so a typo in
the target name is silent. Check the object's relationship status after deploying.

## Settings

```yaml
settings:
  object_type: STANDALONE      # STANDALONE (default) or BACKED
  backed_dataset: employees    # required for BACKED
  store_versions: true         # keep previous instance versions
  icon: Users                  # Lucide icon
  label_column: name           # field shown as the instance label
```

- **STANDALONE** — instances are written through the object API.
- **BACKED** — instances come from an existing dataset named by `backed_dataset`.

## Actions

Bind a Python function to the object:

```yaml
actions:
  - name: send_welcome_email
    description: Email a new hire their onboarding pack
    handler: objects/employee_actions.py:send_welcome_email
```

`handler` must match `path/to/file.py:function_name` exactly — a path, a colon, and a
valid Python identifier. Anything else fails validation. The file must be committed to
the repository.

## The migration lifecycle

Changing an object is not instant. After a push the object moves through:

```
PENDING_MIGRATION → MIGRATING → READY
                              ↘ ERROR
```

**Instances are not writable until `READY`.** A deploy that appears to succeed can still
end in `ERROR` at the migration step, so check the object's status rather than only the
deploy status.

## The primary key trap

Instance keys are a hash over the primary key columns — specifically over each column's
`(name, db_column, type, db_type)`, **in order**.

That means adding, removing, renaming, reordering, or retyping a primary key column
**changes the identity of every existing instance**. Relationships pointing at those
instances break, because they store the old key.

Treat the primary key as immutable once an object holds data. If you must change it,
plan a data migration rather than editing the YAML in place.

## Gotchas

- **At least one primary key field is mandatory**; an object with none fails validation.
- **Unknown keys fail the deploy** — `extra="forbid"` everywhere.
- **A broken relationship does not fail the deploy.** Verify the target name yourself.
- **Reordering primary key fields is a breaking change**, even though the diff looks
  cosmetic.
- **Removing the entry from `config.yml` deletes the object** and schedules cleanup of
  its data.
- `options` only applies to `str` fields.

## Verifying

Check the object's status on the project page, or:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-host>/api/v1/knowledge-object/list?filters=\[project.\$id\]\[\$eq\]:<project_id>"
```

## Related

- `datazone-api` — reading and writing instances over the API
- `datazone-project-setup` — the deploy loop

Official docs: https://docs.datazone.co/reference/knowledge-objects/overview
