import Link from "next/link";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import SalesTableClient, { type SaleRow } from "@/components/SalesTableClient";
import { last10, ORDER_STATUSES } from "@/lib/util";
import { bulkOrderAction, setOrderStatus } from "./actions";

export const dynamic = "force-dynamic";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " order";
}

export default async function Sales({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ok?: string; error?: string }>;
}) {
  const { q, status, ok, error } = await searchParams;
  const term = q ? `%${q}%` : null;

  const [rows, statusCounts, allPhonesDates] = await Promise.all([
    db.select().from(schema.orders)
      .where(and(
        status ? eq(schema.orders.status, status) : undefined,
        term ? or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term)) : undefined,
      ))
      .orderBy(desc(schema.orders.id)).limit(300),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` }).from(schema.orders).groupBy(schema.orders.status),
    db.select({ phone: schema.orders.phone, date: schema.orders.date, status: schema.orders.status, invoiceNo: schema.orders.invoiceNo }).from(schema.orders),
  ]);

  const countMap = new Map(statusCounts.map((r) => [r.s, Number(r.c)]));
  const totalCount = statusCounts.reduce((sum, r) => sum + Number(r.c), 0);

  const phoneTotalMap = new Map<string, number>();
  const sameDayMap = new Map<string, string[]>();
  for (const r of allPhonesDates) {
    const p10 = last10(r.phone);
    if (p10.length < 10) continue;
    phoneTotalMap.set(p10, (phoneTotalMap.get(p10) ?? 0) + 1);
    if (r.status !== "Cancelled") {
      const k = `${r.date}::${p10}`;
      const list = sameDayMap.get(k) ?? [];
      list.push(r.invoiceNo);
      sameDayMap.set(k, list);
    }
  }

  const dupGroups = Array.from(sameDayMap.entries()).filter(([, invs]) => invs.length > 1);

  const clientRows: SaleRow[] = rows.map((o) => {
    const p10 = last10(o.phone);
    const sameDayDups = p10.length === 10 && o.status !== "Cancelled" ? (sameDayMap.get(`${o.date}::${p10}`)?.length ?? 0) > 1 : false;
    return {
      id: o.id,
      invoiceNo: o.invoiceNo,
      date: o.date,
      customerName: o.customerName,
      phone: o.phone,
      address: o.address,
      status: o.status,
      paymentMode: o.paymentMode,
      total: o.total,
      paid: o.paid,
      courier: o.courier,
      trackingNo: o.trackingNo,
      orderCountLabel: ordinal(p10.length === 10 ? (phoneTotalMap.get(p10) ?? 1) : 1),
      sameDayDup: sameDayDups,
    };
  });

  return (
    <>
      <h2>Sales / Orders</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      {dupGroups.length > 0 && (
        <div className="err">
          <b>Warning: {dupGroups.length} duplicate phone number(s) found on the same day:</b>{" "}
          {dupGroups.slice(0, 6).map(([k, invs]) => {
            const [d, p10] = k.split("::");
            return `${p10} on ${d} (${invs.join(", ")})`;
          }).join(" | ")}
          {dupGroups.length > 6 ? ` (+${dupGroups.length - 6} more)` : ""}
        </div>
      )}

      <div className="tabs">
        <Link href="/sales" className={`tab ${!status ? "active" : ""}`}>All ({totalCount})</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/sales?status=${encodeURIComponent(s)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`tab ${status === s ? "active" : ""}`}>
            {s} ({countMap.get(s) ?? 0})
          </Link>
        ))}
      </div>

      <div className="toolbar">
        <Link className="btn" href="/sales/new">+ New order / invoice</Link>
        <Link className="btn secondary" href="/sales/bulk-print">Bulk Print Unprinted</Link>
        <form className="toolbar" style={{ marginBottom: 0 }}>
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" placeholder="Search invoice, name, phone..." defaultValue={q} />
          <button className="btn secondary">Filter</button>
        </form>
      </div>

      <SalesTableClient rows={clientRows} bulkAction={bulkOrderAction} inlineStatusAction={setOrderStatus} />
    </>
  );
}
