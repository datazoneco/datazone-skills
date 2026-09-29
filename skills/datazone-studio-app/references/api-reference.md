# Studio app API reference

Load this when writing the data layer of a studio app. The rules are in `SKILL.md`.

## `@/lib/datazone`

Vendored in the scaffold at `src/lib/datazone.ts` and editable. Every call is same-origin,
relative, and sends the Datazone session cookie — that cookie is the whole authentication
mechanism, so an absolute URL or an added `Authorization` header makes the request
anonymous.

```ts
// The API root is derived from BASE_URL, which is
// {prefix}/studio/{app_slug}/{branch_slug}/ — the deployment's prefix is stripped back to
// {prefix}/api. Hardcoding "/api" breaks every prefixed deployment.
apiFetch<T>(path: string, init?: RequestInit): Promise<T>

getMe(): Promise<DatazoneUser>                     // GET /user/me

// POST /dataset/query returns { result, data_schema, row_count, duration_ms }.
// executeQuery unwraps it to the rows (null becomes []); the other returns the envelope.
executeQuery<T>(sql: string, tableVersions?: Record<string, number>): Promise<T[]>
executeQueryWithMetadata<T>(sql: string, tableVersions?: Record<string, number>): Promise<QueryExecution<T>>

interface QueryExecution<T> {
  result: T[] | null
  data_schema: { name: string; type: string }[] | null
  duration_ms: number | null
  row_count: number | null
  error?: string | null   // always unset here — a failed query throws DatazoneApiError
}

callEndpoint<T>(slug: string, params?: Record<string, string | number | boolean | Array<string | number> | undefined>): Promise<EndpointResponse<T>>

branch: string        // VITE_DATAZONE_BRANCH, inlined at build time
projectId: string     // VITE_DATAZONE_PROJECT_ID
branchQuery(filters?: Record<string, string>): string   // "branch=…&filters=[f][$eq]:v"

class DatazoneAuthError extends Error   // 401; session gone, cannot be renewed here
class DatazoneApiError extends Error    // any other non-2xx; has .status and the API message
```

`apiFetch` sets `Content-Type: application/json` when there is a body, returns `undefined`
for `204`, and turns the API's `detail` into the error message. Array values passed to
`callEndpoint` are repeated as query parameters, which is how the API reads multi-valued
filters.

Handle the two error types differently: `DatazoneAuthError` means reload to sign in again;
`DatazoneApiError` carries a message the user can usually act on (a permission, a
validation failure, a key collision).

## Knowledge object instances

| Operation | Request |
|---|---|
| resolve the object id | `GET /knowledge-object/list?branch={branch}&filters=[name][$eq]:{Name}` |
| list | `GET /knowledge-object/{id}/instances?branch={branch}&page=1&page_size=50` |
| get | `GET /knowledge-object/{id}/instances/{key}?branch={branch}&add_relationships=true` |
| create | `POST /knowledge-object/{id}/instances?branch={branch}` |
| update | `PATCH /knowledge-object/{id}/instances/{key}?branch={branch}` |
| delete | `DELETE /knowledge-object/{id}/instances/{key}?branch={branch}` |
| upsert many | `POST /knowledge-object/{id}/instances/batch?branch={branch}` — max 1000 |
| history | `GET /knowledge-object/{id}/instances/{key}/history?branch={branch}` |

Two different filter formats are in play, which is the most common mistake here:

- **The object list** uses the API's standard syntax — `filters=[name][$eq]:Order` — which
  is what `branchQuery` builds.
- **The instance list** uses repeated `filters`, each a URL-encoded JSON object
  `{"column": …, "operator": …, "value": …}`, ANDed together. Operators: `equal`,
  `not_equal`, `contains`, `not_contains`, `greater_than`, `less_than`. There is no OR and
  no IN — model an either/or as two requests, or filter server-side with an endpoint.

The list response is `{items, total_count}`, where `total_count` covers the whole filtered
set. Every instance carries `_key` (opaque hex; the address for `PATCH` and `DELETE`) and
`_version`. `PATCH` takes only the changed fields. Re-fetch after a write rather than
patching local state optimistically — instances are versioned server-side and the returned
row is the truth.

## A module per object

Keep the id lookup and the calls in one place so `branch` and the paths are written once,
and have components call this rather than `apiFetch` directly.

```ts
// src/lib/orders.ts
import { apiFetch, branch, branchQuery } from "@/lib/datazone"

export type Order = {
  _key: string
  _version: number
  order_no: string
  status: "DRAFT" | "PAID" | "SHIPPED" | "CANCELLED"
  ordered_at: string
  total: number | null
  customer: string | null
}

type Page<T> = { items: T[]; total_count: number }

let objectIdPromise: Promise<string> | undefined

/** Resolved once per session, not per component. */
export function orderObjectId(): Promise<string> {
  objectIdPromise ??= apiFetch<Page<{ id: string }>>(
    `/knowledge-object/list?${branchQuery({ name: "Order" })}`,
  ).then((response) => {
    const object = response.items[0]
    if (!object) throw new Error(`Object Order is not deployed on ${branch}`)
    return object.id
  })
  return objectIdPromise
}

function instanceFilter(column: string, operator: string, value: unknown): string {
  return `filters=${encodeURIComponent(JSON.stringify({ column, operator, value }))}`
}

export async function listOrders(page = 1, status?: string): Promise<Page<Order>> {
  const id = await orderObjectId()
  const query = [
    `branch=${branch}`,
    `page=${page}`,
    "page_size=50",
    ...(status ? [instanceFilter("status", "equal", status)] : []),
  ].join("&")
  return apiFetch<Page<Order>>(`/knowledge-object/${id}/instances?${query}`)
}

export async function getOrder(key: string): Promise<Order> {
  const id = await orderObjectId()
  return apiFetch<Order>(
    `/knowledge-object/${id}/instances/${key}?branch=${branch}&add_relationships=true`,
  )
}

export async function createOrder(order: Omit<Order, "_key" | "_version">): Promise<Order> {
  const id = await orderObjectId()
  return apiFetch<Order>(`/knowledge-object/${id}/instances?branch=${branch}`, {
    method: "POST",
    body: JSON.stringify(order),
  })
}

export async function updateOrder(key: string, changes: Partial<Order>): Promise<Order> {
  const id = await orderObjectId()
  return apiFetch<Order>(`/knowledge-object/${id}/instances/${key}?branch=${branch}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  })
}

export async function deleteOrder(key: string): Promise<void> {
  const id = await orderObjectId()
  await apiFetch(`/knowledge-object/${id}/instances/${key}?branch=${branch}`, { method: "DELETE" })
}
```

Rendering a related record: read the parent with `add_relationships=true` rather than
fetching each child by key in a loop.

## Using it in a page

```tsx
import { useEffect, useState } from "react"

import { AppLayout } from "@/components/app-layout"
import { DatazoneAuthError } from "@/lib/datazone"
import { Order, listOrders } from "@/lib/orders"

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listOrders()
      .then((page) => setOrders(page.items))
      .catch((problem) =>
        setError(
          problem instanceof DatazoneAuthError
            ? problem.message
            : `Could not load orders: ${problem.message}`,
        ),
      )
  }, [])

  return (
    <AppLayout title="Orders">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y">
        {orders.map((order) => (
          <li key={order._key} className="flex justify-between py-2 text-sm">
            <span className="font-mono">{order.order_no}</span>
            <span className="text-muted-foreground">{order.status}</span>
          </li>
        ))}
      </ul>
    </AppLayout>
  )
}
```

`key={order._key}` is the one place the key belongs in the UI — never render it as text.

Remember the route: this page does nothing until `App.tsx` has
`<Route path="/orders" element={<OrdersPage />} />`.

## Datasets and endpoints

```ts
// Read-only analytics. Runs with the signed-in user's dataset permissions.
// Resolves to the rows themselves — the endpoint's envelope is already unwrapped.
const rows = await executeQuery<{ region: string; total: number }>(
  "select region, sum(amount) as total from sales group by region",
)

// When the app needs the column types, the row count or how long it took:
const execution = await executeQueryWithMetadata<{ region: string; total: number }>(
  "select region, sum(amount) as total from sales group by region",
)
const columns = execution.data_schema ?? []   // [{ name: "region", type: "String" }, …]

// A published endpoint — the query lives server-side, so the app ships no SQL.
const { records } = await callEndpoint<{ day: string; revenue: number }>("daily-revenue", {
  page_size: 50,
  region: ["EU", "UK"],
})
```

Prefer an endpoint over `executeQuery` for any query the app depends on: the SQL stays
server-side and user input arrives as typed filters. See `datazone-endpoint`.

`GET /endpoint/{slug}` is the only call — there is no POST variant — and the response is
always `{records}`, whether the endpoint is a query, an action or a vector search. The
slug lookup is not branch-aware. `page`, `page_size` and `sort_by` are reserved; every
other parameter is a filter or an action parameter.

## Logic in an action, called through an endpoint

```python
# actions/budget_summary.py — registered under `actions:` in config.yml
@action
def budget_summary(year: str, department: str) -> list[dict]:
    year = int(year)   # endpoint parameters arrive as strings
    ...
    return [{"department": department, "planned": planned, "actual": actual}]
```

```yaml
# endpoints/budget-summary.yml
endpoints:
  - name: Budget Summary
    type: action
    config:
      action_id: <the action's id>
```

```ts
const { records } = await callEndpoint<BudgetRow>(SLUGS.budgetSummary, { year: 2026, department })
```

The action must return a list — a dict or a scalar fails the call. Missing required
parameters return 400. The call is synchronous with a 300s cap; longer work is a flow.

## Long work in a flow

`POST /flow/run/{id}` only queues the run. Poll it, and read `result` — the output of the
flow's `response` node — once the status is `SUCCESS`.

```ts
// src/lib/forecast.ts
import { apiFetch, branch, branchQuery } from "@/lib/datazone"

type RunStatus = "CREATED" | "RUNNING" | "SUCCESS" | "FAILURE" | "CANCELED"
type FlowRun<T> = { id: string; status: RunStatus; result?: T | null; error_message?: string | null }

const TERMINAL: RunStatus[] = ["SUCCESS", "FAILURE", "CANCELED"]

let flowIdPromise: Promise<string> | undefined

export function forecastFlowId(): Promise<string> {
  flowIdPromise ??= apiFetch<{ items: { id: string }[] }>(
    `/flow/list?${branchQuery({ name: "Build Forecast" })}`,
  ).then((response) => {
    const flow = response.items[0]
    if (!flow) throw new Error(`Flow "Build Forecast" is not deployed on ${branch}`)
    return flow.id
  })
  return flowIdPromise
}

export async function startForecast(parameters: Record<string, unknown>): Promise<string> {
  const id = await forecastFlowId()
  // branch is not optional here: the route defaults to main
  const { run_id } = await apiFetch<{ run_id: string }>(`/flow/run/${id}?branch=${branch}`, {
    method: "POST",
    body: JSON.stringify({ parameters }),
  })
  return run_id
}

/** Polls until the run ends; rejects on failure, cancel, abort or timeout. */
export async function waitForRun<T>(runId: string, signal?: AbortSignal, maxWaitMs = 15 * 60_000): Promise<T> {
  const started = Date.now()
  let delay = 1000
  for (;;) {
    const run = await apiFetch<FlowRun<T>>(`/flow-run/get-by-id/${runId}`, { signal })
    if (run.status === "SUCCESS") return run.result as T
    if (TERMINAL.includes(run.status)) throw new Error(run.error_message ?? `Run ${run.status.toLowerCase()}`)
    if (Date.now() - started > maxWaitMs) throw new Error("The run is taking longer than expected")
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    delay = Math.min(delay * 1.5, 5000)
  }
}

export async function cancelRun(runId: string): Promise<void> {
  await apiFetch(`/flow-run/cancel/${runId}`, { method: "POST" })
}
```

In the page, disable the button from the click until the run ends, pass an
`AbortController` signal and abort it in the effect cleanup, and on mount check
`GET /flow-run/list?flow_id={id}&branch={branch}&limit=1` (a bare array, newest first) so a
reload resumes a running run instead of starting another. Per-node detail is in
`GET /flow-run/logs/{run_id}`.

## Prepared data in a view

A view whose query produces the prepared data — created once while building the app
(`POST /view/create` with `{name, project, type: "MATERIALIZED", source_type: "QUERY", query}`),
never from the app. The app finds it, refreshes it on demand and reads it by name.

```ts
// src/lib/budget-plan.ts
import { apiFetch, executeQuery, projectId } from "@/lib/datazone"

type ViewStatus = "NOT_READY" | "CREATING" | "REFRESHING" | "ERROR" | "READY"
type View = { id: string; name: string; status: ViewStatus; error_message?: string | null; last_sync_at?: string | null }

const VIEW_NAME = "budget_plan"

async function budgetPlanView(): Promise<View> {
  const response = await apiFetch<{ items: View[] }>(
    `/view/list?filters=[name][$eq]:${VIEW_NAME}&filters=[project.$id][$eq]:${projectId}`,
  )
  const view = response.items[0]
  if (!view) throw new Error(`View ${VIEW_NAME} does not exist in this project`)
  return view
}

/** Starts a refresh and resolves once the view is READY again. */
export async function prepareBudgetPlan(signal?: AbortSignal): Promise<View> {
  const { id } = await budgetPlanView()
  await apiFetch(`/view/refresh/${id}`, { method: "POST", signal })   // 202, no body
  let delay = 1000
  for (let elapsed = 0; elapsed < 10 * 60_000; elapsed += delay) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    const view = await apiFetch<View>(`/view/get-by-id/${id}`, { signal })
    if (view.status === "READY") return view
    if (view.status === "ERROR") throw new Error(view.error_message ?? "Preparing the budget plan failed")
    delay = Math.min(delay * 1.5, 5000)
  }
  throw new Error("Preparing the budget plan is taking longer than expected")
}

export const budgetPlanRows = () =>
  executeQuery<{ department: string; month: string; amount: number }>(
    `select department, month, amount from ${VIEW_NAME} order by department, month`,
  )
```

The refresh route sets `REFRESHING` before it returns, and a background task moves the
view back to `READY` (or `ERROR`) when ClickHouse finishes — so poll every few seconds, not
in a tight loop. Show `last_sync_at` next to the data so the user
knows when it was prepared, and remember the view is shared: a refresh by one user
changes what everyone sees. A materialized view built on a dataset also refreshes itself
when that dataset refreshes.

## Managing the app itself

Rarely needed from inside the app, but this is the surface:

| Call | Purpose |
|---|---|
| `GET /studio-app/list?branch={branch}` | Apps on a branch with their build state |
| `GET /studio-app/get-by-id/{id}?branch={branch}` | Status, served `url`, `is_stale`, commits |
| `POST /studio-app/create` | `{name, project, branch?}` — scaffolds and registers |
| `PUT /studio-app/update/{id}` | Rewrite the `config.yml` entry |
| `POST /studio-app/{id}/build?branch={branch}` | Queue a build |
| `DELETE /studio-app/delete/{id}?branch={branch}` | Remove the entry **and the directory** |
| `GET /studio-app-build/list` | Build history |
| `GET /studio-app-build/{id}/logs` | Build logs |

`definition.status` is one of `NOT_BUILT`, `QUEUED`, `BUILDING`, `READY`, `ERROR`,
`TIMEOUT`; `is_stale` says the branch has moved on since the served build.
