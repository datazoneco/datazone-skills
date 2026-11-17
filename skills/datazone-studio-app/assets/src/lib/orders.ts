import { apiFetch, branch } from "@/lib/datazone";
import { OBJECTS, objectId } from "@/lib/resources";

/** Mirrors objects/order.yml. Keep the two in step when a field changes. */
export const ORDER_STATUSES = ["DRAFT", "PAID", "SHIPPED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderFields = {
  order_no: string;
  customer: string;
  status: OrderStatus;
  total: number | null;
  ordered_at: string; // a `date` field: "YYYY-MM-DD"
};

/** An instance as the API returns it. `_key` addresses PATCH and DELETE; never show it. */
export type Order = OrderFields & { _key: string; _version?: number };

export type OrderPage = { items: Order[]; total_count: number };

export const ORDER_PAGE_SIZE = 20;

/** Instance-list filters are JSON objects, one `filters` parameter each, ANDed. Not the `[f][$eq]:v` syntax. */
function instanceFilter(column: string, operator: string, value: unknown): string {
  return `filters=${encodeURIComponent(JSON.stringify({ column, operator, value }))}`;
}

async function instancesPath(suffix = ""): Promise<string> {
  return `/knowledge-object/${await objectId(OBJECTS.order)}/instances${suffix}`;
}

export async function listOrders(page: number, status?: OrderStatus): Promise<OrderPage> {
  const query = [
    `branch=${encodeURIComponent(branch)}`,
    `page=${page}`,
    `page_size=${ORDER_PAGE_SIZE}`,
    ...(status ? [instanceFilter("status", "equal", status)] : []),
  ].join("&");
  return apiFetch<OrderPage>(`${await instancesPath()}?${query}`);
}

/** 409 when the order number is taken, 400 when a value is not allowed (an unknown status). */
export async function createOrder(fields: OrderFields): Promise<Order> {
  return apiFetch<Order>(`${await instancesPath()}?branch=${encodeURIComponent(branch)}`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

/** Send only what changed. The primary key (order_no) cannot change: the API answers 400. */
export async function updateOrder(key: string, changes: Partial<Omit<OrderFields, "order_no">>): Promise<Order> {
  return apiFetch<Order>(`${await instancesPath(`/${key}`)}?branch=${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}
