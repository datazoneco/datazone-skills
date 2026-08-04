---
name: datazone-intelligent-app
description: Use when building, editing, or debugging a Datazone Intelligent App — the declarative YAML dashboards with charts, filters, and widgets. Triggers on "intelligent app", "datazone dashboard", "app.yml", editing a file registered under `apps:` in config.yml, or requests to add a chart/filter/tab to a Datazone app.
---

# Building Datazone Intelligent Apps

An Intelligent App is a dashboard defined entirely in one YAML file in your project
repository. No frontend code. You write SQL queries and describe how to display them.

## Before you start

Confirm you are in a Datazone project repository — it has a `config.yml` at the root
with `project_name` and `project_id`. If it does not, you are in the wrong directory;
stop and ask the user.

## The workflow

1. Create the app YAML file (convention: `apps/<name>.yml`, but any path works)
2. Register it in `config.yml` under `apps:`
3. `git add`, `git commit`, `git push`

The push is the deploy. Datazone picks up the pushed branch, validates every definition
in `config.yml`, and creates or updates the app. There is no separate deploy step.

Never skip step 2. An app file that is not registered in `config.yml` is invisible to
Datazone, and — worse — pushing will **delete** any previously registered app whose path
is no longer listed.

## Registering the app

```yaml
# config.yml
project_name: my-project
project_id: 68f1a2b3c4d5e6f7a8b9c0d1
apps:
  - path: apps/sales.yml
```

`config.yml` uses `extra="forbid"`. Any unrecognised key fails the whole deploy, so do
not invent fields here.

## Minimum viable app

Every one of these keys is required. `components` must contain `charts`, `variables`,
and `filters` even when they are empty lists, and `config` must be present even when
empty.

```yaml
app:
  name: "Sales"
  description: "Revenue overview"

  config: {}

  layout:
    tabs:
      - name: main
        title: "Overview"
        items:
          - type: chart
            name: revenue_total
            span: 4

  components:
    variables: []
    filters: []
    charts:
      - type: number
        name: revenue_total
        title: "Total Revenue"
        query: "SELECT sum(amount) AS revenue FROM orders"
        metrics:
          - name: revenue
            label: "Revenue"
            format: "$0,0"
```

## How the pieces connect

The layout does not contain charts. It contains *references* to charts by name.

```
layout.tabs[].items[].name  ──▶  components.charts[].name
layout.tabs[].filters[]     ──▶  components.filters[].name
components.filters[].affected_variable ──▶ components.variables[].name
components.variables[].name ──▶ {{ name }} inside a chart query
```

Datazone validates all four links at deploy time and rejects the app if any dangles.

## Filters and variables

A filter changes a variable; the variable is interpolated into queries with Jinja.
Three things must line up or the deploy fails:

```yaml
layout:
  tabs:
    - name: main
      title: "Overview"
      filters: [region_filter]        # 1. tab must list the filter
      items: [...]

components:
  variables:
    - name: region                    # 3. variable must exist
      type: string

  filters:
    - type: dropdown
      name: region_filter             # 2. filter listed above
      title: "Region"
      affected_variable: region       # points at the variable
      options:
        type: sql
        query: "SELECT DISTINCT region AS value, region AS label FROM orders"

  charts:
    - type: bar
      name: revenue_by_region
      title: "Revenue by Region"
      query: |
        SELECT region, sum(amount) AS revenue
        FROM orders
        {% if region %}WHERE region = '{{ region }}'{% endif %}
        GROUP BY region
      dimensions:
        - name: region
          label: "Region"
      metrics:
        - name: revenue
          label: "Revenue"
          format: "$0,0"
```

Guard every variable with `{% if %}`. Variables are empty until the user picks a value,
and an unguarded `WHERE region = ''` returns nothing on first load.

## Dimensions vs metrics

- **dimensions** — what you group by (categories, dates, labels)
- **metrics** — the numbers being plotted

Every column your query returns should appear as either a dimension or a metric, and
the `name` must match the SQL column alias exactly. This is the most common failure:
a chart renders empty because the query says `SELECT sum(amount)` and the metric says
`name: revenue`. Always alias explicitly.

## Chart types

Each type enforces its own dimension and metric counts at deploy time. Getting these
wrong is the most common cause of a failed deploy:

| Type | dimensions | metrics |
|---|---|---|
| `number` | **none** | 1, or 2 for a secondary value |
| `radial` | **none** | unconstrained |
| `line`, `bar`, `vertical_bar`, `pie`, `composed` | ≥ 1 | ≥ 1 |
| `heatmap` | **exactly 2** | ≥ 1 |
| `scatter` | ≥ 1 | **exactly 2 or 3** |
| `data_table` | any | **none**, unless `pivot_by` is set |
| `item_list` | **none** | **none** |
| `table`, `custom` | unconstrained | unconstrained |

Note the counter-intuitive ones. A `data_table` puts *every* column in `dimensions`,
including numeric ones — use `number_format` and `table_align` on the dimension instead
of a metric. An `item_list` takes neither; it reads fixed column names straight from the
query (`title`, `description`, `icon`, `badge_text`, …).

`line`, `bar`, `vertical_bar`, `composed`, and `heatmap` support an `axis` block. Every
declared axis must be referenced by at least one metric's `axis_name`, and in vertical
layout either all metrics set `axis_name` or none do.

## Layout

`items` are grid cells. `span` is 1–12 (12 = full width). `height` is pixels, and
setting it makes the cell scroll internally.

Item types: `chart`, `chart-group`, `text`, `table`, `widget`. A `chart-group` nests
other items under `entities`:

```yaml
items:
  - type: chart-group
    name: kpis
    span: 12
    entities:
      - type: chart
        name: revenue_total
        span: 4
      - type: chart
        name: order_count
        span: 4
```

## Gotchas

- **All attribute names are case-sensitive.**
- `options` and `options_query` are mutually exclusive on a chart input. Same for
  static vs sql filter options.
- Number formats are [Numeral.js](http://numeraljs.com/): `$0,0.00`, `0.000%`, `0b`.
  Not Python format strings.
- Custom theme colors must be OKLCH — `oklch(0.7 0.15 250)`. Hex, RGB, and HSL are
  rejected. This applies only to `config.style.custom_style_attributes`; the `color`
  field on a metric does take hex.
- Widgets may only import `react` and `@datazone/widget-sdk`, and must
  `export default` a component. Any other import fails at render, not at deploy.
- A filter defined in `components.filters` but not listed in any tab's `filters` array
  is a hard validation error, not a warning.

## Verifying the deploy

Validation happens server-side after the push, so a successful `git push` does **not**
mean the app deployed. Check the result one of these ways:

- **In the UI** — the project page shows the deploy status and, on failure, the exact
  validation error and which step failed.
- **Via the API** — `GET /project/activities/{project_id}` returns recent pushes with
  their `deploy_status` (`CHECKING`, `SUCCESS`, `FAILED`) and per-step errors.
  `GET /intelligent-app/list?filters=[project.$id][$eq]:{project_id}` confirms the app
  exists.

Failures report the Pydantic error path, which names the offending key exactly — read it
literally rather than guessing. A failed load leaves the previous version of the app in
place; it does not partially apply.

Authenticate API calls with an `x-api-key` header:

```bash
curl -H "x-api-key: $DATAZONE_API_KEY" \
  "https://<your-datazone-host>/project/activities/<project_id>"
```

## Related

- `datazone-project-setup` — cloning a project, profiles, and the deploy loop

## Reference

Full attribute tables for every chart type, filter type, config option, and widget:
`references/yaml-reference.md`

Official docs: https://docs.datazone.co/reference/intelligent-apps/overview
