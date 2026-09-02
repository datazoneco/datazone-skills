---
name: datazone-studio-app
description: Use when building or debugging a Datazone Studio App — a Vite + React SPA that lives in the project repository and is served by Datazone behind the user's session. Triggers on "studio app", editing files under `studio/<alias>/`, an app registered under `studio_apps:` in config.yml, calling the Datazone API from a React app, `@/lib/datazone`, adding shadcn components or styling a studio app to match Datazone, or a built app that shows a blank page or 404s on its assets.
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

There is no local type-check or build in this loop: `npm install && vite build` runs in
the sandbox. `npm run dev` works for layout, but the API calls will not — the dev server
does not serve `/api` (see "Local development"). Re-read your changes before pushing;
the checklist at the end of this file is what to check.

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
| `executeQuery<T>(sql, tableVersions?)` | SQL over the datasets this user can read; returns row objects |
| `callEndpoint<T>(slug, params?)` | A published endpoint; returns `{records}` |
| `branch` | The branch this bundle was built from |
| `projectId` | The project the app lives in |
| `branchQuery(filters?)` | `branch=…` plus `[field][$eq]:value` filters |
| `DatazoneAuthError` | 401 — the session is gone and the app cannot renew it |
| `DatazoneApiError` | Any other non-2xx, carrying `status` and the API's message |

```tsx
import { callEndpoint, executeQuery, getMe } from "@/lib/datazone"

const user = await getMe()
const rows = await executeQuery<{ region: string; total: number }>(
  "select region, sum(amount) as total from sales group by region",
)
const { records } = await callEndpoint("daily-revenue", { page_size: 50 })
```

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

## Fundamental endpoints

Everything goes through `apiFetch`. Paths are relative to the API root.

| Need | Call |
|---|---|
| who is looking | `GET /user/me` |
| run SQL on datasets | `POST /dataset/query` (`executeQuery`) |
| list datasets | `GET /dataset/list?filters=[project.$id][$eq]:{projectId}` |
| call an endpoint | `GET /endpoint/{slug}?…` (`callEndpoint`) |
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

Then push, build, and read the Builds tab.

## Related

- `datazone-knowledge-object` — the object YAML, primary keys, migration lifecycle
- `datazone-api` — auth, filter syntax, pagination, links
- `datazone-intelligent-app` — declarative dashboards, when an SPA is more than you need
- `datazone-endpoint` — publish a query as a REST endpoint the app can call
- `datazone-project-setup` — cloning, profiles, the deploy loop

## Reference

- `references/api-reference.md` — the SDK surface and a worked knowledge-object module
- `references/styling.md` — the shadcn setup, the complete theme, and layout samples

Official docs: https://docs.datazone.co/reference/studio-apps/overview
