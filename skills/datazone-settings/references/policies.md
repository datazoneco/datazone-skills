# Policy statement reference

A policy is `{name, description, statements: [...]}`. Each statement:

```json
{
  "effect": "allow",                      // "allow" | "deny"
  "actions": ["dataset:read"],            // non-empty list of "<resource_type>:<action>"
  "resource": "project:<id>:dataset:*",   // ONE string, default "*"
  "branch": "main",                       // optional, repository actions only
  "extra_constraints": { ... }            // optional, see below
}
```

The server validates statements on create and update. A bad one returns 422 with the
reason. `POST /orion/policy-proposal` uses the same validation.

## Resource patterns

| Pattern | Meaning |
|---|---|
| `*` | Everything in the organisation |
| `dataset` | The type itself. Use with `dataset:create` |
| `dataset:*` | Every dataset |
| `dataset:<id>` | One dataset |
| `project:<pid>` | The project entity (`project:read`, `project:write_repository`, ...) |
| `project:<pid>:*` | Every entity inside the project, any type |
| `project:<pid>:dataset:*` | Every dataset in the project |
| `project:<pid>:dataset:<id>` | One dataset in the project |

Ids must be valid 24-hex ObjectIds. Separators are always `:`, never `/`. Only `project`
can be a parent.

**Project access is two statements.** `project:<pid>` covers the project itself (seeing
it, its repository). `project:<pid>:*` covers what's inside it. A user with only the child
statement can't open the project, and a user with only the project statement sees an empty
project.

Actions must match the resource type: `dataset:read` on `pipeline:*` is rejected. Action
wildcards (`*:read`, `*:*`) work on any resource. On `project:<pid>:*` any action works.

## Resource types

Organisation-level: `organisation`, `user`, `role`, `policy`, `model_account`, `source`,
`target`, `branch`, `compute`, `orion`, `console`, `api_key`, `notification`, `variable`,
`tag`, `collection`.

Project children (usable under `project:<pid>:<type>`): `dataset`, `extract`, `schedule`,
`notebook`, `pipeline`, `flow`, `endpoint`, `view`, `intelligent_app`,
`intelligent_app_report`, `variable`, `access_key`, `agent`, `action`, `vector`, `alert`,
`knowledge_object`, `studio_app`, `ruleset`, `rule_template`, `widget`.

Also `table`, `repository`, `kernel`.

## Actions

Generic, valid on any type: `read`, `write`, `create`, `delete`, `execute`, `manage`, `*`.

Type-specific:

| Action | Grants |
|---|---|
| `endpoint:invoke` | Call a published endpoint |
| `action:invoke` | Call an action |
| `agent:ask` | Chat with an agent |
| `studio_app:deploy` | Deploy a studio app |
| `project:read_repository` / `project:write_repository` | Clone and pull / push and merge |
| `project:pr_create` | Open a pull request (checked on the **base** branch) |
| `project:read_file_container` / `project:write_file_container` | File container access |
| `role:assign` / `policy:assign` | Give roles to users / policies to roles |
| `console:read` | Show the developer console |

`create` is checked against the **type** (`dataset` or `project:<pid>:dataset:*`). Every
other action is checked against the entity.

`<type>:manage` shows that type's menu in Settings (`api_key`, `source`, `notification`,
`compute`, `variable`, `tag`, `orion`). `organisation:manage` covers every Settings area,
plus users, roles, policies, audit logs, analytics and quotas.

## Deny

A deny beats every allow, whatever the order. A deny on `*` or `dataset:*` removes the type
everywhere. A deny on one id removes only that entity.

```json
[{"effect": "allow", "actions": ["dataset:read"], "resource": "dataset:*"},
 {"effect": "deny",  "actions": ["dataset:read"], "resource": "dataset:<secret_id>"}]
```

## Branch protection

`branch` restricts repository actions to one branch:

```json
[{"effect": "allow", "actions": ["project:*"], "resource": "project:<pid>"},
 {"effect": "allow", "actions": ["*:*"],       "resource": "project:<pid>:*"},
 {"effect": "deny",  "actions": ["project:write_repository"], "resource": "project:<pid>", "branch": "main"}]
```

With this, users can push to feature branches and open PRs into `main`, but can't push to
or merge into `main`.

## Row and column security (`extra_constraints`)

Only on `dataset` and `view` statements, and only when all of these hold:
- the resource is **one specific id**: `dataset:<id>` or `view:<id>`. Wildcards and
  `project:...` forms are rejected.
- `actions` is exactly `["dataset:read"]` (or `["view:read"]`)
- the resource is not `*`

```json
{"effect": "allow", "actions": ["dataset:read"], "resource": "dataset:<id>",
 "extra_constraints": {
   "row_level_restrictions": ["region = 'EMEA'", "status = 'active'"],
   "column_level_restrictions": ["id", "name", "region"]}}
```

| | `allow` | `deny` |
|---|---|---|
| rows | only rows matching (conditions ANDed) | matching rows hidden, rest visible |
| columns | allowlist: only these columns readable | denylist: these columns hidden |

- Row conditions are ClickHouse SQL boolean expressions. `;`, DDL and DML are rejected.
  Column names must exist in the dataset.
- Several allow statements on the same dataset are ORed per row. Denies apply on top.
- Column restrictions combine per role: if any role can read a column, the user can.
  Row restrictions apply to the user whichever role they come from.
- Queries that touch a hidden column fail with `Not enough privileges`, including
  `SELECT *`. Use `SELECT * EXCEPT (col)`.
- Views are restricted separately from their source datasets.
- Takes about a minute to apply after saving.

Projects accept `{"path_prefix": "/some/dir"}` (must start with `/`) to limit repository
access to a path.

## Recipes

Read-only on one project:
```json
[{"effect": "allow", "actions": ["project:read", "project:read_repository"], "resource": "project:<pid>"},
 {"effect": "allow", "actions": ["*:read"], "resource": "project:<pid>:*"}]
```

Full control of one project:
```json
[{"effect": "allow", "actions": ["project:*"], "resource": "project:<pid>"},
 {"effect": "allow", "actions": ["*:*"],       "resource": "project:<pid>:*"}]
```

Business user who only uses apps, endpoints and agents in a project:
```json
[{"effect": "allow", "actions": ["project:read"], "resource": "project:<pid>"},
 {"effect": "allow", "actions": ["intelligent_app:read"], "resource": "project:<pid>:intelligent_app:*"},
 {"effect": "allow", "actions": ["studio_app:read"],      "resource": "project:<pid>:studio_app:*"},
 {"effect": "allow", "actions": ["endpoint:read", "endpoint:invoke"], "resource": "project:<pid>:endpoint:*"},
 {"effect": "allow", "actions": ["agent:read", "agent:ask"],          "resource": "project:<pid>:agent:*"}]
```

Delegate API keys and sources in Settings, without full admin:
```json
[{"effect": "allow", "actions": ["api_key:manage"], "resource": "api_key"},
 {"effect": "allow", "actions": ["source:manage", "source:create"], "resource": "source"},
 {"effect": "allow", "actions": ["source:*"], "resource": "source:*"}]
```

Everything except organisation administration (the same as the built-in contributor role):
assign the built-in **Contributor Policy** instead of writing your own.

## Debugging a 403

1. Read `detail.required_action` and `detail.resource` from the error.
2. Run `GET /role/get-access-map` to see the user's role ids, then those roles' policy
   statements.
3. Look for a matching allow on the right pattern (type vs `type:*` vs `project:<pid>:type:*`)
   and for a deny that covers it.
4. For a project child, check that the project-level statement exists too.
5. Run `POST /user/get-entity-permissions` with `{"entity_id": ..., "entity_type": "dataset"}`
   while authenticated **as that user**. It lists the actions they hold on that entity.
