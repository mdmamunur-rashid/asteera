import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { getDefaultBrand } from "@/lib/settings";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function ProfitLossReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: rawFrom, to: rawTo } = await searchParams;
  const now = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
  const from = rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : `${now.slice(0, 7)}-01`;
  const to = rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : now;

  const [brand, items, lines, expRow, retRow] = await Promise.all([
    getDefaultBrand(),
    db.select().from(schema.items),
    db.select({ itemId: schema.orderLines.itemId, qty: schema.orderLines.qty, price: schema.orderLines.price })
      .from(schema.orderLines)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
      .where(and(gte(schema.orders.date, from), lte(schema.orders.date, to), ne(schema.orders.status, "Cancelled"), ne(schema.orders.status, "New"))),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.expenses.amount}),0)` }).from(schema.expenses).where(and(gte(schema.expenses.date, from), lte(schema.expenses.date, to))),
    db.select({ c: sql<number>`COUNT(*)`, cost: sql<number>`COALESCE(SUM(${schema.orders.returnCost}),0)` }).from(schema.orders).where(and(gte(schema.orders.date, from), lte(schema.orders.date, to), eq(schema.orders.status, "Returned"))),
  ]);

  const itemCost = new Map(items.map((i) => [i.id, i.purchasePrice]));
  const sales = lines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0);
  const cogs = lines.reduce((s, l) => s + Number(l.qty) * Number(itemCost.get(l.itemId) ?? 0), 0);
  const expenses = Number(expRow[0].t);
  const retCount = Number(retRow[0].c);
  const retCost = Number(retRow[0].cost);
  const net = sales - cogs - expenses - retCost;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{brand.name} — Loss &amp; Profit Report</h2>
        <div className="toolbar noprint" style={{ marginBottom: 0 }}>
          <form className="toolbar" style={{ marginBottom: 0 }}>
            <input type="date" name="from" defaultValue={from} />
            <input type="date" name="to" defaultValue={to} />
            <button className="btn secondary">Run Report</button>
          </form>
          <PrintButton />
        </div>
      </div>

      <p style={{ color: "var(--muted)" }}>Period: <b>{from}</b> to <b>{to}</b></p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="stat c-green"><b>৳ {fmt(sales)}</b><span>Total Sales</span></div>
        <div className="stat c-teal"><b>৳ {fmt(cogs)}</b><span>Cost of Goods (COGS)</span></div>
        <div className="stat c-rose"><b>৳ {fmt(expenses)}</b><span>Expenses</span></div>
        <div className="stat c-amber"><b>{retCount} (৳ {fmt(retCost)})</b><span>Returns Count &amp; Cost</span></div>
        <div className={`stat ${net >= 0 ? "c-green" : "c-rose"}`}>
          <b>{net >= 0 ? "+" : "-"}৳ {fmt(Math.abs(net))}</b>
          <span>Net {net >= 0 ? "Profit" : "Loss"}</span>
        </div>
      </div>
    </>
  );
}
