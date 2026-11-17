import { useMemo, useState } from "react";
import { CalendarDays, Coins, Receipt, ShoppingCart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";

import { AppLayout } from "@/components/app-layout";
import { AppNav } from "@/components/app-nav";
import { ChartFrame, KpiTile, Segmented } from "@/components/dashboard";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { DailySales, salesByDay } from "@/lib/sales";
import { useLoad } from "@/lib/use-load";

// Build formatters once. Pass the readers' locale instead of undefined when you know it.
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat(undefined);
const shortDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

// The endpoint returns "YYYY-MM-DD". Parse as UTC and format in UTC, or a reader west of UTC sees the day before.
const formatDay = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));

const WINDOWS = [
  { value: 7, label: "7 d" },
  { value: 30, label: "30 d" },
  { value: 90, label: "90 d" },
];

function summarise(days: DailySales[]) {
  const revenue = days.reduce((sum, day) => sum + day.revenue, 0);
  const orders = days.reduce((sum, day) => sum + day.orders, 0);
  const best = days.reduce<DailySales | undefined>((top, day) => (!top || day.revenue > top.revenue ? day : top), undefined);
  return { revenue, orders, average: orders ? revenue / orders : null, best };
}

function ChartTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const row = payload?.[0]?.payload as DailySales | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatDay(row.day)}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-[2px]" style={{ background: "var(--chart-2)" }} />
        <span className="text-muted-foreground">Revenue</span>
        <span className="ml-auto font-mono">{money.format(row.revenue)}</span>
      </p>
      <p className="mt-0.5 pl-4 text-muted-foreground">
        <span className="font-mono">{count.format(row.orders)}</span> orders
      </p>
    </div>
  );
}

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const daily = useLoad(() => salesByDay(days), [days]);
  const kpis = useMemo(() => summarise(daily.data ?? []), [daily.data]);
  const loading = daily.loading && !daily.data;

  return (
    <AppLayout title="Sales overview" actions={<AppNav />}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Revenue and orders over the last {days} days.</p>
        </div>
        <Segmented<number> value={days} options={WINDOWS} onChange={setDays} />
      </div>

      {daily.error ? (
        <div className="mt-6">
          <ErrorBlock title="Could not load sales" message={daily.error} />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile icon={Coins} label="Revenue" value={money.format(kpis.revenue)} hint="Sum of every sale in the window" tone="primary" loading={loading} />
            <KpiTile icon={ShoppingCart} label="Orders" value={count.format(kpis.orders)} hint="One per sale row" loading={loading} />
            <KpiTile
              icon={Receipt}
              label="Average order"
              value={kpis.average == null ? "—" : money.format(kpis.average)}
              hint="Revenue ÷ orders"
              loading={loading}
            />
            <KpiTile
              icon={CalendarDays}
              label="Best day"
              value={kpis.best ? formatDay(kpis.best.day) : "—"}
              hint={kpis.best ? `${money.format(kpis.best.revenue)} that day` : undefined}
              loading={loading}
            />
          </div>

          <ChartFrame
            className="mt-4"
            title="Revenue per day"
            description="Each bar is one day's revenue; days with no sales have no bar."
          >
            {loading ? (
              <div className="h-[280px] animate-pulse rounded-md bg-muted" />
            ) : !daily.data?.length ? (
              <EmptyBlock title="No sales in this window" hint="Try a longer window." />
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily.data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={formatDay}
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      // A category axis ignores minTickGap; thin it to about eight labels with interval.
                      interval={Math.max(0, Math.ceil(daily.data.length / 8) - 1)}
                    />
                    <YAxis
                      tickFormatter={(value: number) => money.format(value)}
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      width={64}
                    />
                    <Tooltip content={ChartTooltip} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="revenue" fill="var(--chart-2)" radius={[2, 2, 0, 0]} maxBarSize={64} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartFrame>
          <p className="mt-3 text-[11px] text-muted-foreground">Days are calendar days in UTC, as stored in the dataset.</p>
        </>
      )}
    </AppLayout>
  );
}
