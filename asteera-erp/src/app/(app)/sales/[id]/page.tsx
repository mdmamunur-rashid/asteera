import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, like, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import LineEditor from "@/components/LineEditor";
import PrintButton from "@/components/PrintButton";
import { getBrandByName, getBrandings, getSettingsMap, normalizeLogoUrl } from "@/lib/settings";
import { fmt, last10, ORDER_STATUSES } from "@/lib/util";
import { markPrinted, payOrder, processReturn, sendToPathao, sendToSteadfast, setOrderStatus, updateOrder } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ forceBrand?: string; ok?: string; error?: string; warn?: string }>;
}) {
  const [{ id: rawId }, { forceBrand, ok, error, warn }] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  if (!o) notFound();

  const p10 = last10(o.phone);
  const [lines, allItems, brands, activeBrand, cfg, returns, candidateOrders] = await Promise.all([
    db.select({ id: schema.orderLines.id, itemId: schema.orderLines.itemId, sku: schema.items.sku, name: schema.items.name, size: schema.items.size, imageUrl: schema.items.imageUrl, qty: schema.orderLines.qty, price: schema.orderLines.price })
      .from(schema.orderLines).innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId)).where(eq(schema.orderLines.orderId, id)),
    db.select().from(schema.items).orderBy(asc(schema.items.sku)),
    getBrandings(),
    getBrandByName(forceBrand || o.pageName),
    getSettingsMap(),
    db.select().from(schema.orderReturns).where(eq(schema.orderReturns.orderId, id)).orderBy(desc(schema.orderReturns.id)),
    p10.length >= 6
      ? db.select().from(schema.orders).where(and(ne(schema.orders.id, id), like(schema.orders.phone, `%${p10.slice(-6)}`))).orderBy(desc(schema.orders.id)).limit(50)
      : db.select().from(schema.orders).where(and(ne(schema.orders.id, id), eq(schema.orders.customerName, o.customerName))).orderBy(desc(schema.orders.id)).limit(20),
  ]);

  const prevOrders = p10.length === 10
    ? candidateOrders.filter((c) => last10(c.phone) === p10).slice(0, 15)
    : candidateOrders;
  const sameDayDups = p10.length === 10 && o.status !== "Cancelled" && o.dupAccepted === 0
    ? prevOrders.filter((p) => p.date === o.date && p.status !== "Cancelled" && p.dupAccepted === 0)
    : [];

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const sigUrl = cfg.authorized_signature_url || "";
  const due = Math.max(0, o.total - o.paid);

  return (
    <>
      <PrintButton floating />
      {error && <div className="err noprint">{error}</div>}
      {warn && <div className="err noprint">{warn}</div>}
      {sameDayDups.length > 0 && (
        <div className="err noprint">
          <b>Same-day duplicate phone warning ({p10}):</b>{" "}
          {sameDayDups.map((d) => (
            <Link key={d.id} href={`/sales/${d.id}`} style={{ marginRight: 8, textDecoration: "underline", color: "#991b1b" }}>
              {d.invoiceNo} ({d.status})
            </Link>
          ))}
        </div>
      )}
      {ok && <div className="card noprint" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <div className="invoice">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, borderBottom: "2px solid var(--primary)", paddingBottom: 16, marginBottom: 18 }}>
          <div>
            {activeBrand.logoUrl && (
              <div style={{ width: 220, height: 92, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 6 }}>
                <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.3)" }} />
              </div>
            )}
            <h2 style={{ margin: "0 0 4px" }}>{activeBrand.name}</h2>
            {activeBrand.phone && <div style={{ fontSize: 13 }}>Phone: {activeBrand.phone}</div>}
            {activeBrand.address && <div style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "pre-line", maxWidth: 360 }}>{activeBrand.address}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Invoice #{o.invoiceNo}</h2>
            <div style={{ fontSize: 13.5 }}>Invoice Date: <b>{o.date}</b></div>
            <div style={{ marginTop: 6 }}>
              <span className="badge info">{o.status}</span> {o.printedAt && <span className="badge ok">Printed</span>}
            </div>
            <form className="noprint toolbar" style={{ marginTop: 10, justifyContent: "flex-end", marginBottom: 0 }}>
              <select name="forceBrand" defaultValue={forceBrand ?? activeBrand.name}>
                {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <button className="btn secondary">Switch Logo</button>
            </form>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 18, fontSize: 13.5 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", marginBottom: 4 }}>Invoice To:</div>
            <b>{o.customerName}</b><br />
            {o.phone && <>Mobile: {o.phone}<br /></>}
            {o.address && <>{o.address}</>}
          </div>
          {o.courier && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", marginBottom: 4 }}>Courier:</div>
              <b>{o.courier}</b><br />
              Tracking: {o.trackingNo || "—"}
            </div>
          )}
        </div>

        <table className="invoice-table">
          <thead>
            <tr><th style={{ width: "8%" }}>Sl.</th><th>Item</th><th>Qty</th><th>Price (৳)</th><th>Total (৳)</th></tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const imgUrl = normalizeLogoUrl(l.imageUrl);
              return (
              <tr key={l.id}>
                <td>{idx + 1}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {imgUrl && <img src={imgUrl} alt={l.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", flexShrink: 0 }} />}
                    <div><b>{l.name}</b>{l.size ? ` (${l.size})` : ""}<br /><small style={{ color: "var(--muted)" }}>SKU: {l.sku}</small></div>
                  </div>
                </td>
                <td>{fmt(l.qty)}</td>
                <td>৳ {fmt(l.price)}</td>
                <td>৳ {fmt(l.qty * l.price)}</td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} align="right">Subtotal</td><td>৳ {fmt(subtotal)}</td></tr>
            <tr><td colSpan={4} align="right">Delivery Charge</td><td>৳ {fmt(o.deliveryCharge)}</td></tr>
            {o.discount > 0 && <tr><td colSpan={4} align="right">Discount</td><td>-৳ {fmt(o.discount)}</td></tr>}
            {o.returnCost > 0 && <tr><td colSpan={4} align="right">Return Cost</td><td>৳ {fmt(o.returnCost)}</td></tr>}
            <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>৳ {fmt(o.total)}</b></td></tr>
            <tr><td colSpan={4} align="right">Paid</td><td>৳ {fmt(o.paid)}</td></tr>
            <tr><td colSpan={4} align="right"><b>Amount Due ({o.paymentMode})</b></td><td><b>৳ {fmt(due)}</b></td></tr>
          </tfoot>
        </table>

        {o.note && <p style={{ marginTop: 12, fontSize: 13 }}><b>Note:</b> {o.note}</p>}

        <div className="sig-row">
          <div className="sig-box">
            <div className="sig-space">
              {sigUrl && <img src={sigUrl} alt="Authorized Signature" style={{ maxHeight: 54, maxWidth: 200, objectFit: "contain" }} />}
            </div>
            <div className="sig-line">AUTHORIZED SIGNATURE</div>
          </div>
          <div className="sig-box">
            <div className="sig-space" />
            <div className="sig-line">CUSTOMER SIGNATURE</div>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)", marginTop: 22 }}>
          Just wanted to say thank you for your purchase. We&apos;re so lucky to have customers like you!
        </p>
      </div>

      <div className="noprint card" style={{ maxWidth: 860, margin: "16px auto" }}>
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

      <details className="noprint card" style={{ maxWidth: 860, margin: "16px auto" }}>
        <summary><b>Edit Order Details &amp; Line Items</b></summary>
        <form action={updateOrder} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <div className="form" style={{ marginBottom: 12 }}>
            <label>Date<input type="date" name="date" defaultValue={o.date} /></label>
            <label>Customer Name<input name="customerName" defaultValue={o.customerName} required /></label>
            <label>Phone<input name="phone" defaultValue={o.phone} /></label>
            <label>Address<input name="address" defaultValue={o.address} /></label>
            <label>Page / Brand<input name="pageName" defaultValue={o.pageName} /></label>
            <label>Status<select name="status" defaultValue={o.status}>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label>Payment<select name="paymentMode" defaultValue={o.paymentMode}><option>COD</option><option>Paid</option></select></label>
            <label>Delivery Charge<input type="number" step="any" name="deliveryCharge" defaultValue={o.deliveryCharge} /></label>
            <label>Discount<input type="number" step="any" name="discount" defaultValue={o.discount} /></label>
            <label>Return Cost<input type="number" step="any" name="returnCost" defaultValue={o.returnCost} /></label>
            <label>Paid<input type="number" step="any" name="paid" defaultValue={o.paid} /></label>
            <label>Note<input name="note" defaultValue={o.note} /></label>
          </div>
          <LineEditor
            priceLabel="Price (MRP)"
            options={allItems.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name} ${i.size}`, price: i.salePrice }))}
            initialRows={lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price }))}
          />
          <button className="btn">Save Order Changes</button>
        </form>
      </details>

      <details className="noprint card" style={{ maxWidth: 860, margin: "16px auto" }}>
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
            <ul>{returns.map((r) => <li key={r.id}>{r.returnType} return (cost ৳ {fmt(r.returnCost)}) — {r.note || "No note"}</li>)}</ul>
          </div>
        )}
      </details>

      {prevOrders.length > 0 && (
        <div className="noprint card" style={{ maxWidth: 860, margin: "16px auto" }}>
          <h3 style={{ marginTop: 0 }}>Previous orders ({prevOrders.length})</h3>
          <table>
            <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Order Value</th><th>Status</th></tr></thead>
            <tbody>
              {prevOrders.map((p) => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td><Link href={`/sales/${p.id}`}>{p.invoiceNo}</Link></td>
                  <td>{p.customerName} ({p.phone})</td>
                  <td>৳ {fmt(p.total)} <small>(Due: ৳ {fmt(Math.max(0, p.total - p.paid))})</small></td>
                  <td><span className="badge">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
