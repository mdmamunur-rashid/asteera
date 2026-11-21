import { desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { getBrandByName, getBrandings, getSettingsMap } from "@/lib/settings";
import { fmt } from "@/lib/util";
import { markAllUnprinted } from "../actions";

export const dynamic = "force-dynamic";

export default async function BulkPrintSales({
  searchParams,
}: {
  searchParams: Promise<{ forceBrand?: string; ids?: string; ok?: string }>;
}) {
  const [{ forceBrand, ids: idsParam, ok }, brands, cfg] = await Promise.all([
    searchParams,
    getBrandings(),
    getSettingsMap(),
  ]);

  const selectedIds = (idsParam ?? "").split(",").map(Number).filter((n) => n > 0);
  const orders = selectedIds.length > 0
    ? await db.select().from(schema.orders).where(inArray(schema.orders.id, selectedIds)).orderBy(desc(schema.orders.id))
    : await db.select().from(schema.orders).where(isNull(schema.orders.printedAt)).orderBy(desc(schema.orders.id)).limit(50);

  const activeBrand = await getBrandByName(forceBrand);
  const sigUrl = cfg.authorized_signature_url || "";
  const ids = orders.map((o) => o.id);
  const allLines = ids.length > 0
    ? await db.select({ orderId: schema.orderLines.orderId, sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.orderLines.qty, price: schema.orderLines.price })
        .from(schema.orderLines).innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId)).where(inArray(schema.orderLines.orderId, ids))
    : [];

  return (
    <>
      <PrintButton floating />
      <div className="noprint toolbar">
        <PrintButton />
        <form action={markAllUnprinted}><button className="btn">Mark all unprinted as printed</button></form>
        <form className="toolbar" style={{ marginBottom: 0 }}>
          {idsParam && <input type="hidden" name="ids" value={idsParam} />}
          <select name="forceBrand" defaultValue={forceBrand ?? activeBrand.name}>
            {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <button className="btn secondary">Apply Logo</button>
        </form>
      </div>
      {ok && <div className="card noprint" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      {orders.length === 0 ? <div className="card"><p>No invoices to print.</p></div> : orders.map((o) => {
        const lines = allLines.filter((l) => l.orderId === o.id);
        return (
          <div key={o.id} className="invoice" style={{ marginBottom: 24, pageBreakAfter: "always" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid var(--primary)", paddingBottom: 12, marginBottom: 14 }}>
              <div>
                {activeBrand.logoUrl && <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ maxHeight: 76, maxWidth: 220, objectFit: "contain" }} />}
                <h3 style={{ margin: "4px 0 0" }}>{activeBrand.name}</h3>
                {activeBrand.phone && <small>Phone: {activeBrand.phone}</small>}
              </div>
              <div style={{ textAlign: "right" }}>
                <h3 style={{ margin: 0 }}>Invoice #{o.invoiceNo}</h3>
                <small>Date: {o.date}</small>
              </div>
            </div>
            <p style={{ fontSize: 13 }}><b>Invoice To:</b> {o.customerName} ({o.phone})<br />{o.address}</p>
            <table className="invoice-table">
              <thead><tr><th>Sl.</th><th>Item</th><th>Qty</th><th>Price (৳)</th><th>Total (৳)</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{l.name} {l.size} <small>({l.sku})</small></td>
                    <td>{fmt(l.qty)}</td>
                    <td>৳ {fmt(l.price)}</td>
                    <td>৳ {fmt(l.qty * l.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>৳ {fmt(o.total)}</b></td></tr>
                <tr><td colSpan={4} align="right"><b>Amount Due ({o.paymentMode})</b></td><td><b>৳ {fmt(Math.max(0, o.total - o.paid))}</b></td></tr>
              </tfoot>
            </table>
            <div className="sig-row">
              <div className="sig-box">
                <div className="sig-space">
                  {sigUrl && <img src={sigUrl} alt="Authorized Signature" style={{ maxHeight: 48, maxWidth: 180, objectFit: "contain" }} />}
                </div>
                <div className="sig-line">AUTHORIZED SIGNATURE</div>
              </div>
              <div className="sig-box">
                <div className="sig-space" />
                <div className="sig-line">CUSTOMER SIGNATURE</div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
