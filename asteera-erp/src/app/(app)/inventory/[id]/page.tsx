import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import ProductImageInput from "@/components/ProductImageInput";
import { normalizeLogoUrl } from "@/lib/settings";
import { updateItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const [{ id: rawId }, { error, ok }] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  const [item] = await db.select().from(schema.items).where(eq(schema.items.id, id)).limit(1);
  if (!item) notFound();

  return (
    <>
      <div className="toolbar">
        <Link href="/inventory" className="btn secondary">← Back to Inventory</Link>
      </div>
      <h2>Edit Item — {item.sku}</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <div className="card">
        <form action={updateItem} className="form">
          <input type="hidden" name="id" value={item.id} />
          <label>SKU<input name="sku" defaultValue={item.sku} required /></label>
          <label>Name<input name="name" defaultValue={item.name} required /></label>
          <label>Size<input name="size" defaultValue={item.size} /></label>
          <label>Type<input name="type" defaultValue={item.type} /></label>
          <label>Category<input name="category" defaultValue={item.category} /></label>
          <label>Purchase Price<input name="purchasePrice" type="number" step="any" defaultValue={item.purchasePrice} /></label>
          <label>Sale Price (MRP)<input name="salePrice" type="number" step="any" defaultValue={item.salePrice} /></label>
          <label>Reorder Level<input name="reorderLevel" type="number" defaultValue={item.reorderLevel} /></label>
          <div style={{ gridColumn: "1 / -1" }}>
            <small style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>Product Image</small>
            <ProductImageInput initialUrl={normalizeLogoUrl(item.imageUrl)} />
          </div>
          <button className="btn">Save Changes</button>
        </form>
      </div>
    </>
  );
}
