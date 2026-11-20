import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import PrintButton from "@/components/PrintButton";
import { fmt } from "@/lib/util";
import { deletePurchase, payPurchase } from "../actions";

export const dynamic = "force-dynamic";

export default async function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id)).limit(1);
  if (!po) notFound();
  const [[sup], lines] = await Promise.all([
    db.select().from(schema.suppliers).where(eq(schema.suppliers.id, po.supplierId)).limit(1),
    db.select({ sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.purchaseLines.qty, unitCost: schema.purchaseLines.unitCost })
      .from(schema.purchaseLines).innerJoin(schema.items, eq(schema.items.id, schema.purchaseLines.itemId)).where(eq(schema.purchaseLines.poId, id)),
  ]);
  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  return (
    <div className="invoice">
      <h2>Purchase order {po.poNo}</h2>
      <p>Date: {po.date}<br />Supplier: <b>{sup?.name}</b> {sup?.phone}</p>
      <table><thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Unit cost</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{l.sku}</td><td>{l.name} {l.size}</td><td>{fmt(l.qty)}</td><td>{fmt(l.unitCost)}</td><td>{fmt(l.qty * l.unitCost)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={4} align="right"><b>Total</b></td><td><b>{fmt(total)}</b></td></tr>
          <tr><td colSpan={4} align="right">Paid</td><td>{fmt(po.paid)}</td></tr>
          <tr><td colSpan={4} align="right">Balance</td><td>{fmt(total - po.paid)}</td></tr>
        </tfoot></table>
      <div className="noprint toolbar" style={{ marginTop: 16 }}>
        <PrintButton />
        <form action={payPurchase} className="toolbar">
          <input type="hidden" name="id" value={id} />
          <input name="amount" type="number" step="any" placeholder="Payment amount" />
          <button className="btn">Record payment</button>
        </form>
        <form action={deletePurchase}><input type="hidden" name="id" value={id} /><button className="btn danger">Delete</button></form>
      </div>
    </div>
  );
}
