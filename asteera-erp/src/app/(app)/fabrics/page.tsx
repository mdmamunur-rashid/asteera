import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, today } from "@/lib/util";
import { buyFabric, createFabric } from "../production/actions";

export const dynamic = "force-dynamic";

export default async function Fabrics({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [fabrics, bought, used] = await Promise.all([
    db.select().from(schema.fabrics),
    db.select({ id: schema.fabricPurchases.fabricId, q: sql<number>`SUM(${schema.fabricPurchases.qty})` }).from(schema.fabricPurchases).groupBy(schema.fabricPurchases.fabricId),
    db.select({ id: schema.productionBatches.fabricId, q: sql<number>`SUM(${schema.productionBatches.qty}*${schema.productionBatches.fabricPerUnit})` }).from(schema.productionBatches).groupBy(schema.productionBatches.fabricId),
  ]);
  void eq;
  const get = (rows: { id: number | null; q: number }[], id: number) => Number(rows.find((r) => r.id === id)?.q ?? 0);

  return (
    <>
      <h2>Fabric stock</h2>
      {error && <div className="err">{error}</div>}
      <div className="card form">
        <form action={createFabric} className="form" style={{ gridColumn: "1/-1" }}>
          <label>New fabric<input name="name" required /></label>
          <label>Unit<input name="unit" defaultValue="goj" /></label>
          <button className="btn secondary">Add fabric</button>
        </form>
        <form action={buyFabric} className="form" style={{ gridColumn: "1/-1" }}>
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>Fabric<select name="fabricId">{fabrics.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>Qty purchased<input type="number" step="any" name="qty" required /></label>
          <label>Unit price<input type="number" step="any" name="unitPrice" defaultValue={0} /></label>
          <button className="btn">Record purchase</button>
        </form>
      </div>
      <div className="card">
        <table><thead><tr><th>Fabric</th><th>Unit</th><th>Purchased</th><th>Used</th><th>Remaining</th></tr></thead>
          <tbody>{fabrics.map((f) => {
            const p = get(bought, f.id), u = get(used, f.id), r = p - u;
            return <tr key={f.id}><td>{f.name}</td><td>{f.unit}</td><td>{fmt(p)}</td><td>{fmt(u)}</td><td><span className={`badge ${r <= 50 ? "bad" : "ok"}`}>{fmt(r)}</span></td></tr>;
          })}</tbody></table>
      </div>
    </>
  );
}
