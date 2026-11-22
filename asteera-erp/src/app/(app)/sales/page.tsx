import Link from "next/link";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import SalesTableClient, { type SaleRow } from "@/components/SalesTableClient";
import { last10, ORDER_STATUSES } from "@/lib/util";
import { bulkOrderAction, setOrderStatus } from "./actions";

export const dynamic = "force-dynamic";

function bdToday(): string {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " order";
}

export default async function Sales({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; date?: string; ok?: string; error?: string }>;
}) {
  const { q, status, date: dateParam, ok, error } = await searchParams;
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
  const checkDate = selectedDate || bdToday();
  const term = q ? `%${q}%` : null;

  const [rows, statusCounts, allPhones, checkDateOrders] = await Promise.all([
    db.select().from(schema.orders)
      .where(and(
        status ? eq(schema.orders.status, status) : undefined,
        selectedDate ? eq(schema.orders.date, selectedDate) : undefined,
        term ? or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term)) : undefined,
      ))
      .orderBy(desc(schema.orders.id)).limit(300),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` }).from(schema.orders).groupBy(schema.orders.status),
    db.select({ phone: schema.orders.phone }).from(schema.orders),
    db.select({ phone: schema.orders.phone, status: schema.orders.status, invoiceNo: schema.orders.invoiceNo })
      .from(schema.orders)
      .where(eq(schema.orders.date, checkDate)),
  ]);

  const countMap = new Map(statusCounts.map((r) => [r.s, Number(r.c)]));
  const totalCount = statusCounts.reduce((sum, r) => sum + Number(r.c), 0);

  const phoneTotalMap = new Map<string, number>();
  for (const r of allPhones) {
    const p10 = last10(r.phone);
    if (p10.length < 10) continue;
    phoneTotalMap.set(p10, (phoneTotalMap.get(p10) ?? 0) + 1);
  }

  const checkDayMap = new Map<string, string[]>();
  for (const r of checkDateOrders) {
    const p10 = last10(r.phone);
    if (p10.length < 10 || r.status === "Cancelled") continue;
    const list = checkDayMap.get(p10) ?? [];
    list.push(r.invoiceNo);
    checkDayMap.set(p10, list);
  }

  const dupGroups = Array.from(checkDayMap.entries()).filter(([, invs]) => invs.length > 1);

  const clientRows: SaleRow[] = rows.map((o) => {
    const p10 = last10(o.phone);
    const sameDayDups = o.date === checkDate && p10.length === 10 && o.status !== "Cancelled"
      ? (checkDayMap.get(p10)?.length ?? 0) > 1
      : false;
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
          <b>Warning: {dupGroups.length} duplicate phone number(s) on {checkDate}:</b>{" "}
          {dupGroups.slice(0, 6).map(([p10, invs]) => `${p10} (${invs.join(", ")})`).join(" | ")}
          {dupGroups.length > 6 ? ` (+${dupGroups.length - 6} more)` : ""}
        </div>
      )}

      <div className="tabs">
        <Link href={`/sales${selectedDate ? `?date=${selectedDate}` : ""}`} className={`tab ${!status ? "active" : ""}`}>All ({totalCount})</Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/sales?status=${encodeURIComponent(s)}${selectedDate ? `&date=${selectedDate}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`tab ${status === s ? "active" : ""}`}
          >
            {s} ({countMap.get(s) ?? 0})
          </Link>
        ))}
      </div>

      <div className="toolbar">
        <Link className="btn" href="/sales/new">+ New order / invoice</Link>
        <Link className="btn secondary" href="/sales/bulk-print">Bulk Print Unprinted</Link>
        <form className="toolbar" style={{ marginBottom: 0 }}>
          {status && <input type="hidden" name="status" value={status} />}
          <input type="date" name="date" defaultValue={selectedDate} title="Filter & check duplicates for date (defaults to today)" />
          <input name="q" placeholder="Search invoice, name, phone..." defaultValue={q} />
          <button className="btn secondary">Filter</button>
          {(selectedDate || q || status) && <Link href="/sales" className="btn danger" style={{ padding: "8px 12px" }}>Reset</Link>}
        </form>
      </div>

      <SalesTableClient rows={clientRows} bulkAction={bulkOrderAction} inlineStatusAction={setOrderStatus} />
    </>
  );
}
