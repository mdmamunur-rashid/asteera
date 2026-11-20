import { sql, eq, notInArray, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { NON_STOCK_STATUSES } from "./util";

/** Stock per item = purchased − sold (computed live; replaces updateqtypurchased/sold/remaining). */
export async function getStockMap(): Promise<Map<number, { purchased: number; sold: number; remaining: number }>> {
  const purchased = await db
    .select({ itemId: schema.purchaseLines.itemId, q: sql<number>`COALESCE(SUM(${schema.purchaseLines.qty}),0)` })
    .from(schema.purchaseLines)
    .groupBy(schema.purchaseLines.itemId);

  const sold = await db
    .select({ itemId: schema.orderLines.itemId, q: sql<number>`COALESCE(SUM(${schema.orderLines.qty}),0)` })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(notInArray(schema.orders.status, NON_STOCK_STATUSES))
    .groupBy(schema.orderLines.itemId);

  const map = new Map<number, { purchased: number; sold: number; remaining: number }>();
  for (const p of purchased) map.set(p.itemId, { purchased: Number(p.q), sold: 0, remaining: Number(p.q) });
  for (const s of sold) {
    const cur = map.get(s.itemId) ?? { purchased: 0, sold: 0, remaining: 0 };
    cur.sold = Number(s.q);
    cur.remaining = cur.purchased - cur.sold;
    map.set(s.itemId, cur);
  }
  return map;
}

export async function nextInvoiceNo(): Promise<string> {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const [r] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.orders)
    .where(and(sql`${schema.orders.invoiceNo} LIKE ${d + "-%"}`));
  return `${d}-${String(Number(r?.c ?? 0) + 1).padStart(4, "0")}`;
}

export async function nextPoNo(): Promise<string> {
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const [r] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.purchaseOrders)
    .where(sql`${schema.purchaseOrders.poNo} LIKE ${"PO-" + d + "-%"}`);
  return `PO-${d}-${String(Number(r?.c ?? 0) + 1).padStart(3, "0")}`;
}
