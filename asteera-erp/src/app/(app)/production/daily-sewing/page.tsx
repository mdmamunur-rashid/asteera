import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function DailySewingPage() {
  const [batches, sups] = await Promise.all([
    db.select().from(schema.productionBatches).orderBy(desc(schema.productionBatches.id)).limit(300),
    db.select().from(schema.suppliers),
  ]);
  const supMap = new Map(sups.map((s) => [s.id, s.name]));

  return (
    <>
      <h2>Daily Sewing Production</h2>
      <div className="card">
        <table>
          <thead><tr><th>Batch</th><th>Date</th><th>SKU</th><th>Qty</th><th>Sewing Supplier</th><th>Unit Cost</th><th>Total Cost</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>#{b.id}</td><td>{b.date}</td><td><b>{b.sku}</b></td><td>{fmt(b.qty)}</td>
                <td>{b.sewSupplierId ? supMap.get(b.sewSupplierId) ?? "—" : "—"}</td>
                <td>৳ {fmt(b.sewUnitCost)}</td><td><b>৳ {fmt(b.qty * b.sewUnitCost)}</b></td>
                <td>{fmt(b.sewReceivedQty)} {b.sewReceivedDate ? `(${b.sewReceivedDate})` : ""}</td>
                <td><span className={`badge ${b.sewStatus === "Done" ? "ok" : "warn"}`}>{b.sewStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 && <p>No sewing batches recorded yet.</p>}
      </div>
    </>
  );
}
