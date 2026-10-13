# Designing an app that looks like it belongs

Load this when building a dashboard-style studio app, or when an app "works but looks
off". `styling.md` covers the stack and the tokens; this file covers what to do with them —
page anatomy, the few components every good app has, and the mistakes that make an app look
amateur. It is distilled from a production monitoring app (sensor time series, anomaly
events, forecasts) that operators use all day and that stays readable on a plant-floor
screen.

## The one idea

**An impressive studio app is calm, dense and consistent — not decorated.** Stay inside the
Datazone look (light by default, slate neutrals, shadcn components, thin borders) and carry
the customer's brand through a handful of tokens. The polish comes from every chart being
explained, every number being formatted for its audience, and every state (loading, error,
empty, stale) being designed. Gradients, glows, forced dark themes and bespoke palettes
read as "a different product bolted onto Datazone".

## 1. Brand through tokens, not through components

Do not restyle components. Edit the theme in `src/index.css`, and only these parts of it:

| Token | Set it to |
|---|---|
| `--primary`, `--ring` | the brand's main colour (and a lighter variant under `.dark`) |
| `--chart-1` … `--chart-5` | a ramp built from the brand, dark → light, plus one warm accent for contrast |
| brand tokens (new) | the logo's own colours, for the few places that need them |

Everything else — `--background`, `--card`, `--border`, `--muted`, `--destructive`, the
status colours — stays as the scaffold generated it. That is what keeps the app looking like
Datazone.

Sample the brand colours from the logo file rather than eyeballing them, and write them in
oklch like the rest of the theme:

```css
:root {
  --brand-navy: oklch(0.38 0.11 252);
  --brand-cyan: oklch(0.735 0.136 222);

  --primary: var(--brand-navy);
  --ring: oklch(0.62 0.114 222);

  /* dark → light, following the logo's own gradient */
  --chart-1: oklch(0.38 0.11 252);
  --chart-2: oklch(0.62 0.114 222);
  --chart-3: oklch(0.735 0.136 222);
  --chart-4: oklch(0.80 0.113 218);
  --chart-5: oklch(0.707 0.156 67);   /* the one warm colour: guides, warnings, "look here" */
}
.dark {
  --primary: oklch(0.735 0.136 222);   /* the light end, or the button vanishes into the page */
  /* The ramp runs the other way: a navy line on a navy-tinted dark surface is invisible. */
  --chart-1: oklch(0.735 0.136 222);
  --chart-2: oklch(0.80 0.113 218);
  --chart-3: oklch(0.62 0.114 222);
}
@theme inline {                          /* a token without this line has no utility class */
  --color-brand-navy: var(--brand-navy);
  --color-brand-cyan: var(--brand-cyan);
}
```

- **Light is the default.** Do not put `class="dark"` on `<html>` unless the customer asked
  for it; operators open these apps on shared screens in bright rooms. Keep the `.dark`
  block correct anyway, so a toggle can be added later.
- **Charts take colours as `var(--chart-N)`** (also `var(--border)`, `var(--muted-foreground)`),
  never as literals. SVG `fill`/`stroke` accept `var()`, and that one habit is what makes
  every chart survive a theme change.
- **Status is a token, not a hex.** `text-success`, `text-warning`, `text-destructive`,
  `bg-warning/10`, `border-destructive/30`. If the app needs its own states (for example a
  stock-health scale), add them as tokens with both a value and an `@theme inline` line.
- **Third-party widgets bring their own CSS** with hardcoded colours (a range slider, a date
  picker). Rebind them to tokens in `index.css`, scoped under one wrapper class so nothing
  else is affected, and keep the override next to the theme.

## 2. Page anatomy

Top to bottom, the same on every page:

```
┌ sticky header: logo │ app name ········· [entity selector] [live status] ┐
│ tab nav: underlined active tab                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ h1 page title                                  [page actions]           │
│ mono identifier · one-line description                                  │
│ shared controls (time window, filters)                                  │
│ KPI row  (4–6 tiles)                                                    │
│ charts   (2/3 + 1/3 on wide screens, full width below)                  │
│ tables / lists                                                          │
│ optional insight panel                                                  │
└ footnote: timezone, how figures are computed ───────────────────────────┘
```

```tsx
<div className="min-h-screen bg-background">
  <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
    <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
      <Logo className="h-5 shrink-0" />
      <span className="hidden h-5 w-px bg-border sm:block" />
      <span className="hidden text-sm font-semibold sm:block">App name</span>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">{/* selector, live badge */}</div>
    </div>
    <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 sm:px-6">
      {/* NavLink: "-mb-px border-b-2 px-3 py-2 text-sm font-medium";
          active "border-brand-cyan text-foreground", idle "border-transparent text-muted-foreground" */}
    </nav>
  </header>
  <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
    <h1 className="text-xl font-semibold tracking-tight">Page title</h1>
    <p className="mt-0.5 text-xs text-muted-foreground">
      <span className="font-mono">entity.identifier</span> · what this page shows
    </p>
    {children}
  </main>
</div>
```

- Dashboards want **`max-w-[1400px]`**, not the scaffold's `max-w-5xl`, and `space-y-4`
  between blocks. Tighter than a form page: the reader scans, not reads.
- **Tabs for pages, not a sidebar.** Five or six tabs in the header is the norm; each is
  one question ("Overview", "Events", "Quality", "Forecast"), and the last can be a short
  usage guide.
- **State that matters across tabs lives above the router** (`AppStateProvider` wrapping
  `<Routes>`): the selected entity, the time window, the active filters. Someone who zoomed
  into an incident on one tab expects the next tab to open on the same window. Persist the
  entity choice in `localStorage` with a `try/catch`, because private windows throw.
- **Make the shell take a `showRange`-style flag** for pages that own their own controls,
  instead of forking the layout.
- The **footnote** is where conventions go: time zone, how figures are filtered, what a
  null means. Small (`text-[11px] text-muted-foreground`), but present.

## 3. KPI tiles

Four to six per row (`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6`), each
answering one question:

```tsx
<div className="rounded-lg border bg-card p-4">
  <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
    <Gauge className="h-3 w-3" />
    <span className="truncate">Latest value</span>
  </div>
  <div className="mt-2 flex items-baseline gap-1.5">
    <span className="font-mono text-2xl leading-none font-semibold tabular-nums">9.5</span>
    <span className="text-xs text-muted-foreground">m³/s</span>
  </div>
  <p className="mt-1.5 text-xs leading-snug text-muted-foreground">median 9.19</p>
</div>
```

- **The hint is part of the tile**, not a tooltip. A reader looking at "24,280" must see
  that it counts merged incidents rather than raw samples without hovering to find out.
- **Tone carries meaning**, and only one tile per row should carry it: brand colour for
  the headline number, `text-warning`/`text-destructive` for a figure that crossed a
  threshold, default for the rest. A row of coloured numbers is a row of noise.
- Numbers are **`font-mono tabular-nums`** so digits line up as values change.
- While loading, show a shimmer in the value's slot — never a confident `0` or `—`.

## 4. Chart cards

Wrap Recharts **once**, in a `charts.tsx`, and let every page compose from it. That is what
makes a ten-chart app look like one design.

```tsx
export function ChartFrame({ title, description, actions, children, className }: Props) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}
```

- **Every chart says how to read it**, in one sentence under the title: what the shaded
  band is, what the dashed lines mean, what a second peak implies. This is the difference
  between a chart and a decoration. One sentence — not a paragraph.
- **One axis style.** Grid is dashed, horizontal only, `stroke="var(--border)"`; axes have
  no line and no tick marks, `fontSize: 11`, `stroke="var(--muted-foreground)"`.
- **Measure the y-axis width** from the longest formatted label (clamped, say, 40–96px).
  A fixed width clips `500.000` the first time a count reaches six digits.
- **Count axes get `allowDecimals={false}`**, or the ticks read 0, 0.5, 1 and then round to
  "1 1 1 0 0".
- **Category axes thin with `interval`**, not `minTickGap` (which only applies to numeric/time
  axes); a year of weekly buckets otherwise writes hundreds of labels over each other.
- **`maxBarSize={64}`** and `radius={[2, 2, 0, 0]}` so a window with four populated buckets
  is not four enormous blocks.
- **Uncertainty is a band, not extra lines**: an `Area` over `[min, max]` at
  `fillOpacity ≈ 0.18`, with the mean or forecast line through it. A bucket average alone
  hides the day that dropped to zero for six hours.
- **Reference lines are dashed and labelled** (`label` at `insideTopRight`, `fontSize: 10`).
  Compute them from the window's own data, so they mean "unusual for this period".
- **One tooltip component** for all charts: `rounded-md border bg-popover px-3 py-2 text-xs
  shadow-md`, a coloured square per series, values in `font-mono`, a range shown as
  `low – high`, never `[7,19]`.
- **Turn animation off** (`isAnimationActive={false}`) on charts that refresh on a timer or
  redraw on every filter change; keep it on for one-off charts that load once.
- **Tens of thousands of points do not belong in SVG.** Past a few thousand, draw on
  `<canvas>`: it renders in milliseconds and overlapping points shade into a density plot
  for free. Measure label widths with `measureText` for the gutter, because canvas clips
  silently.
- **Make position carry the meaning.** Draw an "acceptable" zone as a tinted region and the
  out-of-bounds zones above and below it; a dot's *position* then says whether it is out of
  band, without the reader decoding a colour.

## 5. States are part of the design

An app that goes blank while loading reads as broken. Decide loading, error and empty in one
place — a `QueryBoundary` — so every card behaves the same:

```tsx
<QueryBoundary state={series} height="h-[300px]" loadingLabel="Reading series"
  empty={{ title: "No records in this range", hint: "Try widening the window." }}>
  {(rows) => <SignalChart data={rows} />}
</QueryBoundary>
```

- **Placeholders must be visible.** shadcn's `Skeleton` paints `bg-accent`, which is about
  3% lighter than a white card: on a card it looks like empty space, which is worse than no
  placeholder. Use `bg-muted` with a moving highlight instead.
- **Shape the placeholder like the thing it stands in for**: axis ticks and bars for a
  chart, rows for a table, a short block for a KPI value. A grey rectangle says "something
  is missing"; a chart-shaped one says "a chart is coming". Use fixed heights, not random
  ones — reshuffling placeholders look like live data.
- **Error block**: `rounded-lg border border-destructive/30 bg-destructive/5 p-4`, an icon,
  a one-line title, and the API's own message underneath.
- **Empty block**: dashed border, an icon, a title and a hint saying what to change.
- **Never blank a live view during a refresh.** Distinguish *the inputs changed* (clear the
  data and show the placeholder — the old result answers a question nobody asked) from *the
  poll fired* (keep the data, flip a `refreshing` flag, show a small "refreshing" badge).
  Drop responses from superseded requests; dragging a slider fires several, and the slowest
  is rarely the one that should win.
- **Disabled queries are not loading.** If a query waits on something else, stop claiming
  to be loading, or the page spins forever.

## 6. Make it feel live and trustworthy

- **A live badge in the header that measures freshness** instead of decorating the page with
  a green dot: *live* (under ~5 min), *delayed* (under ~2 h), *stalled*. Compute the age in
  the database (`dateDiff` against the server's `now()`), not by subtracting in the browser —
  a viewer's UTC offset otherwise turns a 20-second-old feed into a permanently red badge.
  Tick the age up locally between polls. A pulsing ring on the dot (and
  `prefers-reduced-motion` support) is enough animation.
- **Format for the audience.** Build `Intl` formatters once (`new Intl.NumberFormat("tr-TR")`,
  not hand-rolled), in the locale and *explicit time zone* of the people reading. State the
  zone in the footnote. Show `—` for null, never `0` or `NaN`. Avoid abbreviations that read
  differently by locale ("B" for billion vs thousand): abbreviate only millions.
- **Parse timestamps deliberately.** A bare `2026-09-25T16:51:30` is read as browser-local;
  if the column is UTC, a browser three hours east places every event three hours early.
  Select timestamps with an explicit offset, or append `Z` when there is none.
- **Click-through beats navigation.** From a list of events, a click should land on the
  detail page already focused on that event's window (`focusOn(start, end)` in the shared
  state), not on a blank form.

## 7. Controls

- **Segmented selector** for a small set of entities: `flex rounded-md border bg-card p-0.5`,
  buttons `rounded-[5px] px-2.5 py-1 text-xs font-medium`, active
  `bg-primary text-primary-foreground`.
- **Time window**: preset chips (1 h · 24 h · 7 d · 30 d · 90 d · 1 y · all) plus a range
  slider over the data's own span, with the chosen window and its length shown underneath.
  Pick the aggregation bucket from the window length and *say which one* ("3 h bucket" in the
  chart title) so a reader never mistakes a bucket average for a sample.
- **Method tabs** (pill buttons with a one-line count underneath) when the same data can be
  judged several ways; show the rule's plain-language definition under the tabs.
- **Date inputs** state their zone in the label ("Start (local time)").

## 8. Tables and lists

shadcn `Table` inside a card, with the same title-and-description header as a chart.
Timestamps, identifiers and numbers in `font-mono`; numbers right-aligned; categories as
`Badge variant="outline"` with a status colour; secondary numbers in `text-muted-foreground`.
Cap long lists (top N) and say so in the description.

## 9. An AI insight panel, when there is a model to call

If an action or flow can summarise what is on screen, give it a panel — but make it
**opt-in**. It costs a model call and takes seconds, so run it on a button, never on every
slider drag.

- Container: `rounded-lg border bg-gradient-to-br from-brand-navy/[0.04] to-brand-cyan/[0.06]`
  — the only gradient in the app, and a faint one; swap to a barely-there tint under `.dark`.
- Header with a `Sparkles` icon, a one-line purpose, and a `Generate` / `Regenerate` button.
- Content: a headline sentence, three or four bullets, a "Watch" box for what to check, and
  a footer with the window and model used.
- **Flag a stale answer** ("generated for a different window") rather than silently showing
  commentary about data that is no longer on screen.

## 10. Brand assets

- The logo is a file in `public/` or an inline SVG component. Reference `public/` files with
  a **relative** path or `import.meta.env.BASE_URL` — a leading `/` resolves against the
  domain root and 404s once the app is served under its slug.
- `index.html`: set `lang`, a real `<title>` ("Customer · App name"), a relative favicon,
  and `<meta name="theme-color">` in the brand colour.
- A built-in **usage guide** tab (with a few annotated screenshots kept in `public/docs/`)
  is worth the hour: it is what lets someone else operate the app without you.

## 11. Dependencies for charts

- `recharts` pinned exactly, with `react-is` pinned to the same version as `react` (Recharts
  needs it as a peer).
- Add `@types/react` and `@types/react-dom` to `devDependencies`. The scaffold has none, so
  `tsc --noEmit` reports `Cannot find namespace 'React'` or silently loosens JSX types, and
  the type-check you rely on before pushing is weaker than it looks.
- `npx shadcn@latest add …` can write `import { cn } from "cn"` (and add a `cn` package)
  instead of `@/lib/utils`. Fix the imports and remove the dependency.

## 12. Look at it before you push

A green build is not a good-looking app. Render it:

1. `npx vite build`, then serve `dist/` from a tiny local server that also answers the few
   `/api/...` calls the page makes with fixture JSON (the dev server does not serve `/api`).
2. Screenshot with headless Chrome through `puppeteer-core` and the system Chrome, from a
   scratch directory outside the project. **Set a viewport tall enough for the page and
   take a normal screenshot, not `fullPage`**: a full-page capture resizes the window,
   `ResponsiveContainer` redraws, and Recharts restarts its animation — you get blank or
   half-drawn charts that look like bugs.
3. Wait a few seconds for count-up and chart animations before capturing.
4. Check at ~1500px and ~800px wide, light and dark.

## 13. Mistakes that make an app look amateur

- A forced dark theme with glows and gradient hero numbers, on a product that is light.
- Colours that are not tokens: `#0ea5e9`, `bg-slate-50`, a green written as a hex in a chart.
- A chart with no explanation, or with a paragraph of explanation.
- A y-axis showing `0.5` requests, or labels clipped at the left edge.
- Six differently styled card variants. Make one `Panel`/`ChartFrame` and use it.
- Coloured numbers on every KPI tile.
- A spinner or blank card while loading, and a chart that blinks every poll.
- Dates in the wrong locale or time zone, `NaN` in a tile, `0` meaning "unknown".
- Text where a visual would do — and a visual with no text saying what it shows.
- A tooltip provider per tooltip, a fixed `h-[300px]` that clips on a phone, no `px-4` gutter.
