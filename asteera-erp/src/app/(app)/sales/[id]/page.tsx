import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { fmt, ORDER_STATUSES } from "@/lib/util";
import { markPrinted, payOrder, setOrderStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  if (!o) notFound();
  const lines = await db
    .select({ sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.orderLines.qty, price: schema.orderLines.price })
    .from(schema.orderLines).innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId)).where(eq(schema.orderLines.orderId, id));
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <div className="invoice">
      <h2>{process.env.BRAND_NAME ?? "Asteera"} — Invoice {o.invoiceNo}</h2>
      <p>
        Date: {o.date} · Status: <span className="badge">{o.status}</span> {o.printedAt && <span className="badge ok">Printed</span>}<br />
        <b>{o.customerName}</b> · {o.phone}<br />{o.address}
        {o.courier && <><br />Courier: {o.courier} {o.trackingNo}</>}
      </p>
      <table><thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{l.sku}</td><td>{l.name} {l.size}</td><td>{fmt(l.qty)}</td><td>{fmt(l.price)}</td><td>{fmt(l.qty * l.price)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={4} align="right">Subtotal</td><td>{fmt(subtotal)}</td></tr>
          <tr><td colSpan={4} align="right">Delivery</td><td>{fmt(o.deliveryCharge)}</td></tr>
          <tr><td colSpan={4} align="right">Discount</td><td>-{fmt(o.discount)}</td></tr>
          <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>{fmt(o.total)}</b></td></tr>
          <tr><td colSpan={4} align="right">Paid</td><td>{fmt(o.paid)}</td></tr>
          <tr><td colSpan={4} align="right"><b>Due ({o.paymentMode})</b></td><td><b>{fmt(o.total - o.paid)}</b></td></tr>
        </tfoot></table>
      {o.note && <p>Note: {o.note}</p>}
      <div className="noprint card" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <PrintButton />
          <form action={markPrinted}><input type="hidden" name="id" value={id} /><button className="btn secondary">Mark printed</button></form>
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
    </div>
  );
}
