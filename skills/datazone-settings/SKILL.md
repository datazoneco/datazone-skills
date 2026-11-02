---
name: datazone-settings
description: Use when administering a Datazone organisation over the API or Settings — users, invites, roles, policies, permissions, API keys, audit logs, quotas, or usage analytics. Triggers on "create a policy", "give X read access to project Y", "invite a user", "assign a role", "who has access", "API key scopes", "audit log", "who called the API", "token usage last month", "DCU / compute usage", "storage usage", "query usage", "how much did we use", a 403 with `required_action`, or "Permission denied" on a settings call.
---

# Datazone Settings and Administration

Organisation administration in Datazone is all REST: users, roles, policies, API keys,
audit logs, quotas and usage analytics live under `https://<host>/api/v1/`. Auth and the
list/filter syntax are the same as every other resource. See `datazone-api`.

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" "https://<host>/api/v1/<path>"
```

## Before anything: who you are and which organisation

```bash
GET /organisation/get-current-organisation   # → {"id": "<organisation_id>", "name": ...}
GET /user/get-permissions                    # what the key's user can manage
```

Take the organisation id from `get-current-organisation`. **Do not take it from
`/user/me`.** Its `organisation` field is the user's default organisation, which is not
always the one the key belongs to. Analytics and usage routes take the id in the path and
return 404 `OrganisationNotFound` if it isn't the key's own organisation.

Almost everything here needs **`organisation:manage`**, which the built-in `admin` role
has. A missing permission returns 403 with the exact action needed:

```json
{"message": "Permission denied.",
 "detail": {"required_action": "organisation:manage", "resource": "organisation:*"}}
```

Report `required_action` to the user. Don't retry or work around it.

## The access model

```
user ──(role assignment)──> role ──(policy assignment)──> policy ──> statements
```

Policies attach to **roles only**, never directly to users. A user's access is the union of
every statement in every policy on every role they hold. **An explicit `deny` always beats
an `allow`.** With no matching allow, access is denied.

Every organisation gets three built-in roles (each has one built-in policy). They can't be edited:

| Role | Policy | Grants |
|---|---|---|
| `admin` | All Access Policy | `*:*` on `*` |
| `contributor` | Contributor Policy | `*:*`, minus `*:manage` and minus creating, editing or assigning roles, policies, users and model accounts |
| `viewer` | Read Only Policy | `*:read` on `*` |

A statement:

```json
{"effect": "allow", "actions": ["dataset:read"], "resource": "project:<project_id>:dataset:*"}
```

`resource` is a **single string** (not `resources`), and its parts are separated by `:`.
Statement grammar, every resource type and action, row and column security, and examples are
in **`references/policies.md`**. Read it before writing any statement.

## Common tasks

### Create a policy and attach it to a role

```bash
# 1. Find the role (and its current policies)
GET /role/list?filters=[name][$eqi]:Analysts
GET /role/get-assigned-policies/{role_id}           # → [Policy, ...]

# 2. Create the policy
POST /policy/create
{"name": "Analysts – Marketing read",
 "description": "Read-only on datasets and views in the Marketing project",
 "statements": [
   {"effect": "allow", "actions": ["project:read"], "resource": "project:<pid>"},
   {"effect": "allow", "actions": ["dataset:read"], "resource": "project:<pid>:dataset:*"},
   {"effect": "allow", "actions": ["view:read"],    "resource": "project:<pid>:view:*"}]}
# → 201 Policy {"id": ...}

# 3. Attach it: send the FULL list (existing ids + the new one)
POST /role/assign-policy
{"role": "<role_id>", "policies": ["<existing_1>", "<existing_2>", "<new_policy_id>"]}
```

**All three `assign-*` calls replace the whole list.** Whatever you leave out gets
unassigned. Always read the current list first, merge, then send:

| Call | Body | Replaces |
|---|---|---|
| `POST /role/assign-policy` | `{"role": id, "policies": [ids]}` | every policy on that role |
| `POST /role/assign-role` | `{"role": id, "users": [user_ids]}` | every user holding that role |
| `POST /role/assign-user` | `{"user": id, "roles": [role_ids]}` | every role that user holds |

Readers for the merge are `GET /role/get-assigned-policies/{role_id}`,
`GET /role/get-assigned-users/{role_id}` (paged) and `GET /role/get-assigned-roles/{user_id}`.
`GET /role/get-access-map` returns every user, role and policy, with how they're linked, in
one call. Use it for "who has access to X" questions.

Can't describe the access precisely? `POST /orion/policy-proposal` with
`{"prompt": "Give the Analysts role read-only access to the Marketing project"}` returns
draft `statements`, a `reasoning` string, and an `unresolved` list of names it couldn't
match. Show the draft to the user before creating anything. It is a suggestion only.

### Roles

```bash
POST /role/create  {"name": "Analysts", "description": "...", "policies": [policy_ids], "users": ["a@x.com"]}
PUT  /role/update/{id}  {"name": "Analysts", "description": "...", "policies": [policy_ids]}
DELETE /role/delete/{id}
```

`role/create` takes `users` as **emails**. Everywhere else, users are ids. `role/update`
requires `name` even when you only change policies. Leave out `policies` (rather than
sending `[]`) when you don't mean to change them. To change only a role's policies, use
`assign-policy`; it doesn't touch the role's name or description.

List endpoints (`/role/list`, `/policy/list`, `/user/list`, `get-assigned-users`) return
`{"items": [...], "total_count": n}` and take the usual `filters`, `page`, `page_size` and
`sort_by` parameters. `get-assigned-policies` and `get-assigned-roles` return a plain array
of full objects: take `id` from each item. Built-in policies show up there too (`built_in:
true`). Keep their ids in the list you send back.

### Users and invites

```bash
GET  /user/list?filters=[email][$eqi]:bob@acme.com
POST /user/invite       {"email": "bob@acme.com", "roles": ["<viewer_role_id>"]}
POST /user/bulk-invite  {"emails": ["a@x.com", "b@x.com"], "roles": [ids], "send_email": true}   # max 100
POST /user/create       {"email": ..., "full_name": ..., "password": null, "roles": [ids], "is_active": true}
PUT  /user/update/{id}  {"full_name": ..., "phone_number": ..., "is_active": false}             # deactivate
DELETE /user/delete/{user_id}                                                                    # removes from the organisation
```

Invite with role **ids**. Look them up with `GET /role/list` (built-ins are named `admin`,
`contributor` and `viewer`). How `invite` behaves:
- It always emails the invitation.
- With no `roles`, it assigns the organisation's default roles.
- If the person already **joined**, it fails with `UserAlreadyInOrganisationError`. To
  change a member's roles, use `assign-user`, sending the full role list.
- If the person is invited but hasn't joined yet (`is_joined: false`), calling it again
  re-sends the invite. A cooldown applies.
- `bulk-invite` rejects the whole batch if any email is a duplicate, invalid, already
  invited or already joined. Every reason is listed in the response.

User list items include `roles: [{id, name}]`.

### API keys

```bash
POST /api-key/create  {"name": "ci-reader", "expiration": "30d", "scopes": ["dataset:read"]}
# → the key itself, as a JSON string "dz-...". Shown once and never again.
GET  /api-key/list                    # your own keys (needs api_key:manage)
DELETE /api-key/delete/{id}
GET  /api-key/organisation-list       # every key in the organisation, with owner (organisation:manage)
POST /api-key/revoke/{id}             # revoke anyone's key; stays listed as revoked
```

- A key **is its owner**. It runs with that user's permissions. Creating, listing and
  deleting your own keys needs `api_key:manage`.
- `scopes` can only **narrow** a key below its owner's access, never widen it. Leave `scopes`
  out for full access. An empty list is rejected.
- Scopes are bare actions (`dataset:read`, `pipeline:*`, `endpoint:invoke`). They take no
  resource, so **a key can't be limited to one project**: give it to a user whose role
  covers only that project. Lists are filtered by `<type>:read`, so add `project:read` if
  the client needs to find datasets through their project.
- `expiration` is one of `1h 1d 7d 30d 90d 180d 1y never` (default `7d`).
- `use_as_database_password: true` lets the key sign in to the SQL interface, with the
  user's email as the username. It only works on full-access keys.
- To create a key that can do *less* than you, use `scopes`. To give a CI job access you
  don't have, an admin has to create a service user with its own role, and the key must
  belong to that user.
- **Older deployments silently ignore `scopes` and `expiration`.** They create a
  full-access key that lasts 6 months, and they have no `revoke` or `organisation-list`
  (404). After creating a scoped key, check that its entry in `GET /api-key/list` has a
  `scopes` field. If it doesn't, the key has full access: delete it and tell the user.
  `GET /api-key/organisation-list` returning 404 means the deployment is older.
- Never print the returned key. Write it straight to a secret store or an environment
  variable.

### Audit logs and usage analytics

The audit log records every authenticated **write** request (`POST`, `PUT`, `PATCH`,
`DELETE`): method, URL, status, user and timestamp. Reads (`GET`) are not logged. Usage is
recorded for tokens (LLM), compute (DCU), query (bytes scanned), storage (hot and cold),
action calls, flow runs and studio app sessions. For "who read what", use
`/analytics/{org_id}/query/list`, which records every query with the user who ran it.

| Question | Call |
|---|---|
| "Token usage last month, by user / project / feature" | `GET /analytics/{org_id}/token/metrics?from_date=2026-10-01&to_date=2026-10-31` |
| "Which LLM calls cost the most / what was asked" | `GET /analytics/{org_id}/token/list` |
| "DCU / compute by project" | `GET /analytics/{org_id}/compute/metrics?...` |
| "Who scans the most data" | `GET /analytics/{org_id}/query/metrics?...` |
| "Storage per project / table" | `GET /analytics/{org_id}/storage/metrics?...` |
| "Total usage of everything this month" | `GET /organisation/get-usage-summary/{org_id}?from_date=...&to_date=...` |
| "Failed write calls in the last 7 days" | `GET /organisation/audit-logs?from_date=...&status=failed&sort_by=-timestamp` |
| "Who is most active" | `GET /organisation/audit-logs-metrics?from_date=...` |
| "What did people ask Orion / apps" | `GET /organisation/orion-logs?from_date=...` (`orion:manage`) |
| "Quotas" | `GET /organisation/quota/list`, `POST/PUT/DELETE /organisation/quota...` |

Parameters, response shapes and worked recipes (including "last month") are in
**`references/analytics-and-audit.md`**. Read it before answering a usage question.

## Delegated access management

A user can manage roles, policies and users without `organisation:manage` if they hold the
granular actions: `role:create|write|delete|assign`, `policy:create|write|delete|assign`,
`user:create|write|delete`. Two rules limit them, and each returns a 403:

1. They can't change their own access: their own role assignments, the policies on roles
   they hold, or their own user.
2. They can't hand out, change or remove access-management permissions themselves, or touch
   users who hold them.

Delegates also can't attach users when creating a role. Create the role, then call
`assign-role`.

## Gotchas

- **`assign-*` replaces, it doesn't append.** This is the most common way to silently strip
  access from people.
- **`/user/list` `total_count` is unreliable when filtered.** It can say `0` while `items`
  holds the match. Count `items`.
- **Policy changes are cached for a few seconds.** Row and column restrictions take about a
  minute to sync to ClickHouse.
- **A `manage` action only grants visibility in Settings.** `source:manage` shows the menu.
  Creating, editing and deleting still need `source:create|write|delete`.
- **Dates:** analytics `to_date` covers the whole day (`2026-10-31` includes 23:59:59). With
  no dates, analytics uses the account's current billing period.
- **Built-in roles and policies are read-only.** To get "viewer plus a bit more", create a
  new role with the built-in Read Only Policy plus your own policy.

## Related

- `datazone-api`: auth, filter syntax, pagination
- `datazone-project-setup`: profiles and where the API key lives

Docs: https://docs.datazone.co/reference/development/policy ·
https://docs.datazone.co/reference/development/api-key
