import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function SkuFabricNeedPage() {
  const [batches, fabrics] = await Promise.all([
    db.select().from(schema.productionBatches).orderBy(desc(schema.productionBatches.id)).limit(300),
    db.select().from(schema.fabrics),
  ]);
  const fabName = new Map(fabrics.map((f) => [f.id, f.name]));

  return (
    <>
      <h2>SKU Fabric Need</h2>
      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>SKU</th><th>Item Name</th><th>Fabric</th><th>Batch Qty</th><th>Fabric / Unit</th><th>Total Fabric</th><th>Print Rate</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.date}</td><td><b>{b.sku}</b></td><td>{b.itemName || "—"}</td>
                <td>{b.fabricId ? fabName.get(b.fabricId) ?? "—" : "—"}</td>
                <td>{fmt(b.qty)}</td><td>{fmt(b.fabricPerUnit)}</td><td><b>{fmt(b.qty * b.fabricPerUnit)}</b></td><td>৳ {fmt(b.printRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 && <p>No production batches recorded yet.</p>}
      </div>
    </>
  );
}
