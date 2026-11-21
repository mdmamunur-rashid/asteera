import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { getBrandByName, getBrandings } from "@/lib/settings";
import { fmt, ORDER_STATUSES } from "@/lib/util";
import { markPrinted, payOrder, processReturn, sendToPathao, sendToSteadfast, setOrderStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ forceBrand?: string; ok?: string; error?: string }>;
}) {
  const [{ id: rawId }, { forceBrand, ok, error }] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  if (!o) notFound();

  const [lines, brands, activeBrand, returns] = await Promise.all([
    db.select({ id: schema.orderLines.id, sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.orderLines.qty, price: schema.orderLines.price })
      .from(schema.orderLines).innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId)).where(eq(schema.orderLines.orderId, id)),
    getBrandings(),
    getBrandByName(forceBrand || o.pageName),
    db.select().from(schema.orderReturns).where(eq(schema.orderReturns.orderId, id)).orderBy(desc(schema.orderReturns.id)),
  ]);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <div className="invoice">
      {error && <div className="err noprint">{error}</div>}
      {ok && <div className="card noprint" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          {activeBrand.logoUrl && (
            <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain", marginBottom: 6 }} />
          )}
          <h2 style={{ margin: 0 }}>{activeBrand.name} — Invoice {o.invoiceNo}</h2>
          {activeBrand.address && <small style={{ whiteSpace: "pre-line", color: "var(--muted)" }}>{activeBrand.address}</small>}
        </div>
        <form className="noprint toolbar" style={{ marginBottom: 0 }}>
          <select name="forceBrand" defaultValue={forceBrand ?? activeBrand.name}>
            {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <button className="btn secondary">Switch Logo</button>
        </form>
      </div>

      <p>
        Date: {o.date} · Status: <span className="badge">{o.status}</span> {o.printedAt && <span className="badge ok">Printed</span>}<br />
        <b>{o.customerName}</b> · {o.phone}<br />{o.address}
        {o.courier && <><br />Courier: <b>{o.courier}</b> ({o.trackingNo})</>}
      </p>

      <table><thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((l) => <tr key={l.id}><td>{l.sku}</td><td>{l.name} {l.size}</td><td>{fmt(l.qty)}</td><td>{fmt(l.price)}</td><td>{fmt(l.qty * l.price)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={4} align="right">Subtotal</td><td>{fmt(subtotal)}</td></tr>
          <tr><td colSpan={4} align="right">Delivery</td><td>{fmt(o.deliveryCharge)}</td></tr>
          <tr><td colSpan={4} align="right">Discount</td><td>-{fmt(o.discount)}</td></tr>
          {o.returnCost > 0 && <tr><td colSpan={4} align="right">Return Cost</td><td>{fmt(o.returnCost)}</td></tr>}
          <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>{fmt(o.total)}</b></td></tr>
          <tr><td colSpan={4} align="right">Paid</td><td>{fmt(o.paid)}</td></tr>
          <tr><td colSpan={4} align="right"><b>Due ({o.paymentMode})</b></td><td><b>{fmt(o.total - o.paid)}</b></td></tr>
        </tfoot></table>
      {o.note && <p>Note: {o.note}</p>}

      <div className="noprint card" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <PrintButton />
          <form action={markPrinted}><input type="hidden" name="id" value={id} /><button className="btn secondary">Mark printed</button></form>
          <form action={sendToSteadfast}><input type="hidden" name="id" value={id} /><button className="btn">Send to Steadfast</button></form>
          <form action={sendToPathao}><input type="hidden" name="id" value={id} /><button className="btn">Send to Pathao</button></form>
        </div>
        <form action={setOrderStatus} className="form">
          <input type="hidden" name="id" value={id} />
          <label>Status<select name="status" defaultValue={o.status}>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Courier<input name="courier" defaultValue={o.courier} /></label>
          <label>Tracking no<input name="trackingNo" defaultValue={o.trackingNo} /></label>
          <button className="btn">Update</button>
        </form>
        <form action={payOrder} className="form" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <label>Record payment<input name="amount" type="number" step="any" /></label>
          <button className="btn">Add payment</button>
        </form>
      </div>

      <details className="noprint card">
        <summary><b>Process Return (Full or Partial)</b></summary>
        <form action={processReturn} className="form" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <label>Return Type
            <select name="returnType"><option value="Partial">Partial</option><option value="Full">Full</option></select>
          </label>
          <label>Item (for Partial)
            <select name="lineId">
              {lines.map((l) => <option key={l.id} value={l.id}>{l.sku} — {l.name} (qty {l.qty})</option>)}
            </select>
          </label>
          <label>Return Qty<input type="number" name="returnQty" step="any" defaultValue={1} /></label>
          <label>Return Cost<input type="number" name="returnCost" step="any" defaultValue={0} /></label>
          <label>Note<input name="note" /></label>
          <button className="btn danger">Process Return</button>
        </form>
        {returns.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <small>Return History:</small>
            <ul>{returns.map((r) => <li key={r.id}>{r.returnType} return (cost {fmt(r.returnCost)}) — {r.note || "No note"}</li>)}</ul>
          </div>
        )}
      </details>
    </div>
  );
}
