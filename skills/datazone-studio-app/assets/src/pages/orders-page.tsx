import { useState } from "react";
import { Plus } from "lucide-react";

import { AppLayout } from "@/components/app-layout";
import { AppNav } from "@/components/app-nav";
import { OrderDialog } from "@/components/order-dialog";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORDER_PAGE_SIZE, ORDER_STATUSES, Order, OrderStatus, listOrders } from "@/lib/orders";
import { useLoad } from "@/lib/use-load";

const STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: "text-muted-foreground",
  PAID: "text-info",
  SHIPPED: "text-success",
  CANCELLED: "text-error",
};

const ALL = "all";

export function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const orders = useLoad(() => listOrders(page, status === ALL ? undefined : status), [page, status]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | undefined>();

  const total = orders.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));

  function openDialog(order?: Order) {
    setEditing(order);
    setDialogOpen(true);
  }

  return (
    <AppLayout title="Orders" actions={<AppNav />}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and edit orders. Each one is a knowledge object instance.</p>
        </div>
        <div className="flex gap-2">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as OrderStatus | typeof ALL);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {ORDER_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => openDialog()}>
            <Plus className="size-4" />
            New order
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {orders.error ? (
          <ErrorBlock title="Could not load orders" message={orders.error} />
        ) : orders.loading && !orders.data ? (
          <LoadingRows />
        ) : total === 0 ? (
          <EmptyBlock title="No orders" hint={status === ALL ? "Create one to get started." : "Try another status."} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data?.items.map((order) => (
                  <TableRow key={order._key}>
                    <TableCell className="font-mono">{order.order_no}</TableCell>
                    <TableCell>{order.customer}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASS[order.status]}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{order.ordered_at}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{order.total ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDialog(order)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pageCount > 1 && (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <OrderDialog open={dialogOpen} order={editing} onOpenChange={setDialogOpen} onSaved={orders.reload} />
    </AppLayout>
  );
}
