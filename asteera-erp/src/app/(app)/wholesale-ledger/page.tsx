import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function WholesaleLedgerPage() {
  const rows = await db.select({
    customerName: schema.orders.customerName,
    phone: schema.orders.phone,
    ordersCount: sql<number>`COUNT(*)`,
    total: sql<number>`COALESCE(SUM(${schema.orders.total}),0)`,
    paid: sql<number>`COALESCE(SUM(${schema.orders.paid}),0)`,
  })
    .from(schema.orders)
    .where(eq(schema.orders.pageName, "Wholesale"))
    .groupBy(schema.orders.customerName, schema.orders.phone);

  return (
    <>
      <h2>Wholesale Ledger</h2>
      <div className="card">
        <table>
          <thead><tr><th>Buyer / Shop</th><th>Phone</th><th>Orders</th><th>Total Billed</th><th>Total Paid</th><th>Balance Due</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><b>{r.customerName}</b></td><td>{r.phone}</td><td>{r.ordersCount}</td>
                <td>৳ {fmt(r.total)}</td><td>৳ {fmt(r.paid)}</td>
                <td><b>৳ {fmt(Math.max(0, Number(r.total) - Number(r.paid)))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No wholesale ledger entries yet. <Link href="/wholesale">View Wholesale Orders</Link></p>}
      </div>
    </>
  );
}
