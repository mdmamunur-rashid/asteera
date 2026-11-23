import { eq, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getStockMap } from "@/lib/queries";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function ProductDemandPage() {
  const [items, stock, activeLines] = await Promise.all([
    db.select().from(schema.items),
    getStockMap(),
    db.select({ itemId: schema.orderLines.itemId, qty: schema.orderLines.qty })
      .from(schema.orderLines)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
      .where(notInArray(schema.orders.status, ["Delivered", "Cancelled", "Returned"])),
  ]);

  const demandMap = new Map<number, number>();
  for (const l of activeLines) {
    demandMap.set(l.itemId, (demandMap.get(l.itemId) ?? 0) + Number(l.qty));
  }

  const rows = items
    .map((i) => {
      const demand = demandMap.get(i.id) ?? 0;
      const remaining = stock.get(i.id)?.remaining ?? 0;
      const shortfall = Math.max(0, demand - remaining);
      return { ...i, demand, remaining, shortfall };
    })
    .filter((r) => r.demand > 0 || r.shortfall > 0)
    .sort((a, b) => b.shortfall - a.shortfall || b.demand - a.demand);

  return (
    <>
      <h2>P. Demand (Product Demand Summary)</h2>
      <div className="card">
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Size</th><th>Pending Order Demand</th><th>Stock Remaining</th><th>Production / Purchase Need</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.sku}</b></td><td>{r.name}</td><td>{r.size}</td>
                <td>{fmt(r.demand)}</td><td>{fmt(r.remaining)}</td>
                <td><span className={`badge ${r.shortfall > 0 ? "bad" : "ok"}`}>{r.shortfall > 0 ? `Need ${fmt(r.shortfall)}` : "Covered"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No pending demand.</p>}
      </div>
    </>
  );
}
