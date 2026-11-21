import { desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { getBrandByName, getBrandings } from "@/lib/settings";
import { fmt } from "@/lib/util";
import { markAllUnprinted } from "../actions";

export const dynamic = "force-dynamic";

export default async function BulkPrintSales({ searchParams }: { searchParams: Promise<{ forceBrand?: string; ok?: string }> }) {
  const [{ forceBrand, ok }, brands, orders] = await Promise.all([
    searchParams,
    getBrandings(),
    db.select().from(schema.orders).where(isNull(schema.orders.printedAt)).orderBy(desc(schema.orders.id)).limit(50),
  ]);

  const activeBrand = await getBrandByName(forceBrand);
  const ids = orders.map((o) => o.id);
  const allLines = ids.length > 0
    ? await db.select({ orderId: schema.orderLines.orderId, sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.orderLines.qty, price: schema.orderLines.price })
        .from(schema.orderLines).innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId)).where(inArray(schema.orderLines.orderId, ids))
    : [];

  return (
    <>
      <div className="noprint toolbar">
        <PrintButton />
        <form action={markAllUnprinted}><button className="btn">Mark all as printed</button></form>
        <form className="toolbar" style={{ marginBottom: 0 }}>
          <select name="forceBrand" defaultValue={forceBrand ?? activeBrand.name}>
            {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <button className="btn secondary">Apply Logo</button>
        </form>
      </div>
      {ok && <div className="card noprint" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      {orders.length === 0 ? <div className="card"><p>No unprinted invoices.</p></div> : orders.map((o) => {
        const lines = allLines.filter((l) => l.orderId === o.id);
        return (
          <div key={o.id} className="invoice" style={{ marginBottom: 24, pageBreakAfter: "always", borderBottom: "1px dashed #ccc" }}>
            {activeBrand.logoUrl && <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ maxHeight: 76, maxWidth: 220, objectFit: "contain" }} />}
            <h3 style={{ margin: "4px 0" }}>{activeBrand.name} — Invoice {o.invoiceNo}</h3>
            <p>Date: {o.date} · <b>{o.customerName}</b> ({o.phone})<br />{o.address}</p>
            <table><thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={i}><td>{l.sku}</td><td>{l.name} {l.size}</td><td>{fmt(l.qty)}</td><td>{fmt(l.price)}</td><td>{fmt(l.qty * l.price)}</td></tr>)}</tbody>
              <tfoot>
                <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>{fmt(o.total)}</b></td></tr>
                <tr><td colSpan={4} align="right"><b>Due ({o.paymentMode})</b></td><td><b>{fmt(o.total - o.paid)}</b></td></tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </>
  );
}
