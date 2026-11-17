import { callEndpoint } from "@/lib/datazone";
import { ENDPOINTS, endpointSlug } from "@/lib/resources";

export const SALES_PAGE_SIZE = 25;

export type SaleRow = {
  order_no: string;
  day: string;
  region: string;
  category: string;
  amount: number;
  total_rows: number; // count() OVER (): the filtered total, repeated on every row
};

export type DailySales = { day: string; revenue: number; orders: number };

/**
 * One page of rows. Endpoints ignore page/page_size, so paging is the endpoint's own
 * limit_rows/offset_rows filters, applied in its SQL.
 */
export async function listSales(page: number, region?: string): Promise<{ rows: SaleRow[]; total: number }> {
  const { records } = await callEndpoint<SaleRow>(await endpointSlug(ENDPOINTS.salesRows), {
    region,
    limit_rows: SALES_PAGE_SIZE,
    offset_rows: (page - 1) * SALES_PAGE_SIZE,
  });
  return { rows: records, total: records[0]?.total_rows ?? 0 };
}

export async function salesByDay(days: number): Promise<DailySales[]> {
  const { records } = await callEndpoint<DailySales>(await endpointSlug(ENDPOINTS.salesByDay), { days });
  return records;
}
