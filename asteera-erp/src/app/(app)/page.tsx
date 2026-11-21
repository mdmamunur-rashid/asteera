import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { getStockMap } from "@/lib/queries";
import { getDefaultBrand } from "@/lib/settings";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

function bdToday(): string {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const reportDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : bdToday();
  const month = reportDate.slice(0, 7);

  const [brand, items, stock, salesRow, poRow, poPaid, expRow, ledgerRow, statusRows, todayLines, todayExpRow, todayReturns] = await Promise.all([
    getDefaultBrand(),
    db.select().from(schema.items),
    getStockMap(),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.orders.total}),0)`, c: sql<number>`COUNT(*)`, paid: sql<number>`COALESCE(SUM(${schema.orders.paid}),0)` })
      .from(schema.orders).where(sql`${schema.orders.date} LIKE ${month + "%"} AND ${schema.orders.status} NOT IN ('Cancelled','New')`),
    db.select({ cost: sql<number>`COALESCE(SUM(${schema.purchaseLines.qty}*${schema.purchaseLines.unitCost}),0)` }).from(schema.purchaseLines),
    db.select({ p: sql<number>`COALESCE(SUM(${schema.purchaseOrders.paid}),0)` }).from(schema.purchaseOrders),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.expenses.amount}),0)` }).from(schema.expenses).where(sql`${schema.expenses.date} LIKE ${month + "%"}`),
    db.select({ due: sql<number>`COALESCE(SUM(${schema.ledgerEntries.totalDue}-${schema.ledgerEntries.amountPaid}),0)` }).from(schema.ledgerEntries),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` }).from(schema.orders).groupBy(schema.orders.status),
    db.select({
      itemId: schema.orderLines.itemId,
      qty: schema.orderLines.qty,
      price: schema.orderLines.price,
      status: schema.orders.status,
      returnCost: schema.orders.returnCost,
    })
      .from(schema.orderLines)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
      .where(and(eq(schema.orders.date, reportDate), ne(schema.orders.status, "Cancelled"), ne(schema.orders.status, "New"))),
    db.select({ t: sql<number>`COALESCE(SUM(${schema.expenses.amount}),0)` }).from(schema.expenses).where(eq(schema.expenses.date, reportDate)),
    db.select().from(schema.orderReturns).where(sql`DATE(${schema.orderReturns.createdAt}) = ${reportDate}`),
  ]);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const stockValue = items.reduce((s, i) => s + (stock.get(i.id)?.remaining ?? 0) * i.purchasePrice, 0);
  const low = items.filter((i) => (stock.get(i.id)?.remaining ?? 0) <= i.reorderLevel);
  const poOwed = Number(poRow[0].cost) - Number(poPaid[0].p);

  // Aggregate product-wise sales, COGS, and returns for reportDate
  type ProdRow = {
    itemId: number;
    sku: string;
    name: string;
    size: string;
    soldQty: number;
    retCount: number;
    retQty: number;
    salesAmt: number;
    costAmt: number;
  };
  const prodMap = new Map<number, ProdRow>();
  const ensureProd = (itemId: number): ProdRow => {
    let row = prodMap.get(itemId);
    if (!row) {
      const it = itemMap.get(itemId);
      row = {
        itemId,
        sku: it?.sku ?? `#${itemId}`,
        name: it?.name ?? "Unknown Item",
        size: it?.size ?? "",
        soldQty: 0,
        retCount: 0,
        retQty: 0,
        salesAmt: 0,
        costAmt: 0,
      };
      prodMap.set(itemId, row);
    }
    return row;
  };

  for (const l of todayLines) {
    const it = itemMap.get(l.itemId);
    const p = ensureProd(l.itemId);
    p.soldQty += Number(l.qty);
    p.salesAmt += Number(l.qty) * Number(l.price);
    p.costAmt += Number(l.qty) * Number(it?.purchasePrice ?? 0);
  }

  let totalReturnCost = 0;
  let totalReturnCount = todayReturns.length;
  let totalReturnQty = 0;

  for (const ret of todayReturns) {
    totalReturnCost += Number(ret.returnCost);
    try {
      const parsed = JSON.parse(ret.itemsJson) as { itemId?: number; qty?: number }[];
      if (Array.isArray(parsed)) {
        for (const ri of parsed) {
          if (!ri.itemId) continue;
          const p = ensureProd(ri.itemId);
          p.retCount += 1;
          p.retQty += Number(ri.qty ?? 0);
          totalReturnQty += Number(ri.qty ?? 0);
        }
      }
    } catch { /* ignore malformed json */ }
  }

  // Also count orders dated today with status === "Returned" if not already in order_returns
  const returnedOrdersToday = await db
    .select({ id: schema.orders.id, returnCost: schema.orders.returnCost })
    .from(schema.orders)
    .where(and(eq(schema.orders.date, reportDate), eq(schema.orders.status, "Returned")));
  if (totalReturnCount === 0 && returnedOrdersToday.length > 0) {
    totalReturnCount = returnedOrdersToday.length;
    totalReturnCost = returnedOrdersToday.reduce((s, r) => s + Number(r.returnCost), 0);
  }

  const productRows = Array.from(prodMap.values()).sort((a, b) => b.salesAmt - a.salesAmt);
  const totalDaySales = productRows.reduce((s, r) => s + r.salesAmt, 0);
  const totalDayCost = productRows.reduce((s, r) => s + r.costAmt, 0);
  const totalDayExpenses = Number(todayExpRow[0].t);
  const netProfitLoss = totalDaySales - totalDayCost - totalReturnCost - totalDayExpenses;

  return (
    <>
      <h2 className="noprint">Dashboard</h2>
      <div className="grid noprint" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="stat c-green"><b>৳ {fmt(salesRow[0].t)}</b><span>Sales this month ({salesRow[0].c} invoices)</span></div>
        <div className="stat c-blue"><b>৳ {fmt(Number(salesRow[0].t) - Number(salesRow[0].paid))}</b><span>Receivable this month</span></div>
        <div className="stat c-rose"><b>৳ {fmt(expRow[0].t)}</b><span>Expenses this month</span></div>
        <div className="stat c-teal"><b>৳ {fmt(stockValue)}</b><span>Stock value (at cost)</span></div>
        <div className="stat c-amber"><b>৳ {fmt(poOwed)}</b><span>Owed on purchase orders</span></div>
        <div className="stat c-violet"><b>৳ {fmt(ledgerRow[0].due)}</b><span>Owed to production suppliers</span></div>
      </div>

      {/* Daily Product-Wise Profit / Loss Report (Printable) */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, color: "var(--teal)" }}>{brand.name} — Daily Profit &amp; Loss Report</h3>
            <small style={{ color: "var(--muted)" }}>Date: <b>{reportDate}</b> · Product-wise breakdown &amp; returns</small>
          </div>
          <div className="toolbar noprint" style={{ marginBottom: 0 }}>
            <form className="toolbar" style={{ marginBottom: 0 }}>
              <input type="date" name="date" defaultValue={reportDate} />
              <button className="btn secondary">Load Date</button>
            </form>
            <PrintButton />
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: 14 }}>
          <div className="stat c-green"><b>৳ {fmt(totalDaySales)}</b><span>Sales ({reportDate})</span></div>
          <div className="stat c-teal"><b>৳ {fmt(totalDayCost)}</b><span>Product Cost (COGS)</span></div>
          <div className="stat c-rose"><b>{totalReturnCount} ({fmt(totalReturnQty)} qty)</b><span>Returns Count · Cost ৳ {fmt(totalReturnCost)}</span></div>
          <div className="stat c-amber"><b>৳ {fmt(totalDayExpenses)}</b><span>Expenses ({reportDate})</span></div>
          <div className={`stat ${netProfitLoss >= 0 ? "c-green" : "c-rose"}`}>
            <b>{netProfitLoss >= 0 ? "+" : "-"}৳ {fmt(Math.abs(netProfitLoss))}</b>
            <span>Net {netProfitLoss >= 0 ? "Profit" : "Loss"}</span>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Sold Qty</th>
              <th>Returns (Count / Qty)</th>
              <th>Sales (৳)</th>
              <th>Cost (৳)</th>
              <th>Profit / Loss (৳)</th>
            </tr>
          </thead>
          <tbody>
            {productRows.map((r) => {
              const pl = r.salesAmt - r.costAmt;
              return (
                <tr key={r.itemId}>
                  <td>{r.sku}</td>
                  <td><b>{r.name}</b>{r.size ? ` (${r.size})` : ""}</td>
                  <td>{fmt(r.soldQty)}</td>
                  <td>{r.retCount > 0 ? <span className="badge bad">{r.retCount} ({fmt(r.retQty)} qty)</span> : "0"}</td>
                  <td>৳ {fmt(r.salesAmt)}</td>
                  <td>৳ {fmt(r.costAmt)}</td>
                  <td>
                    <span className={`badge ${pl >= 0 ? "ok" : "bad"}`}>
                      {pl >= 0 ? "+" : "-"}৳ {fmt(Math.abs(pl))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} align="right"><b>Totals</b></td>
              <td><b>{totalReturnCount} ({fmt(totalReturnQty)} qty)</b></td>
              <td><b>৳ {fmt(totalDaySales)}</b></td>
              <td><b>৳ {fmt(totalDayCost)}</b></td>
              <td>
                <b>Gross: {totalDaySales - totalDayCost >= 0 ? "+" : "-"}৳ {fmt(Math.abs(totalDaySales - totalDayCost))}</b>
              </td>
            </tr>
            <tr>
              <td colSpan={6} align="right">Less: Return Cost (৳ {fmt(totalReturnCost)}) + Daily Expenses (৳ {fmt(totalDayExpenses)})</td>
              <td>
                <span className={`badge ${netProfitLoss >= 0 ? "ok" : "bad"}`}>
                  Net {netProfitLoss >= 0 ? "Profit" : "Loss"}: {netProfitLoss >= 0 ? "+" : "-"}৳ {fmt(Math.abs(netProfitLoss))}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
        {productRows.length === 0 && <p style={{ color: "var(--muted)" }}>No product sales or returns recorded on {reportDate}.</p>}
      </div>

      <div className="card noprint">
        <h3>Orders by status</h3>
        {statusRows.length === 0 ? <p>No orders yet.</p> : statusRows.map((r) => <span key={r.s} className="badge" style={{ marginRight: 8 }}>{r.s}: {r.c}</span>)}
      </div>
      <div className="card noprint">
        <h3>Reorder needed ({low.length})</h3>
        <table><thead><tr><th>SKU</th><th>Name</th><th>Size</th><th>Remaining</th><th>Level</th></tr></thead>
          <tbody>{low.slice(0, 20).map((i) => (
            <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.size}</td><td>{fmt(stock.get(i.id)?.remaining ?? 0)}</td><td>{i.reorderLevel}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
