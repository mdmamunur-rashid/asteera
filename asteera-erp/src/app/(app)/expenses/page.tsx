import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, today } from "@/lib/util";
import { createExpense } from "./actions";

export const dynamic = "force-dynamic";

export default async function Expenses({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [rows, byCat] = await Promise.all([
    db.select().from(schema.expenses).orderBy(desc(schema.expenses.date), desc(schema.expenses.id)).limit(300),
    db.select({ c: schema.expenses.category, t: sql<number>`SUM(${schema.expenses.amount})` }).from(schema.expenses).groupBy(schema.expenses.category),
  ]);
  return (
    <>
      <h2>Expenses</h2>
      {error && <div className="err">{error}</div>}
      <details className="card">
        <summary><b>+ Add expense</b></summary>
        <form action={createExpense} className="form" style={{ marginTop: 12 }}>
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>Category<input name="category" required /></label>
          <label>Purpose<input name="purpose" /></label>
          <label>Amount<input type="number" step="any" name="amount" required /></label>
          <label>Status<select name="paymentStatus"><option>Paid</option><option>Unpaid</option></select></label>
          <label>Paid by<input name="paidBy" /></label>
          <label>Notes<input name="notes" /></label>
          <button className="btn">Save</button>
        </form>
      </details>
      <div className="card">{byCat.map((c) => <span key={c.c} className="badge" style={{ marginRight: 8 }}>{c.c}: {fmt(c.t)}</span>)}</div>
      <div className="card">
        <table><thead><tr><th>Date</th><th>Category</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Paid by</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.category}</td><td>{e.purpose}</td><td>{fmt(e.amount)}</td><td>{e.paymentStatus}</td><td>{e.paidBy}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
