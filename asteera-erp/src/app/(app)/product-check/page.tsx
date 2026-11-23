import { asc, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { getStockMap } from "@/lib/queries";
import { normalizeLogoUrl } from "@/lib/settings";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function ProductCheckPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = q ? `%${q}%` : null;
  const [items, stock] = await Promise.all([
    db.select().from(schema.items)
      .where(term ? or(like(schema.items.sku, term), like(schema.items.name, term)) : undefined)
      .orderBy(asc(schema.items.sku)).limit(100),
    getStockMap(),
  ]);

  return (
    <>
      <h2>Product Check</h2>
      <form className="toolbar">
        <input name="q" placeholder="Enter SKU or Product Name..." defaultValue={q} style={{ minWidth: 260 }} />
        <button className="btn">Check Product</button>
      </form>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {items.map((i) => {
          const s = stock.get(i.id) ?? { purchased: 0, sold: 0, remaining: 0 };
          const img = normalizeLogoUrl(i.imageUrl);
          return (
            <div key={i.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 0 }}>
              {img ? (
                <img src={img} alt={i.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#94a3b8" }}>No img</div>
              )}
              <div style={{ minWidth: 0 }}>
                <b>{i.sku}</b> · <small>{i.size || "Free"}</small><br />
                <span>{i.name}</span><br />
                <small>Cost: ৳ {fmt(i.purchasePrice)} · MRP: <b>৳ {fmt(i.salePrice)}</b></small><br />
                <span className={`badge ${s.remaining <= i.reorderLevel ? "bad" : "ok"}`}>Stock: {fmt(s.remaining)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
