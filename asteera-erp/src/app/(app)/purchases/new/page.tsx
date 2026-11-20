import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import LineEditor from "@/components/LineEditor";
import { today } from "@/lib/util";
import { createPurchase } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPurchase({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [items, sups] = await Promise.all([
    db.select().from(schema.items).orderBy(asc(schema.items.sku)),
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  return (
    <>
      <h2>New purchase order</h2>
      {error && <div className="err">{error}</div>}
      <form action={createPurchase}>
        <div className="card form">
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>Supplier<select name="supplierId" required>{sups.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></label>
          <label>Paid now<input type="number" name="paid" step="any" defaultValue={0} /></label>
          <label>Note<input name="note" /></label>
        </div>
        <LineEditor priceLabel="Unit cost" options={items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name} ${i.size}`, price: i.purchasePrice }))} />
        <button className="btn">Save purchase order</button>
      </form>
    </>
  );
}
