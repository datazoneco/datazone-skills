---
name: datazone-studio-app
description: Use when building or debugging a Datazone Studio App — a Vite + React SPA that lives in the project repository and is served by Datazone behind the user's session. Triggers on "studio app", editing files under `studio/<alias>/`, an app registered under `studio_apps:` in config.yml, calling the Datazone API from a React app, `@/lib/datazone`, deciding whether app logic belongs in an endpoint, action, flow or view, running a flow or refreshing a view from the app, adding shadcn components or styling a studio app to match Datazone, or a built app that shows a blank page or 404s on its assets.
---

# Building Datazone Studio Apps

A studio app is a Vite + React single-page app stored in the project repository. Datazone
builds it in a sandboxed Kubernetes job and serves the static bundle at a real URL behind
the signed-in user's session — so the app calls the Datazone API as that user, with no
token to manage.

Use it when a dashboard is not enough: custom forms, multi-step workflows, anything a
user *writes* to. For read-only charts and filters, an Intelligent App is far less work —
see `datazone-intelligent-app`.

Most of the rules below exist because breaking them produces an app that **builds
successfully and then fails in the browser**: a blank page, a 404 on every asset, or a
route that silently does not exist.

## Before you start

The app must already exist. Create it in the UI ("New studio app") or with
`POST /studio-app/create`, which scaffolds every file below and registers it in
`config.yml` in one commit. Do not hand-write the scaffold — pull the branch and edit
what is there.

```yaml
# config.yml — created for you
studio_apps:
  - alias: sales_dashboard
    name: Sales Dashboard
    path: studio/sales_dashboard
```

Registration is what makes the app appear in Datazone. It does **not** build it.

## The workflow

1. Edit files under `studio/<alias>/`
2. `git add`, `git commit`, `git push`
3. Build — the Build button, or `POST /studio-app/{id}/build?branch=<branch>`
4. Check the Builds tab; the app is served only after the build reaches `READY`

The real build runs in the sandbox (`npm install && vite build`), but when Node is
available, run `npm install && npx tsc --noEmit && npx vite build` in `studio/<alias>/`
before pushing. It catches type errors and missing imports in seconds rather than one
build later. Do not commit the `package-lock.json` this creates unless the app already
has one. `npm run dev` works for layout, but the API calls will not, because the dev
server does not serve `/api` (see "Local development"). The checklist at the end of this
file is what to check.

## File layout

```
studio/{alias}/
  package.json             pinned dependencies — never loosen to a ^range
  index.html               entry; loads /src/main.tsx
  vite.config.js           NEVER set `base`; loads the Tailwind plugin
  components.json          shadcn config (tsx, cssVariables, css: src/index.css)
  tsconfig.json            "@/*" → "./src/*"
  src/
    main.tsx               BrowserRouter basename={import.meta.env.BASE_URL}
    App.tsx                the <Routes> table
    index.css              Tailwind import + the whole theme
    lib/datazone.ts        the Datazone client (vendored, editable)
    lib/utils.ts           cn()
    components/app-layout.tsx   header + content shell; providers go here
    components/ui/         shadcn components — generated, and yours to edit
```

## The rules that break apps

**Never set `base` in `vite.config.js`.** The builder passes
`--base={prefix}/studio/{app_slug}/{branch_slug}/`, which differs per app, per branch and
per deployment. A `base` in the config overrides it and every asset 404s while the build
reports success.

**The router's basename must be `import.meta.env.BASE_URL`.** The app is never served
from the domain root, so `basename="/"` makes every route resolve to nothing.

**Every page needs a `<Route>` in `App.tsx`.** A component that is imported but not
routed is tree-shaken out with no warning, and the page 404s at runtime.

**Reference `public/` assets through `BASE_URL`** —
`` <img src={`${import.meta.env.BASE_URL}logo.svg`} /> ``. A leading-slash `/logo.svg`
resolves against the domain root.

**Call the API only through `@/lib/datazone`, with relative paths.** Authentication is
the same-origin session cookie. An absolute URL, an `Authorization` header, or a token in
`localStorage` all mean the request is unauthenticated. There is no API key in a browser
bundle — anything shipped in one is public.

**The app stores nothing itself.** The bundle is static files; there is no server-side
code and no database. Anything the user creates or edits belongs in a knowledge object.
`useState` is for view state, never for records expected to survive a reload.

## The SDK — `@/lib/datazone`

Vendored, not installed from npm: it must match the deployment it runs in. Edit it if you
need something it does not cover; `apiFetch` is the escape hatch.

| Export | What it does |
|---|---|
| `apiFetch<T>(path, init?)` | Any API path, relative to the API root — do **not** include `/api` |
| `getMe()` | The signed-in user |
| `executeQuery<T>(sql, tableVersions?)` | SQL over the datasets this user can read; resolves to an array of rows |
| `executeQueryWithMetadata<T>(sql, …)` | The same query as an envelope: `{result, data_schema, row_count, duration_ms}` |
| `callEndpoint<T>(slug, params?)` | A published endpoint; returns `{records}` |
| `branch` | The branch this bundle was built from |
| `projectId` | The project the app lives in |
| `branchQuery(filters?)` | `branch=…` plus `[field][$eq]:value` filters |
| `DatazoneAuthError` | 401 — the session is gone and the app cannot renew it |
| `DatazoneApiError` | Any other non-2xx, carrying `status` and the API's message |

```tsx
import { callEndpoint, executeQuery, getMe } from "@/lib/datazone"
import { endpointSlug } from "@/lib/resources"   // resolves a slug by name — references/api-reference.md

const user = await getMe()
const rows = await executeQuery<{ region: string; total: number }>(
  "select region, sum(amount) as total from sales group by region",
)
const { records } = await callEndpoint(await endpointSlug("Daily Revenue"), { region: "EU" })
```

`POST /dataset/query` returns an envelope — `{result, data_schema, row_count, duration_ms}` —
and `executeQuery` unwraps it, so use what it returns as an array and do not read `.result`
off it. Use `executeQueryWithMetadata` when the app needs the column schema, the row count or
the duration.

Permissions are enforced per user on every call, so a read the user is not allowed to make
throws `DatazoneApiError` — show its message rather than swallowing it. Never build SQL by
concatenating user input.

There is no data-fetching library in the scaffold. `useEffect` + `useState` is enough for
most apps; add one only if asked.

### Always pass the branch

Branch-scoped entities (knowledge objects among them) fall back to the **default branch**
when no branch is given. Omitting it does not fail — it quietly reads `main`'s data from an
app running on a feature branch. Use the exported `branch`.

`branch` and `projectId` come from `VITE_DATAZONE_BRANCH` / `VITE_DATAZONE_PROJECT_ID`,
inlined at build time. There is no `process.env` in a browser bundle, and a bundle belongs
to exactly one branch — do not try to make it switchable at runtime.

## Where the logic lives

The bundle is static and public to anyone who opens the app, so keep it thin: it renders,
collects input and calls things. Queries, business logic and long work belong in Datazone
resources that live in the same repository and deploy in the same push. Pick by what the
UI needs:

| The UI needs… | Build | The app calls |
|---|---|---|
| rows from a query, possibly filtered by user input | a **query endpoint** | `callEndpoint(slug, filters)` |
| a result that needs logic — validation, several queries, a calculation, an external call | an **action**, exposed through an **action endpoint** | `callEndpoint(slug, params)` |
| work that takes longer than a request should — multi-step, LLM calls, loops, writing data | a **flow** | `POST /flow/run/{id}`, then poll the run |
| a prepared dataset the user triggers ("prepare budget plan") and then reads many times | a **view** over a query | `POST /view/refresh/{id}`, poll, then query the view |
| records the user creates and edits | a **knowledge object** | the instance API |

**Queries go in endpoints.** The SQL lives server-side, the same query serves other
consumers, and the bundle ships no table names. `executeQuery` is for prototyping and for
ad-hoc read-only exploration screens; once a query is part of the app, move it into an
endpoint. **Filters are not bound parameters.** The query is a Jinja2 template, and values
are pasted in unquoted and unescaped. Quote and escape strings in the template, and pass
numbers through `| int` / `| float`, as `datazone-endpoint` shows. Otherwise a user's `'`
rewrites the query.

**Logic goes in an action, called through an endpoint.** When the result is more than one
query — combine two queries, apply business rules, call an external service — write it as
a Python action and give it an `action` endpoint. The app still makes one `callEndpoint`
call. Query-string parameters become the action's parameters and **arrive as strings**,
whatever the type hints say, so convert them inside the action. Watch booleans in
particular: `"false"` is truthy. The action **must return a list**, and that list is
`records`. `page` and `page_size` are ignored, so the whole list comes back. Action
endpoints run synchronously with a 300s cap; anything close to that is a flow.

**Long work goes in a flow.** A flow run is always asynchronous: `POST /flow/run/{id}`
returns `{run_id, status}` at once, and the app polls `GET /flow-run/get-by-id/{run_id}`
until the status is `SUCCESS`, `FAILURE` or `CANCELED`. `result` holds the output of the
flow's `response` node, and is only present after `SUCCESS`. While it runs, disable the
trigger (a double-click starts two runs), show progress, and offer `POST /flow-run/cancel/{run_id}`.
**Pass `?branch=`** — the run route defaults to `main`, not to the app's branch.

**Prepared data goes in a view.** For "prepare the budget plan, then let me work with it",
define a view whose query produces the prepared data. The button calls
`POST /view/refresh/{id}` (202, no body), the app polls `GET /view/get-by-id/{id}` until
`status` is `READY` (or `ERROR`, with `error_message`), and every screen after that reads it
with an ordinary query or endpoint — `select … from budget_plan` — fast, because a
materialized view is a ClickHouse table. `last_sync_at` tells the user how fresh it is.
**Endpoint results are cached for an hour**, so an endpoint over the view keeps returning
the old rows after a refresh. Read the view with `executeQuery`, which is not cached, or
pass `last_sync_at` into an endpoint filter that the template renders into a SQL comment,
which changes the cache key.
Views are not declared in `config.yml`, and they differ from the other resources in ways
that matter:

- **Create the view ahead of time, not from the app.** Views are created through the API
  (`POST /view/create`), not deployed from the repository, and creating one needs
  `VIEW:CREATE` on the project, which ordinary users often lack. Create it once while
  building the app; the app only looks it up by name and refreshes it. Refreshing needs
  `VIEW:WRITE`, so check the app's users have it.
- **Query it by its `name`**, which is the table the data lands in. The
  `metadata.materialized_view_name` (`…_mv`) only drives refreshes.
- **A view is shared state.** It is project-scoped, not per branch and not per user: a
  refresh replaces the data for everyone, and an app on a feature branch refreshes the
  same view as `main`. If each user or scenario needs its own copy, a view is the wrong
  tool — write the result from a flow instead, keyed by user or scenario.
- **A view's query takes no parameters.** If "prepare" depends on the user's inputs (a
  year, a scenario), that is a flow, not a view refresh.

### Architecture rules

- **Put each concern in one `src/lib/` module** — `orders.ts`, `budget.ts` — holding the
  resource lookups and calls. Components never call `apiFetch` or build paths directly.
- **Resolve resources by name, once.** Object, flow, action and view ids differ per
  deployment; look them up by name through the list routes and cache the promise, as in
  the knowledge-object module. **Endpoint slugs are random and differ per branch**, so a
  slug copied from `main` makes a feature-branch app call `main`'s endpoint. Resolve them
  the same way: `GET /endpoint/list?branch={branch}&filters=[name][$eq]:…` and read
  `items[0].definition.slug`. Keep the names in one file, `src/lib/resources.ts`, never
  scattered across pages.
- **Filter and page on the server.** Instance lists take `page` and `page_size`. Endpoints
  do not honour them, so give each endpoint `limit_rows` / `offset_rows` filters and page in
  its SQL. Send lists as one comma-separated value, because a repeated parameter keeps only
  its last value. Loading a whole table to filter it in the browser is slow, and every
  query is capped at the deployment's row limit anyway.
- **Give every async call three states** — loading, error, data — and every write a
  pending state that blocks resubmission.
- **Re-read after a write, or after a run or refresh completes**, rather than patching
  local state and hoping it matches.
- **Poll with a cap.** Start at about 1s, back off to about 5s, stop after a sensible
  limit, and clear the timer on unmount. A run or refresh started before a reload is still
  running: on mount, check `GET /flow-run/list?flow_id=…&branch=…` or the view's `status`
  and resume polling instead of starting another.
- **Surface permission errors.** Each resource has its own permission — `ENDPOINT:INVOKE`
  (and `ACTION:INVOKE` for action endpoints), `FLOW:EXECUTE`, `VIEW:WRITE` to refresh a
  view. A 403 is a message the user can take to an admin; show it.
- **Put nothing in the bundle that must stay private** — no keys, no credentials for
  external services. An action or flow holds those server-side.

## Fundamental endpoints

Everything goes through `apiFetch`. Paths are relative to the API root.

| Need | Call |
|---|---|
| who is looking | `GET /user/me` |
| run SQL on datasets | `POST /dataset/query` (`executeQuery`) |
| list datasets | `GET /dataset/list?filters=[project.$id][$eq]:{projectId}` |
| call an endpoint | `GET /endpoint/{slug}?…` (`callEndpoint`) — GET only, returns `{records}` |
| find an endpoint's slug | `GET /endpoint/list?branch={branch}&filters=[name][$eq]:…` → `items[0].definition.slug` |
| find a flow / action by name | `GET /flow/list` or `/action/list` with `branchQuery({ name })` — both default to `main` without `branch` |
| find a view by name | `GET /view/list?filters=[name][$eq]:…&filters=[project.$id][$eq]:{projectId}` — views have no branch |
| start a flow | `POST /flow/run/{id}?branch={branch}` with `{parameters}` → `{run_id, status}` |
| poll a flow run | `GET /flow-run/get-by-id/{run_id}` → `status`, `result`, `error_message` |
| refresh a view | `POST /view/refresh/{id}` → 202; poll `GET /view/get-by-id/{id}` for `status` |
| find an object by name | `GET /knowledge-object/list?branch={branch}&filters=[name][$eq]:Order` |
| list instances | `GET /knowledge-object/{id}/instances?branch={branch}&page=1&page_size=50` |
| one instance | `GET /knowledge-object/{id}/instances/{key}?branch={branch}&add_relationships=true` |
| create / update / delete | `POST` / `PATCH` / `DELETE` `/knowledge-object/{id}/instances[/{key}]?branch={branch}` |
| upsert many | `POST /knowledge-object/{id}/instances/batch?branch={branch}` (max 1000) |

List endpoints share one contract — `page`, `page_size`, `sort_by`, repeated `filters`,
`fetch_links` — and always return `{items, total_count}`. See `datazone-api` for the
filter syntax in full.

## Storing data — knowledge objects

The moment the app *holds* something — "manage my orders", "a CRM", "track inventory" —
the app is only the interface and the data model is a set of knowledge objects. Raise this
before writing React: `localStorage` is per-browser, a JSON file in the repo is not
writable at runtime, and a dataset is for analytics, not records edited one at a time.

**Design the model first and confirm it.** For "manage my orders": `Customer` (pk `id`),
`Product` (pk `sku`), `Order` (pk `order_no`, `status` with `options`, relationship to
Customer), `OrderLine` (relationships to Order and Product). Then say what the app will do
with them — list with a status filter, a detail page, a create form — and check that
matches. Model something as its own object when the user lists, filters or edits it on its
own: order lines yes, a shipping address no (fields on the order).

Objects are YAML in `objects/`, registered under `objects:` in `config.yml`, deployed in the
same push as the app. See `datazone-knowledge-object` for the schema; what matters here:

- **Objects are not usable until `READY`** (`PENDING_MIGRATION → MIGRATING → READY`).
  Instance writes fail with 400 until then, and a successful deploy can still end in
  `ERROR` at migration. Objects migrate first, then the app builds.
- **Instance endpoints take the object's id, not its name.** Resolve it once at startup
  and hold it; never hardcode an id.
- **Every instance carries `_key` and `_version`.** `_key` is what `PATCH` and `DELETE`
  address — never construct one from the primary key, never show it to the user.
- **Instance-list filters are a different format** from the rest of the API: repeated
  `filters`, each a URL-encoded JSON `{column, operator, value}`, ANDed. Operators:
  `equal`, `not_equal`, `contains`, `not_contains`, `greater_than`, `less_than`. No OR,
  no IN. Page — never load everything to filter in the browser.
- Expect `409` (primary key collision), `404` (unknown key), `400` (payload mismatch or an
  attempt to change a primary key). Show the message; the user can act on all three.

Keep one thin module per object (`src/lib/orders.ts`) holding its id lookup and its calls,
so `branch` and the paths are written once. Worked example, with the read/write pattern:
`references/api-reference.md`.

## UI components and styling

**Datazone studio apps use [shadcn/ui](https://ui.shadcn.com) (`new-york` style) on
Tailwind 4**, with the single `radix-ui` package for primitives, `lucide-react` for icons,
and `cn()` from `@/lib/utils` for class merging. Fonts are Inter and Roboto Mono,
self-hosted. The base colour is `slate`, in oklch.

Components are not a dependency: their source is copied into `src/components/ui/` and
belongs to the app from then on. Add them from the official registry — `components.json`
in the app is already configured for it:

```bash
cd studio/<alias>
npx shadcn@latest add button card table     # writes src/components/ui/
```

The scaffold ships `app-layout.tsx` and leaves `src/components/ui/` empty, so the first
build cannot fail on a component nobody generated. Datazone builds against these twenty:
alert, avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, popover,
progress, select, separator, skeleton, switch, table, tabs, textarea, tooltip. Others in the
registry work, but these are what the theme is verified against.

Compose from components rather than hand-writing markup — they carry the theme, focus
states and keyboard behaviour. Plain Tailwind is right for layout.

Then **check `package.json`**: the CLI writes `^` ranges, so pin them exactly, and Radix
must appear once as `radix-ui` (`"radix-ui": "1.6.7"`) rather than one package per
primitive. **Tooltip needs one `<TooltipProvider>`**, in `app-layout.tsx` around
`{children}`. If a component file already exists, read it before touching it — it may have
been customised.

**Tailwind 4 is configured in CSS.** There is no `tailwind.config.js` and no
`postcss.config.js`; adding one does nothing, because v4 ignores a config file unless
`@config` names it. The theme lives in `src/index.css` and Tailwind scans the source for
classes, so there is no `content` list either.

Style from token names — `bg-background`, `text-muted-foreground`, `border-border`,
`bg-card`, `text-primary` — never literal colours, or the app will not match Datazone and
will break in dark mode. Beyond the shadcn set: `warning`, `success`, `info`, `error`,
`chart-1` … `chart-5`, `font-sans`, `font-mono`.

**Adding a colour takes two entries** — the value, and the `@theme inline` line that turns
it into a utility class:

```css
:root { --brand: oklch(0.55 0.2 250); }
@theme inline { --color-brand: var(--brand); }
```

Without the second, `var(--brand)` works but `bg-brand` does not exist — and a missing
utility class is silent, so the element just renders unstyled.

**`references/styling.md` has the full theme** — every token as the scaffold generates it,
which token to use for what, the layout shell, and worked list / card-grid / dialog-form
pages. Read it when writing UI, when an app looks wrong next to Datazone, or when
`src/index.css` has drifted and you need the original back.

## Local development

`npm install && npm run dev` renders the app, but `BASE_URL` is `/`, so the SDK resolves
the API to `/api`, which the dev server does not serve. Either develop against a built app,
or add a proxy to `vite.config.js` yourself pointing `/api` at your deployment (cookies are
same-origin, so you will need to be signed in there).

## Gotchas

- **A green build is not a working app.** `base`, a missing `<Route>` and a leading-slash
  asset path all build cleanly and fail in the browser.
- **The build is per branch.** An app on `feat2` reads `feat2` only if you pass `branch`.
- **`is_stale` means the branch moved on** since the served build — push then build, and
  re-build after every push you want served.
- **Statuses**: `NOT_BUILT`, `QUEUED`, `BUILDING`, `READY`, `ERROR`, `TIMEOUT`. Logs and
  errors are on the Builds tab (`GET /studio-app-build/{id}/logs`).
- **Deleting the app removes its directory** as well as the `config.yml` entry; git history
  is the only way back.
- **Cross-organisation access is refused**, not merely hidden: an app is served only to
  users in its own organisation.
- **The SDK is vendored per app**, so an app scaffolded a while ago carries an older copy. If
  `executeQuery` in `src/lib/datazone.ts` reads `return apiFetch<T[]>("/dataset/query", …)` it
  predates the response envelope and returns the whole object while typed as rows — it compiles
  and fails on the first `.map`. Replace that one function with the current version.
- **Do not commit secrets.** The bundle is public to anyone who can open the app.

## Verifying your work

Before pushing, check that:

- every new page has a `<Route>` in `App.tsx`
- every import resolves to a file that exists, including each `@/components/ui/...`
- every package imported is in `package.json`, pinned exactly
- `vite.config.js` still has no `base`
- every custom colour has both a `:root` value and an `@theme inline` line
- every knowledge object the app uses is registered under `objects:` in `config.yml`
- every instance call passes `branch` and addresses instances by `_key`
- every flow run and every flow, action and endpoint lookup passes `branch`
- no SQL the app depends on is concatenated from user input — it is in an endpoint whose
  string filters are quoted and escaped in the template
- every poll has a cap and is cleared on unmount, and every trigger is disabled while running
- every view the app refreshes already exists, and is queried by its `name`

Then push, build, and read the Builds tab.

## Related

- `datazone-knowledge-object` — the object YAML, primary keys, migration lifecycle
- `datazone-api` — auth, filter syntax, pagination, links
- `datazone-intelligent-app` — declarative dashboards, when an SPA is more than you need
- `datazone-endpoint` — publish a query or an action as a REST endpoint the app can call
- `datazone-flow` — long-running, multi-step work the app starts and polls
- `datazone-project-setup` — cloning, profiles, the deploy loop

## Reference

- `references/api-reference.md` — the SDK surface, and worked knowledge-object, flow and view modules
- `references/styling.md` — the shadcn setup, the complete theme, and layout samples

Official docs: https://docs.datazone.co/reference/studio-apps/overview
