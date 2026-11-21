import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function Purchases() {
  const rows = await db
    .select({
      id: schema.purchaseOrders.id, poNo: schema.purchaseOrders.poNo, date: schema.purchaseOrders.date,
      supplier: schema.suppliers.name, paid: schema.purchaseOrders.paid,
      total: sql<number>`COALESCE(SUM(${schema.purchaseLines.qty}*${schema.purchaseLines.unitCost}),0)`,
    })
    .from(schema.purchaseOrders)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.purchaseOrders.supplierId))
    .leftJoin(schema.purchaseLines, eq(schema.purchaseLines.poId, schema.purchaseOrders.id))
    .groupBy(schema.purchaseOrders.id, schema.suppliers.name)
    .orderBy(desc(schema.purchaseOrders.id)).limit(200);

  return (
    <>
      <h2>Purchase orders</h2>
      <div className="toolbar"><Link className="btn" href="/purchases/new">+ New purchase order</Link></div>
      <div className="card">
        <table><thead><tr><th>PO</th><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td><Link href={`/purchases/${r.id}`}>{r.poNo}</Link></td><td>{r.date}</td><td>{r.supplier}</td>
              <td>{fmt(r.total)}</td><td>{fmt(r.paid)}</td><td>{fmt(Number(r.total) - r.paid)}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
