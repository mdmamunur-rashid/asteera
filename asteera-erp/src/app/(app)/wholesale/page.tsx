import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  const rows = await db.select().from(schema.orders)
    .where(eq(schema.orders.pageName, "Wholesale"))
    .orderBy(desc(schema.orders.id)).limit(200);

  return (
    <>
      <h2>Wholesale Orders</h2>
      <div className="toolbar">
        <Link href="/sales/new" className="btn">+ New Wholesale Order (set Page/Source = Wholesale)</Link>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Buyer / Shop</th><th>Phone</th><th>Status</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/sales/${o.id}`}><b>{o.invoiceNo}</b></Link></td>
                <td>{o.date}</td><td>{o.customerName}</td><td>{o.phone}</td>
                <td><span className="badge">{o.status}</span></td>
                <td>৳ {fmt(o.total)}</td><td>৳ {fmt(o.paid)}</td><td><b>৳ {fmt(Math.max(0, o.total - o.paid))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No wholesale orders yet (create an order with Page / Source = &quot;Wholesale&quot;).</p>}
      </div>
    </>
  );
}
