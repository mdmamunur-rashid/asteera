import Link from "next/link";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, ORDER_STATUSES } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function Sales({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const term = q ? `%${q}%` : null;
  const rows = await db.select().from(schema.orders)
    .where(and(
      status ? eq(schema.orders.status, status) : undefined,
      term ? or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term)) : undefined,
    ))
    .orderBy(desc(schema.orders.id)).limit(300);

  return (
    <>
      <h2>Sales / Orders</h2>
      <div className="toolbar">
        <Link className="btn" href="/sales/new">+ New order / invoice</Link>
        <form className="toolbar">
          <input name="q" placeholder="Invoice / name / phone" defaultValue={q} />
          <select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn secondary">Filter</button>
        </form>
      </div>
      <div className="card">
        <table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Phone</th><th>Status</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/sales/${o.id}`}>{o.invoiceNo}</Link></td><td>{o.date}</td><td>{o.customerName}</td><td>{o.phone}</td>
              <td><span className="badge">{o.status}</span></td><td>{fmt(o.total)}</td><td>{fmt(o.paid)}</td><td>{fmt(o.total - o.paid)}</td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
