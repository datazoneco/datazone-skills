# Intelligent App YAML — full reference

Everything nests under a single top-level `app:` key.

```yaml
app:
  name: string          # required
  description: string   # required
  icon: string          # optional, Lucide icon name
  config: {}            # required (may be empty — fields have defaults)
  layout: {}            # required
  components: {}        # required
```

## config

| Key | Type | Default | Purpose |
|---|---|---|---|
| `cache` | bool | `true` | Cache query results |
| `cache_ttl` | int | `3600` | Cache lifetime, seconds |
| `hide_llm` | bool | `false` | Hide the AI assistant panel |
| `hide_insights` | bool | `false` | Hide the insights panel |
| `hide_filters` | bool | `false` | Hide the filters panel |
| `hide_header` | bool | `false` | Hide the app header |
| `chart_export_enabled` | bool | `false` | Allow chart export |
| `llm_model_account` | ObjectId | – | Model account for the assistant; validated to exist at deploy |
| `llm_model` | enum | – | Specific LLM model |
| `llm_instruction` | string | – | Custom assistant prompt |
| `insight_agent_instruction` | string | – | Custom insights prompt |
| `default_tab` | string | – | Tab name to open on load |
| `style` | object | – | See below |

### config.style

```yaml
style:
  theme: default        # default | teal | blue | green | purple | orange | amber | mono
  custom_style_attributes:
    "--background": "oklch(0.98 0 0)"
    "--foreground": "oklch(0.2 0 0)"
    "--primary": "oklch(0.55 0.2 260)"
    "--secondary": "oklch(0.7 0.1 200)"
    "--muted": "oklch(0.95 0 0)"
    "--accent": "oklch(0.6 0.18 300)"
    "--chart-1": "oklch(0.6 0.18 260)"
    "--chart-2": "oklch(0.65 0.16 160)"
    "--chart-3": "oklch(0.7 0.15 60)"
    "--chart-4": "oklch(0.55 0.2 320)"
    "--chart-5": "oklch(0.6 0.14 20)"
```

OKLCH only. Hex, RGB, and HSL are rejected here.

## layout

```yaml
layout:
  tabs:
    - name: string          # identifier
      title: string         # displayed
      filters: [string]     # optional; filter names shown on this tab
      items: []             # layout items
```

### Layout items

| Key | Type | Notes |
|---|---|---|
| `type` | enum | `chart`, `chart-group`, `text`, `table`, `widget` |
| `name` | string | Must match a component `name` |
| `span` | int | Grid width 1–12 |
| `height` | int | Pixels; enables internal scroll |
| `entities` | list | Nested items — `chart-group` only |

## components

```yaml
components:
  charts: []      # required key
  variables: []   # required key
  filters: []     # required key
  texts: []       # optional
  widgets: []     # optional
```

### charts

| Key | Type | Notes |
|---|---|---|
| `type` | enum | See chart types below |
| `name` | string | Referenced from layout |
| `title` | string | Displayed |
| `description` | string | Optional |
| `query` | string | SQL, Jinja-templated |
| `chart_inputs` | list | Per-chart controls |
| `axis` | list | line, bar, vertical_bar, composed, heatmap |
| `dimensions` | list | Group-by columns |
| `metrics` | list | Numeric columns |
| `pivot_by` | [string] | Pivot columns |
| `show_labels` | bool | Default `true` |
| `chart_config` | object | See below |

**Chart types and their enforced counts:**

| Type | dimensions | metrics |
|---|---|---|
| `number` | none | 1–2 |
| `radial` | none | unconstrained |
| `line` | ≥ 1 | ≥ 1 |
| `bar` | ≥ 1 | ≥ 1 |
| `vertical_bar` | ≥ 1 | ≥ 1 |
| `pie` | ≥ 1 | ≥ 1 |
| `composed` | ≥ 1 | ≥ 1 |
| `heatmap` | exactly 2 | ≥ 1 |
| `scatter` | ≥ 1 | exactly 2 or 3 |
| `data_table` | any | none unless `pivot_by` is set |
| `item_list` | none | none |
| `table` | unconstrained | unconstrained |
| `custom` | unconstrained | unconstrained |

Axis rules: every axis declared in `axis` must be referenced by at least one metric's
`axis_name`. Under `chart_config.layout: vertical`, either all metrics set `axis_name`
or none do. Under horizontal layout, axis `position` must be `left` or `right`.

#### dimensions

| Key | Type | Notes |
|---|---|---|
| `name` | string | Must equal the SQL column alias |
| `label` | string | Displayed |
| `number_format` | string | Numeral.js |
| `table_align` | enum | `left`, `right` |
| `affected_filter` | string | Clicking a value sets this filter |

#### metrics

| Key | Type | Notes |
|---|---|---|
| `name` | string | Must equal the SQL column alias |
| `label` | string | Displayed |
| `format` | string | Numeral.js |
| `icon` | string | Lucide name — `number` and `radial` only |
| `icon_variant` | enum | `default`, `neutral`, `success`, `warning`, `error` |
| `axis_name` | string | Binds to a named axis |
| `composed_type` | enum | `line` or `bar` — `composed` charts only |
| `submetric_name` | string | Secondary value |
| `submetric_type` | enum | `plain`, `change`, `delta` |
| `color` | string | Hex or Tailwind color |
| `show_label` | bool | |

#### axis

| Key | Type | Notes |
|---|---|---|
| `name` | string | Referenced by `metric.axis_name` |
| `position` | enum | `left` (default), `right`, `top`, `bottom` |
| `format` | string | Numeral.js |
| `hidden` | bool | |

#### chart_config

| Key | Type | Notes |
|---|---|---|
| `show_legend` | bool | |
| `show_labels` | bool | |
| `fill_donut` | bool | Pie only |
| `is_stacked` | bool | |
| `line_type` | enum | `linear`, `monotone`, `step`, `natural` |
| `fill_area` | bool | Line only |
| `custom_chart_type` | string | |
| `sub_expression` | string | |
| `page_size` | int | `data_table` only |
| `layout` | enum | `horizontal`, `vertical` |
| `hide_expression` | string | JavaScript; hides the chart when truthy |

#### chart_inputs

```yaml
chart_inputs:
  - type: dropdown
    name: granularity      # usable as {{ granularity }} in this chart's query
    label: "Granularity"
    default: "day"
    options: [day, week, month]     # OR options_query, never both
    options_query: "SELECT ..."
```

### variables

```yaml
variables:
  - name: string
    type: string     # string | integer | float | boolean | date
```

### filters

| Key | Type | Notes |
|---|---|---|
| `type` | enum | `text`, `number`, `dropdown`, `date` |
| `name` | string | Must be listed in a tab's `filters` |
| `title` | string | Displayed |
| `affected_variable` | string | Must match a declared variable |
| `default_value` | any | |
| `multiple` | bool | Dropdown multi-select, default `false` |
| `placeholder` | string | |
| `options` | object | Dropdown only |

```yaml
# static options
options:
  type: static
  values:
    - value: "eu"
      label: "Europe"

# sql options
options:
  type: sql
  query: "SELECT code AS value, name AS label FROM regions"
  use_input: true     # passes the typed text as {{ search_term }}
```

`date` filter values reach the query as `YYYY-MM-DD` strings.

### texts

```yaml
texts:
  - name: intro
    title: "About"        # optional
    content: |
      Markdown **supported**.
```

### widgets

| Key | Type | Notes |
|---|---|---|
| `name` | string | |
| `title` | string | |
| `description` | string | Optional |
| `source_type` | enum | `inline` (default) or `file` |
| `source` | string | TSX code — required when inline |
| `file` | string | Path to a `.tsx` in the repo — required when file |
| `query` | string | Optional; result passed as `data` |

Contract for the component:
- receives `data` — query rows, or `[]` when no query
- receives `appContext` — `{ filters, setFilter, theme }`
- may import **only** `react` and `@datazone/widget-sdk`
- must `export default` a React component

File widgets are resolved from the repo at deploy time, so the `.tsx` must be committed.

### item_list query columns

An `item_list` chart reads these column names from the query result:

| Column | Notes |
|---|---|
| `icon` | Lucide name, default `Mail` |
| `icon_color` | Tailwind class, default `text-blue-600` |
| `title` | Primary text |
| `description` | Secondary text |
| `timestamp` | Right-aligned |
| `badge_text` | Badge label |
| `badge_variant` | `neutral`, `success`, `warning`, `error` |

## Number formats

[Numeral.js](http://numeraljs.com/) syntax:

| Value | Format | Renders |
|---|---|---|
| 10000 | `0,0.0000` | 10,000.0000 |
| 1000.23 | `$0,0.00` | $1,000.23 |
| 0.974878 | `0.000%` | 97.488% |
| 1024 | `0b` | 1KB |

## Deploy-time validations

The deploy fails, naming the field, when:

1. A layout item references a chart/text/widget name that does not exist
2. A tab lists a filter name that does not exist
3. A filter's `affected_variable` is not a declared variable
4. A filter is declared but not used in any tab's `filters`
5. `config.llm_model_account` points at a missing model account
6. `config.yml` contains an unrecognised key (`extra="forbid"`)
7. A chart type's dimension/metric count constraints are violated
