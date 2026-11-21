import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSupplier } from "./actions";

export const dynamic = "force-dynamic";

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const rows = await db.select().from(schema.suppliers).orderBy(desc(schema.suppliers.id));
  return (
    <>
      <h2>Suppliers</h2>
      {error && <div className="err">{error}</div>}
      <details className="card">
        <summary><b>+ Add supplier</b></summary>
        <form action={createSupplier} className="form" style={{ marginTop: 12 }}>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Type
            <select name="type"><option>Fabric</option><option>Printing</option><option>Sewing</option><option>Other</option></select>
          </label>
          <label>Phone<input name="phone" /></label>
          <label>Address<input name="address" /></label>
          <button className="btn">Save</button>
        </form>
      </details>
      <div className="card">
        <table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Phone</th><th>Address</th></tr></thead>
          <tbody>{rows.map((s) => <tr key={s.id}><td>{s.code}</td><td>{s.name}</td><td>{s.type}</td><td>{s.phone}</td><td>{s.address}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
