import { useState } from "react";

import { AppLayout } from "@/components/app-layout";
import { AppNav } from "@/components/app-nav";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SALES_PAGE_SIZE, listSales } from "@/lib/sales";
import { useLoad } from "@/lib/use-load";

const REGIONS = ["EU", "UK", "US", "APAC"];
const ALL = "all"; // a SelectItem value cannot be ""

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });

export function SalesPage() {
  const [region, setRegion] = useState(ALL);
  const [page, setPage] = useState(1);
  const sales = useLoad(() => listSales(page, region === ALL ? undefined : region), [page, region]);

  const total = sales.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SALES_PAGE_SIZE));

  return (
    <AppLayout title="Sales" actions={<AppNav />}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every sale, newest first, read through an endpoint.</p>
        </div>
        <Select
          value={region}
          onValueChange={(value) => {
            setRegion(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Region">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All regions</SelectItem>
            {REGIONS.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {sales.error ? (
          <ErrorBlock title="Could not load sales" message={sales.error} />
        ) : sales.loading && !sales.data ? (
          <LoadingRows rows={8} />
        ) : total === 0 ? (
          <EmptyBlock title="No sales" hint={region === ALL ? "The dataset is empty." : "Try another region."} />
        ) : (
          <>
            <Table className={sales.loading ? "opacity-60" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.data?.rows.map((row) => (
                  <TableRow key={row.order_no}>
                    <TableCell className="font-mono">{row.order_no}</TableCell>
                    <TableCell className="font-mono">{row.day}</TableCell>
                    <TableCell>{row.region}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{money.format(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {total.toLocaleString()} rows · page {page} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || sales.loading} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || sales.loading}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
