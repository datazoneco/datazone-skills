import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES, Order, OrderFields, OrderStatus, createOrder, updateOrder } from "@/lib/orders";

type Draft = { order_no: string; customer: string; status: OrderStatus; total: string; ordered_at: string };

function toDraft(order?: Order): Draft {
  return {
    order_no: order?.order_no ?? "",
    customer: order?.customer ?? "",
    status: order?.status ?? "DRAFT",
    total: order?.total == null ? "" : String(order.total),
    ordered_at: order?.ordered_at ?? new Date().toISOString().slice(0, 10),
  };
}

function toFields(draft: Draft): OrderFields {
  return {
    order_no: draft.order_no.trim(),
    customer: draft.customer.trim(),
    status: draft.status,
    total: draft.total === "" ? null : Number(draft.total),
    ordered_at: draft.ordered_at,
  };
}

/**
 * Creates an order, or edits `order` when one is given. Calls `onSaved` after a successful write so
 * the page re-reads the list rather than patching it locally.
 */
export function OrderDialog({
  open,
  order,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  order?: Order;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(order));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the chosen order each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(toDraft(order));
      setError(null);
    }
  }, [open, order]);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const fields = toFields(draft);
      if (order) {
        // PATCH only what changed; the primary key is not editable and the API rejects a change to it.
        const original = toFields(toDraft(order));
        const { order_no: _primaryKey, ...editable } = fields;
        const changes = Object.fromEntries(
          Object.entries(editable).filter(([field, value]) => original[field as keyof OrderFields] !== value),
        );
        if (Object.keys(changes).length > 0) await updateOrder(order._key, changes);
      } else {
        await createOrder(fields);
      }
      onOpenChange(false);
      onSaved();
    } catch (problem) {
      // 409 duplicate order number, 400 invalid value, 403 no permission: all worth showing as-is.
      setError((problem as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{order ? `Edit ${order.order_no}` : "New order"}</DialogTitle>
          <DialogDescription>Orders are stored as instances of the Order knowledge object.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="order_no">Order number</Label>
            <Input
              id="order_no"
              value={draft.order_no}
              onChange={(event) => set("order_no", event.target.value)}
              disabled={Boolean(order)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <Input id="customer" value={draft.customer} onChange={(event) => set("customer", event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={draft.status} onValueChange={(value) => set("status", value as OrderStatus)}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="total">Total</Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0"
                value={draft.total}
                onChange={(event) => set("total", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ordered_at">Order date</Label>
            <Input
              id="ordered_at"
              type="date"
              value={draft.ordered_at}
              onChange={(event) => set("ordered_at", event.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : order ? "Save changes" : "Create order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
