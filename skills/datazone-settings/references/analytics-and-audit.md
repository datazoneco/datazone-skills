# Usage analytics and audit logs

Everything here needs `organisation:manage`, except Orion logs, which need `orion:manage`.
`{org_id}` comes from `GET /organisation/get-current-organisation` and must be the key's own
organisation. Any other id returns 404.

## Picking the right call

| You want | Use |
|---|---|
| A total for a period, one number per resource | `/organisation/get-usage-summary/{org_id}` |
| Breakdown by user, project or reason, plus a daily trend | `/analytics/{org_id}/<category>/metrics` |
| Individual records (what was asked, which query, which run) | `/analytics/{org_id}/<category>/list` |
| API activity, failures, who did what | `/organisation/audit-logs` + `/organisation/audit-logs-metrics` |

`<category>` is one of `token`, `compute`, `query`, `storage`.

## Dates

- `from_date` and `to_date` are ISO 8601: `2026-10-01` or `2026-10-01T00:00:00Z`.
- On **summary and metrics**, `from_date` snaps to 00:00 and `to_date` to 23:59:59.999 of
  that day, so `to_date=2026-10-31` covers all of 31 October.
- On metrics, leaving both out uses the account's **current billing period**. If the user
  says "this month" or "last month", send explicit dates. Summary requires both.
- Work out "last month" from today's date. The server doesn't parse relative dates.
- Audit log dates are compared as exact timestamps (no snapping). For "last 7 days", use
  `from_date=<now minus 7d>T...Z`.

## Usage summary

```
GET /organisation/get-usage-summary/{org_id}?from_date=2026-10-01&to_date=2026-10-31
```
```json
{"compute":      {"value": {"dcu": 5.45}},
 "query":        {"value": {"scanned_bytes": 1923340}},
 "hot_storage":  {"value": {"size": 0.8}},
 "cold_storage": {"value": {"size": 3.88}},
 "token_usage":  {"value": {"input_token": 621526, "output_token": 17763}},
 "action_call":  {"value": {"calls": 2}},
 "flow_run":     {"value": {"runs": 6224}},
 "studio_app_session": {"value": {"sessions": 3, "users": 1}}}
```

Storage sizes are in MB and are a point-in-time level (latest snapshot per item), not a sum
over the period. `GET /organisation/get-usage-detail/{org_id}` and
`/organisation/get-usage-resource-detail/{org_id}/{resource_name}` take the same dates.
`resource_name` is one of `compute query hot_storage cold_storage token_usage action_call
flow_run studio_app_session`. Both return per-item rows.

## Token (LLM) usage

### Metrics: the answer to most token questions

```
GET /analytics/{org_id}/token/metrics?from_date=2026-10-01&to_date=2026-10-31
```
```json
{"daily_trend": [{"date": "2026-10-01T00:00:00", "total_tokens": 0, "count": 0}, ...],
 "by_user":     [{"key": "ana@acme.com", "total_tokens": 437577, "count": 19}, ...],
 "by_project":  [{"key": "<project_id>", "total_tokens": 410043, "count": 19}, ...],
 "by_reason":   [{"key": "AGENT_QUESTION", "total_tokens": 402634, "count": 16}, ...]}
```

- Groups are sorted by `total_tokens`, highest first. `count` is the number of LLM calls.
- `by_user.key` is the **email**. `by_project.key` is a project **id**: resolve names with
  `GET /project/list` (or `get-by-id`). A `null` key means the calls had no user or project
  attached (system or background calls).
- `total_tokens` = input + output. For an input/output split, use the summary.
- `by_reason` keys tell you which feature spent the tokens:

| Reason | Source |
|---|---|
| `ASSISTANT_QUESTION` | Orion assistant chat |
| `AGENT_QUESTION` | Agents |
| `INTELLIGENT_APP_QUESTION` / `INTELLIGENT_APP_INSIGHT` | Intelligent apps |
| `FLOW_MODEL_INVOKE` / `PIPELINE_MODEL_INVOKE` / `ACTION_MODEL_INVOKE` | LLM calls inside flows, pipelines, actions |
| `NOTEBOOK_CELL_ASK` / `NOTEBOOK_CELL_ERROR_SUGGESTION` | Notebooks |
| `SQL_QUERY_GENERATION` / `QUERY_EXPLORER_ERROR_SUGGESTION` | Query explorer |
| `EXECUTION_ERROR_INSIGHT` | Failed-run explanations |
| `POLICY_GENERATION` | Policy proposals |
| `OTHER` | Anything else |

### List: individual records

```
GET /analytics/{org_id}/token/list
    ?filters=[created_at][$gte]:2026-10-01T00:00:00Z
    &filters=[created_at][$lte]:2026-10-31T23:59:59Z
    &filters=[reason][$eq]:AGENT_QUESTION
    &sort_by=-created_at&page_size=100
```

The list filters with the standard `filters=[field][$op]:value` syntax (see
`datazone-api`), with no date snapping. Record fields: `reason`, `user` (email), `user_id`,
`project_id`, `parent_entity_id`, `parent_entity_type`, `created_at`, and `metadata` with
`llm_model`, `estimated_cost`, `question`, `agent_name`, `intelligent_app_name`,
`project_name`, and `usage_metadata` (`{<model>: {input_tokens, output_tokens,
total_tokens}}`). Use the list for "most expensive questions" or "what did X ask". Use
metrics for totals. Don't page through the list to add things up.

## Compute (DCU)

```
GET /analytics/{org_id}/compute/metrics?from_date=...&to_date=...
→ {"by_entity_type": [{"key": "PIPELINE", "dcu": 3.1, "count": 40}, ...],
   "by_project":     [{"key": "<project_id>", "dcu": ..., "count": ...}],
   "trend":          [{"date": ..., "dcu": ...}]}
GET /analytics/{org_id}/compute/list   # records: compute size, entity_type, entity_id, start_time, end_time, project_id
```

`entity_type` is `PIPELINE`, `EXTRACT` or `KERNEL` (notebooks). DCU = size coefficient × hours. The coefficients are XSMALL 2, SMALL 4, MEDIUM 8,
LARGE 16, XLARGE 32.

## Query (bytes scanned)

```
GET /analytics/{org_id}/query/metrics?from_date=...&to_date=...
→ {"by_user": [{"key": "<email>", "read_bytes": ..., "count": ...}],
   "by_project": [...], "by_parent_entity_type": [...]}
GET /analytics/{org_id}/query/list     # query text, query_time, query_duration (ms), read_bytes, read_rows, user, exception
```

Filter the query list on `query_time` (not `created_at`) when you want "when the query ran".
`filters=[exception][$notNull]:` gives failed queries.

## Storage

```
GET /analytics/{org_id}/storage/metrics?from_date=...&to_date=...
→ {"hot_by_project": [{"key", "size"}], "hot_by_table": [...],
   "cold_by_dataset": [...], "trend": [{"date", "hot_size", "cold_size"}]}
GET /analytics/{org_id}/storage/list?storage_type=hot|cold&page=1&page_size=20
```

Sizes are in MB. The storage list takes **no `filters`**: one row per table (hot) or
project (cold), latest snapshot only, sorted by size.

## Audit logs

```
GET /organisation/audit-logs
    ?from_date=2026-10-26T00:00:00Z     # optional, ISO
    &to_date=...                        # optional
    &status=failed                      # "success" (<400) | "failed" (>=400)
    &method=POST                        # exact HTTP method
    &url=/policy/                       # case-insensitive regex on the URL
    &user=bob@acme.com                  # exact email
    &sort_by=-timestamp&page=1&page_size=50
```

**Only writes are audited:** `POST`, `PUT`, `PATCH` and `DELETE`. `GET` requests (reads,
downloads, listing data) are never logged, so the audit log can't answer "who viewed X".
Requests without a valid user (bad key, failed login) are recorded with no organisation, so
they don't appear here either. `status=failed` means `>= 400`, which includes 403 and 404.
Timestamps are UTC. Request bodies are stored with secrets redacted.

Items: `timestamp`, `method`, `url`, `status_code`, `email`, `full_name`, `user_id`,
`auth_type`, `client_host`, `parameters`, `request_body`, `request_id`. Sort on
`timestamp` (records have no `created_at`). `total_count` is the number of matching
requests.

```
GET /organisation/audit-logs-metrics?from_date=...&status=...&method=...&user=...
→ {"total_requests": 1003,
   "status_distribution": {"success": 980, "failed": 23},
   "top_users": [{"email", "full_name", "count"}],        # top 5, ignores the user filter
   "request_trend": [{"date": "2026-10-27", "count", "success_count", "failed_count"}]}  # last 30 days with data
```

For "who changed permissions": `url=/(policy|role)/` with `method=POST` (and `PUT`,
`DELETE`). For "who deleted X": `method=DELETE`.

## Orion and app question logs

```
GET /organisation/orion-logs?from_date=...&to_date=...&user=<email>&page=1&page_size=20
GET /organisation/orion-logs/{question_id}?question_type=<type from the list item>
```

Lists Orion assistant and intelligent-app questions with answer previews and token
estimates. The detail call returns the full answer and a per-model token breakdown. Needs
`orion:manage`.

## Quotas

```
GET    /organisation/quota/list
POST   /organisation/quota  {"quota_resource": "TOKENS", "quota_limit": 5000000, "scope": "USER", "user_id": "<id>"}
PUT    /organisation/quota/{quota_id}  {"quota_limit": 8000000}
DELETE /organisation/quota/{quota_id}
```

| | Values |
|---|---|
| `quota_resource` | `DCU`, `HOT_STORAGE`, `COLD_STORAGE`, `QUERY`, `TOKENS`, `ACTION`, `STUDIO_APP_SESSION` |
| `scope` | `ORGANISATION` (no target), `USER` (`user_id`; TOKENS, QUERY, ACTION, STUDIO_APP_SESSION only), `PROJECT` (`project_id`), `PARENT_ENTITY` (`parent_entity_id` + optional `parent_entity_type`; TOKENS, STUDIO_APP_SESSION only) |

Current status per resource is in `account_status.quota_status` of
`GET /organisation/get-current-organisation`.

## Worked example: "show me token usage last month"

Today is 2026-11-02, so last month is October 2026.

```bash
H="x-api-key: $DATAZONE_API_KEY"; B="https://<host>/api/v1"
ORG=$(curl -s -H "$H" "$B/organisation/get-current-organisation" | jq -r .id)

# total tokens, input vs output
curl -s -H "$H" "$B/organisation/get-usage-summary/$ORG?from_date=2026-10-01&to_date=2026-10-31" | jq .token_usage

# who, which project, which feature
curl -s -H "$H" "$B/analytics/$ORG/token/metrics?from_date=2026-10-01&to_date=2026-10-31" \
  | jq '{by_user, by_project, by_reason}'
```

Present the totals first, then the top users, projects and reasons. Replace project ids
with project names (`GET /project/list?page_size=100`), and say which dates you used.
