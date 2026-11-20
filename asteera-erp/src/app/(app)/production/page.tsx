import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, STAGE_STATUSES, today } from "@/lib/util";
import { createBatch, updateStage } from "./actions";

export const dynamic = "force-dynamic";

function StageForm({ id, stage, status }: { id: number; stage: "print" | "sew"; status: string }) {
  return (
    <form action={updateStage} className="toolbar" style={{ marginBottom: 0 }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="stage" value={stage} />
      <select name="status" defaultValue={status}>{STAGE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      <button className="btn secondary">Set</button>
    </form>
  );
}

export default async function Production({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [batches, sups, fabrics] = await Promise.all([
    db.select().from(schema.productionBatches).orderBy(desc(schema.productionBatches.id)).limit(200),
    db.select().from(schema.suppliers),
    db.select().from(schema.fabrics),
  ]);
  const supName = (id: number | null) => sups.find((s) => s.id === id)?.name ?? "—";
  const printers = sups.filter((s) => s.type === "Printing"), sewers = sups.filter((s) => s.type === "Sewing");

  return (
    <>
      <h2>Production</h2>
      {error && <div className="err">{error}</div>}
      <details className="card">
        <summary><b>+ New batch</b></summary>
        <form action={createBatch} className="form" style={{ marginTop: 12 }}>
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>SKU<input name="sku" required /></label>
          <label>Qty<input type="number" step="any" name="qty" required /></label>
          <label>Fabric<select name="fabricId"><option value="">—</option>{fabrics.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>Fabric per unit<input type="number" step="any" name="fabricPerUnit" defaultValue={0} /></label>
          <label>Print supplier<select name="printSupplierId"><option value="">—</option>{printers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Print rate / fabric unit<input type="number" step="any" name="printRate" defaultValue={35} /></label>
          <label>Sewing supplier<select name="sewSupplierId"><option value="">—</option>{sewers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Sewing cost / unit<input type="number" step="any" name="sewUnitCost" defaultValue={100} /></label>
          <button className="btn">Create batch</button>
        </form>
      </details>
      <div className="card">
        <table>
          <thead><tr><th>#</th><th>Date</th><th>SKU</th><th>Qty</th><th>Fabric used</th><th>Printing</th><th>Sewing</th></tr></thead>
          <tbody>{batches.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td><td>{b.date}</td><td>{b.sku}<br /><small>{b.itemName}</small></td><td>{fmt(b.qty)}</td><td>{fmt(b.qty * b.fabricPerUnit)}</td>
              <td><span className={`badge ${b.printStatus === "Done" ? "ok" : ""}`}>{b.printStatus}</span> <small>{supName(b.printSupplierId)}</small><StageForm id={b.id} stage="print" status={b.printStatus} /></td>
              <td><span className={`badge ${b.sewStatus === "Done" ? "ok" : ""}`}>{b.sewStatus}</span> <small>{supName(b.sewSupplierId)}</small><StageForm id={b.id} stage="sew" status={b.sewStatus} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
