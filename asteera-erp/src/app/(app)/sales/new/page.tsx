import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import LineEditor from "@/components/LineEditor";
import { ORDER_STATUSES, today } from "@/lib/util";
import { createOrder } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const items = await db.select().from(schema.items).orderBy(asc(schema.items.sku));
  return (
    <>
      <h2>New order / invoice</h2>
      {error && <div className="err">{error}</div>}
      <form action={createOrder}>
        <div className="card form">
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>Customer name<input name="customerName" required /></label>
          <label>Phone<input name="phone" /></label>
          <label>Address<input name="address" /></label>
          <label>Page / source<input name="pageName" /></label>
          <label>Status<select name="status" defaultValue="Billed">{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Payment<select name="paymentMode"><option>COD</option><option>Paid</option></select></label>
          <label>Delivery charge<input type="number" step="any" name="deliveryCharge" defaultValue={0} /></label>
          <label>Discount<input type="number" step="any" name="discount" defaultValue={0} /></label>
          <label>Paid now<input type="number" step="any" name="paid" defaultValue={0} /></label>
          <label>Note<input name="note" /></label>
        </div>
        <LineEditor priceLabel="Price (MRP)" options={items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name} ${i.size}`, price: i.salePrice }))} />
        <button className="btn">Create invoice</button>
      </form>
    </>
  );
}
