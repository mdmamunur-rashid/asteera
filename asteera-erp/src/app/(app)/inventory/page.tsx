import { like, or, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import ProductImageInput from "@/components/ProductImageInput";
import { getStockMap } from "@/lib/queries";
import { normalizeLogoUrl } from "@/lib/settings";
import { fmt } from "@/lib/util";
import { createItem, deleteItem, updateItemImage } from "./actions";

export const dynamic = "force-dynamic";

export default async function Inventory({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { q, error } = await searchParams;
  const term = q ? `%${q}%` : null;
  const [items, stock] = await Promise.all([
    db.select().from(schema.items)
      .where(term ? or(like(schema.items.sku, term), like(schema.items.name, term), like(schema.items.type, term)) : undefined)
      .orderBy(asc(schema.items.sku)).limit(500),
    getStockMap(),
  ]);

  return (
    <>
      <h2>Inventory</h2>
      {error && <div className="err">{error}</div>}
      <details className="card">
        <summary><b>+ Add item</b></summary>
        <form action={createItem} className="form" style={{ marginTop: 12 }}>
          <label>SKU<input name="sku" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Size<input name="size" /></label>
          <label>Type<input name="type" /></label>
          <label>Category<input name="category" /></label>
          <label>Purchase price<input name="purchasePrice" type="number" step="any" /></label>
          <label>Sale price (MRP)<input name="salePrice" type="number" step="any" /></label>
          <label>Reorder level<input name="reorderLevel" type="number" defaultValue={5} /></label>
          <div style={{ gridColumn: "1 / -1" }}>
            <small style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>Product Image (Upload or URL)</small>
            <ProductImageInput />
          </div>
          <button className="btn">Save</button>
        </form>
      </details>
      <form className="toolbar"><input name="q" placeholder="Search SKU / name / type" defaultValue={q} /><button className="btn secondary">Search</button></form>
      <div className="card">
        <table>
          <thead><tr><th>Image</th><th>SKU</th><th>Name</th><th>Size</th><th>P.Price</th><th>S.Price</th><th>Purchased</th><th>Sold</th><th>Remaining</th><th>Reorder?</th><th /></tr></thead>
          <tbody>
            {items.map((i) => {
              const s = stock.get(i.id) ?? { purchased: 0, sold: 0, remaining: 0 };
              const reorder = s.remaining <= i.reorderLevel;
              const imgUrl = normalizeLogoUrl(i.imageUrl);
              return (
                <tr key={i.id}>
                  <td>
                    <form action={updateItemImage} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="hidden" name="id" value={i.id} />
                      <ProductImageInput initialUrl={imgUrl} compact />
                      <button className="btn secondary" style={{ padding: "4px 8px", fontSize: 11.5 }}>Save</button>
                    </form>
                  </td>
                  <td>{i.sku}</td><td>{i.name}</td><td>{i.size}</td><td>{fmt(i.purchasePrice)}</td><td>{fmt(i.salePrice)}</td>
                  <td>{fmt(s.purchased)}</td><td>{fmt(s.sold)}</td><td><b>{fmt(s.remaining)}</b></td>
                  <td><span className={`badge ${reorder ? "bad" : "ok"}`}>{reorder ? "Yes" : "No"}</span></td>
                  <td><form action={deleteItem}><input type="hidden" name="id" value={i.id} /><button className="link">Delete</button></form></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <p>No items.</p>}
      </div>
    </>
  );
}
