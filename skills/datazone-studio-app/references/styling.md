# Components and styling

Load this when writing UI in a studio app, or when an app looks wrong next to the rest of
Datazone. Everything here is what the scaffold already sets up — the point of this file is
that an agent working in a local clone can see it without guessing.

## What the stack is

| Piece | Choice |
|---|---|
| Components | [shadcn/ui](https://ui.shadcn.com), `new-york` style, Tailwind 4 variants |
| CSS | Tailwind 4, configured in `src/index.css` — no `tailwind.config.js`, no PostCSS config |
| Primitives | the single `radix-ui` package (**not** `@radix-ui/react-*`) |
| Icons | `lucide-react` |
| Variants | `class-variance-authority`, merged by `cn()` from `@/lib/utils` |
| Animation | `tw-animate-css` — every overlay's `data-[state=open]:animate-in` needs it |
| Fonts | Inter (sans) and Roboto Mono (mono), self-hosted via `@fontsource-variable/*` |
| Base colour | `slate`, in oklch |

shadcn components are **not a dependency**. Their source is copied into
`src/components/ui/` and belongs to the app from then on — edit it freely.

## Adding components

The scaffold ships `components/app-layout.tsx` and leaves `src/components/ui/` empty, so
the first build cannot fail on a component nobody generated. Add what you need from the
official registry — the app's `components.json` is already configured for it:

```bash
cd studio/<alias>
npx shadcn@latest add button card table badge dialog
```

Datazone builds against these twenty: `alert`, `avatar`, `badge`, `button`, `card`,
`checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `progress`, `select`,
`separator`, `skeleton`, `switch`, `table`, `tabs`, `textarea`, `tooltip`. Anything else in
the registry will install and work, but these are the ones the theme is verified against.

After adding, **check `package.json`**:

- The CLI writes `^` ranges. Pin them exactly, so a rebuild of the same commit installs the
  same code.
- Radix must appear once, as `radix-ui`. If the CLI adds `@radix-ui/react-dialog` you have an
  older item — take the current one.

`<TooltipProvider>` goes in `app-layout.tsx` around `{children}`, once, not around each
tooltip.

If a component file already exists, read it before touching it — it may have been
customised. Do not overwrite it wholesale to "reinstall" it.

## The theme

This is `src/index.css` as the scaffold generates it. It is the whole design system: the
components read only these variables, so restyling the app means editing values here rather
than touching components.

```css
@import "tailwindcss";

/* Overlay enter/exit animations — dialog, popover, select, tooltip, dropdown-menu all need it. */
@import "tw-animate-css";

/* Self-hosted, so no request to a font CDN. Each @font-face carries a unicode-range, so the
   browser downloads only the subsets the page uses. */
@import "@fontsource-variable/inter";
@import "@fontsource-variable/roboto-mono";

/* Dark mode is opt-in via a `dark` class on an ancestor, as in the Datazone frontend. */
@custom-variant dark (&:is(.dark *));

/* Fonts must be declared in @theme, not :root — this is what generates `font-sans` and
   `font-mono`. As plain custom properties they leave those classes on Tailwind's default
   stacks and the app renders in the wrong typeface with nothing to show why. */
@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Roboto Mono Variable", ui-monospace, monospace;
}

:root {
  --radius: 0.625rem;

  --background: oklch(1 0 0);
  --foreground: oklch(0.129 0.042 264.695);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.129 0.042 264.695);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.129 0.042 264.695);
  --primary: oklch(0.208 0.042 265.755);
  --primary-foreground: oklch(0.984 0.003 247.858);
  --secondary: oklch(0.968 0.007 247.896);
  --secondary-foreground: oklch(0.208 0.042 265.755);
  --muted: oklch(0.968 0.007 247.896);
  --muted-foreground: oklch(0.554 0.046 257.417);
  --accent: oklch(0.968 0.007 247.896);
  --accent-foreground: oklch(0.208 0.042 265.755);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.929 0.013 255.508);
  --input: oklch(0.929 0.013 255.508);
  --ring: oklch(0.704 0.04 256.788);

  /* Status colours, matching the Datazone frontend. Not part of shadcn. */
  --warning: hsl(32 95% 44%);
  --success: hsl(161 94% 30%);
  --info: hsl(217 91% 60%);
  --error: hsl(0 84% 60%);

  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);

  --sidebar: oklch(0.984 0.003 247.858);
  --sidebar-foreground: oklch(0.129 0.042 264.695);
  --sidebar-primary: oklch(0.208 0.042 265.755);
  --sidebar-primary-foreground: oklch(0.984 0.003 247.858);
  --sidebar-accent: oklch(0.968 0.007 247.896);
  --sidebar-accent-foreground: oklch(0.208 0.042 265.755);
  --sidebar-border: oklch(0.929 0.013 255.508);
  --sidebar-ring: oklch(0.704 0.04 256.788);
}

.dark {
  --background: oklch(0.129 0.042 264.695);
  --foreground: oklch(0.984 0.003 247.858);
  --card: oklch(0.208 0.042 265.755);
  --card-foreground: oklch(0.984 0.003 247.858);
  --popover: oklch(0.208 0.042 265.755);
  --popover-foreground: oklch(0.984 0.003 247.858);
  --primary: oklch(0.929 0.013 255.508);
  --primary-foreground: oklch(0.208 0.042 265.755);
  --secondary: oklch(0.279 0.041 260.031);
  --secondary-foreground: oklch(0.984 0.003 247.858);
  --muted: oklch(0.279 0.041 260.031);
  --muted-foreground: oklch(0.704 0.04 256.788);
  --accent: oklch(0.279 0.041 260.031);
  --accent-foreground: oklch(0.984 0.003 247.858);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.551 0.027 264.364);

  --warning: hsl(32 95% 44%);
  --success: hsl(161 94% 30%);
  --info: hsl(217 91% 60%);
  --error: hsl(0 84% 60%);

  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);

  --sidebar: oklch(0.208 0.042 265.755);
  --sidebar-foreground: oklch(0.984 0.003 247.858);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.984 0.003 247.858);
  --sidebar-accent: oklch(0.279 0.041 260.031);
  --sidebar-accent-foreground: oklch(0.984 0.003 247.858);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.551 0.027 264.364);
}

/* What turns a token into a utility class: --color-muted here is what makes `bg-muted` and
   `text-muted-foreground` exist. A token with no entry here is still readable as
   var(--token) but has no class. */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-warning: var(--warning);
  --color-success: var(--success);
  --color-info: var(--info);
  --color-error: var(--error);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}
```

If an app is missing this file or has drifted from it, copying the block above back over
`src/index.css` is the fix.

## Which token to use

Style from these names, never from literal colours — a hardcoded `#fff` or `bg-slate-50`
looks wrong beside Datazone and breaks in dark mode.

| Purpose | Class |
|---|---|
| Page background / text | `bg-background`, `text-foreground` |
| A panel or row surface | `bg-card`, `text-card-foreground` |
| Secondary or de-emphasised text | `text-muted-foreground` |
| A quiet fill (hover, empty state) | `bg-muted` |
| Primary action | `bg-primary text-primary-foreground` |
| Secondary action | `bg-secondary text-secondary-foreground` |
| Hover / selected | `bg-accent text-accent-foreground` |
| Destructive action or error text | `bg-destructive`, `text-destructive` |
| Borders, inputs, focus ring | `border-border`, `border-input`, `ring-ring` |
| Status | `text-warning`, `text-success`, `text-info`, `text-error` |
| Charts | `fill-chart-1` … `fill-chart-5` |
| Corners | `rounded-md`, `rounded-lg` (from `--radius`) |
| Type | `font-sans`, `font-mono` |

Typography and spacing conventions the scaffold follows: page title
`text-2xl font-semibold tracking-tight`, section heading `text-sm font-semibold`, body and
table text `text-sm`, help text `text-sm text-muted-foreground`, identifiers and numbers
`font-mono`. Content column `mx-auto max-w-5xl px-6 py-8`.

**Adding a colour takes two entries** — the value, and the `@theme inline` line that makes
the utility class exist:

```css
:root { --brand: oklch(0.55 0.2 250); }
.dark { --brand: oklch(0.72 0.18 250); }
@theme inline { --color-brand: var(--brand); }
```

Without the second, `var(--brand)` still resolves but `bg-brand` does not exist, and a
missing utility class is silent — the element just renders unstyled.

## Layout

### The shell

`src/components/app-layout.tsx`, as scaffolded. Every page renders inside it, and shared
providers belong here rather than per page:

```tsx
import { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function AppLayout({
  title,
  actions,
  className,
  children,
}: {
  title: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <span className="text-sm font-semibold">{title}</span>
          {actions}
        </div>
      </header>
      <main className={cn("mx-auto max-w-5xl px-6 py-8", className)}>{children}</main>
    </div>
  )
}
```

### A list page

The shape most studio app pages take — header action, loading skeleton, error, empty state,
table. All four states are worth writing: an app that renders nothing while it loads reads
as broken.

```tsx
import { useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listOrders, Order } from "@/lib/orders"

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "text-muted-foreground",
  PAID: "text-info",
  SHIPPED: "text-success",
  CANCELLED: "text-error",
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listOrders()
      .then((page) => setOrders(page.items))
      .catch((problem) => setError(problem.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout
      title="Orders"
      actions={
        <Button size="sm">
          <Plus className="size-4" />
          New order
        </Button>
      }
    >
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one to get started.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order._key}>
                <TableCell className="font-mono">{order.order_no}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_CLASS[order.status]}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{order.total ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AppLayout>
  )
}
```

`key={order._key}` is the only place an instance key belongs in the UI — never render it as
text.

### A card grid

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {regions.map((region) => (
    <Card key={region.name}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{region.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tracking-tight">{region.total}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

### A form in a dialog

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>New order</DialogTitle>
      <DialogDescription>Orders are stored as knowledge object instances.</DialogDescription>
    </DialogHeader>
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="order_no">Order number</Label>
        <Input id="order_no" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            {["DRAFT", "PAID", "SHIPPED", "CANCELLED"].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create order"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

Surface the API's own message on a failed write — a `409` on a duplicate primary key or a
`403` on a permission is something the user can act on.

### Dark mode

Tokens handle it, so a page built from them works in both. Nothing toggles the `dark` class
by default; if the app needs a toggle, add one that puts `dark` on `document.documentElement`.
Never hardcode a colour that only reads correctly in one mode.

## Checklist

- Components come from the registry into `src/components/ui/`, then belong to the app
- Versions in `package.json` are pinned exactly, and Radix appears only as `radix-ui`
- No `tailwind.config.js` and no `postcss.config.js` — the theme is `src/index.css`
- Every colour used is a token, and any new token has both a value and an `@theme inline` line
- One `<TooltipProvider>`, in `app-layout.tsx`
- Loading, error, and empty states exist, not just the success path
