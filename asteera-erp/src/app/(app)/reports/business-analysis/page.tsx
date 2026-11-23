import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function BusinessAnalysisPage() {
  const [byBrand, byCourier, topSkus] = await Promise.all([
    db.select({
      brand: schema.orders.pageName,
      orders: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${schema.orders.total}),0)`,
    }).from(schema.orders).groupBy(schema.orders.pageName),
    db.select({
      courier: schema.orders.courier,
      orders: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${schema.orders.total}),0)`,
    }).from(schema.orders).groupBy(schema.orders.courier),
    db.select({
      sku: schema.items.sku,
      name: schema.items.name,
      qty: sql<number>`COALESCE(SUM(${schema.orderLines.qty}),0)`,
      revenue: sql<number>`COALESCE(SUM(${schema.orderLines.qty}*${schema.orderLines.price}),0)`,
    })
      .from(schema.orderLines)
      .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
      .groupBy(schema.items.id, schema.items.sku, schema.items.name)
      .orderBy(desc(sql`SUM(${schema.orderLines.qty})`))
      .limit(20),
  ]);

  return (
    <>
      <h2>Business Analysis</h2>
      <div className="grid">
        <div className="card">
          <h3>By Brand / Page</h3>
          <table><thead><tr><th>Brand</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>{byBrand.map((b, i) => <tr key={i}><td>{b.brand || "Direct / Unassigned"}</td><td>{b.orders}</td><td>৳ {fmt(b.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h3>By Courier</h3>
          <table><thead><tr><th>Courier</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>{byCourier.map((c, i) => <tr key={i}><td>{c.courier || "Unassigned"}</td><td>{c.orders}</td><td>৳ {fmt(c.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Top 20 Selling Products</h3>
        <table><thead><tr><th>SKU</th><th>Product</th><th>Total Sold Qty</th><th>Revenue</th></tr></thead>
          <tbody>{topSkus.map((t, i) => <tr key={i}><td><b>{t.sku}</b></td><td>{t.name}</td><td>{fmt(t.qty)}</td><td>৳ {fmt(t.revenue)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
