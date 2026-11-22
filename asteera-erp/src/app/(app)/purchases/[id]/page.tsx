import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import LineEditor from "@/components/LineEditor";
import PrintButton from "@/components/PrintButton";
import { fmt } from "@/lib/util";
import { deletePurchase, payPurchase, updatePurchase } from "../actions";

export const dynamic = "force-dynamic";

export default async function PurchaseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const [{ id: rawId }, { error, ok }] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id)).limit(1);
  if (!po) notFound();
  const [[sup], lines, allItems, allSups] = await Promise.all([
    db.select().from(schema.suppliers).where(eq(schema.suppliers.id, po.supplierId)).limit(1),
    db.select({ itemId: schema.purchaseLines.itemId, sku: schema.items.sku, name: schema.items.name, size: schema.items.size, qty: schema.purchaseLines.qty, unitCost: schema.purchaseLines.unitCost })
      .from(schema.purchaseLines).innerJoin(schema.items, eq(schema.items.id, schema.purchaseLines.itemId)).where(eq(schema.purchaseLines.poId, id)),
    db.select().from(schema.items).orderBy(asc(schema.items.sku)),
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  return (
    <div className="invoice">
      {error && <div className="err noprint">{error}</div>}
      {ok && <div className="card noprint" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
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
        <form action={payPurchase} className="toolbar" style={{ marginBottom: 0 }}>
          <input type="hidden" name="id" value={id} />
          <input name="amount" type="number" step="any" placeholder="Payment amount" />
          <button className="btn">Record payment</button>
        </form>
        <form action={deletePurchase}><input type="hidden" name="id" value={id} /><button className="btn danger">Delete</button></form>
      </div>

      <details className="noprint card" style={{ marginTop: 16 }}>
        <summary><b>Edit Purchase Order &amp; Line Items</b></summary>
        <form action={updatePurchase} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <div className="form" style={{ marginBottom: 12 }}>
            <label>Date<input type="date" name="date" defaultValue={po.date} /></label>
            <label>Supplier<select name="supplierId" defaultValue={po.supplierId}>{allSups.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></label>
            <label>Paid<input type="number" step="any" name="paid" defaultValue={po.paid} /></label>
            <label>Note<input name="note" defaultValue={po.note} /></label>
          </div>
          <LineEditor
            priceLabel="Unit cost"
            options={allItems.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name} ${i.size}`, price: i.purchasePrice }))}
            initialRows={lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.unitCost }))}
          />
          <button className="btn">Save Purchase Order Changes</button>
        </form>
      </details>
    </div>
  );
}
