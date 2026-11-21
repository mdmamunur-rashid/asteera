import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getStockMap } from "@/lib/queries";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const month = new Date().toISOString().slice(0, 7);
  const [items, stock, salesRow, poRow, expRow, ledgerRow, statusRows] = await Promise.all([
    db.select().from(schema.items),
    getStockMap(),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.orders.total}),0)`, c: sql<number>`COUNT(*)`, paid: sql<number>`COALESCE(SUM(${schema.orders.paid}),0)` })
      .from(schema.orders).where(sql`${schema.orders.date} LIKE ${month + "%"} AND ${schema.orders.status} NOT IN ('Cancelled','New')`),
    db.select({ cost: sql<number>`COALESCE(SUM(${schema.purchaseLines.qty}*${schema.purchaseLines.unitCost}),0)` }).from(schema.purchaseLines),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.expenses.amount}),0)` }).from(schema.expenses).where(sql`${schema.expenses.date} LIKE ${month + "%"}`),
    db.select({ due: sql<number>`COALESCE(SUM(${schema.ledgerEntries.totalDue}-${schema.ledgerEntries.amountPaid}),0)` }).from(schema.ledgerEntries),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` }).from(schema.orders).groupBy(schema.orders.status),
  ]);
  const poPaid = await db.select({ p: sql<number>`COALESCE(SUM(${schema.purchaseOrders.paid}),0)` }).from(schema.purchaseOrders);

  const stockValue = items.reduce((s, i) => s + (stock.get(i.id)?.remaining ?? 0) * i.purchasePrice, 0);
  const low = items.filter((i) => (stock.get(i.id)?.remaining ?? 0) <= i.reorderLevel);
  const poOwed = Number(poRow[0].cost) - Number(poPaid[0].p);

  return (
    <>
      <h2>Dashboard</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="stat c-green"><b>৳ {fmt(salesRow[0].t)}</b><span>Sales this month ({salesRow[0].c} invoices)</span></div>
        <div className="stat c-blue"><b>৳ {fmt(Number(salesRow[0].t) - Number(salesRow[0].paid))}</b><span>Receivable this month</span></div>
        <div className="stat c-rose"><b>৳ {fmt(expRow[0].t)}</b><span>Expenses this month</span></div>
        <div className="stat c-teal"><b>৳ {fmt(stockValue)}</b><span>Stock value (at cost)</span></div>
        <div className="stat c-amber"><b>৳ {fmt(poOwed)}</b><span>Owed on purchase orders</span></div>
        <div className="stat c-violet"><b>৳ {fmt(ledgerRow[0].due)}</b><span>Owed to production suppliers</span></div>
      </div>
      <div className="card">
        <h3>Orders by status</h3>
        {statusRows.length === 0 ? <p>No orders yet.</p> : statusRows.map((r) => <span key={r.s} className="badge" style={{ marginRight: 8 }}>{r.s}: {r.c}</span>)}
      </div>
      <div className="card">
        <h3>Reorder needed ({low.length})</h3>
        <table><thead><tr><th>SKU</th><th>Name</th><th>Size</th><th>Remaining</th><th>Level</th></tr></thead>
          <tbody>{low.slice(0, 20).map((i) => (
            <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.size}</td><td>{fmt(stock.get(i.id)?.remaining ?? 0)}</td><td>{i.reorderLevel}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
