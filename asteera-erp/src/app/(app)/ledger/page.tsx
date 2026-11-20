import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";
import { payLedger } from "../production/actions";

export const dynamic = "force-dynamic";

export default async function Ledger() {
  const rows = await db
    .select({ e: schema.ledgerEntries, supplier: schema.suppliers.name })
    .from(schema.ledgerEntries)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.ledgerEntries.supplierId))
    .orderBy(desc(schema.ledgerEntries.id)).limit(300);

  return (
    <>
      <h2>Supplier ledger</h2>
      <p>Entries are created automatically when a production stage is marked Done.</p>
      <div className="card">
        <table><thead><tr><th>Ref</th><th>Date</th><th>Supplier</th><th>SKU</th><th>Qty</th><th>Rate</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map(({ e, supplier }) => {
            const bal = e.totalDue - e.amountPaid;
            const st = bal <= 0 ? "Paid" : e.amountPaid > 0 ? "Partially Paid" : "Unpaid";
            return (
              <tr key={e.id}>
                <td>{e.ref}</td><td>{e.date}</td><td>{supplier}</td><td>{e.sku}</td><td>{fmt(e.qty)}</td><td>{fmt(e.unitCost)}</td>
                <td>{fmt(e.totalDue)}</td><td>{fmt(e.amountPaid)}</td><td><b>{fmt(bal)}</b></td>
                <td><span className={`badge ${st === "Paid" ? "ok" : st === "Unpaid" ? "bad" : "warn"}`}>{st}</span></td>
                <td>{bal > 0 && (
                  <form action={payLedger} className="toolbar" style={{ marginBottom: 0 }}>
                    <input type="hidden" name="id" value={e.id} /><input name="amount" type="number" step="any" placeholder="Pay" style={{ width: 90 }} />
                    <button className="btn secondary">Pay</button>
                  </form>)}</td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
