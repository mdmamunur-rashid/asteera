import Link from "next/link";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import DuplicatesModalClient, { type DupGroup } from "@/components/DuplicatesModalClient";
import SalesTableClient, { type SaleRow } from "@/components/SalesTableClient";
import { last10, ORDER_STATUSES } from "@/lib/util";
import { acceptDuplicate, bulkOrderAction, deleteOrder, setOrderStatus } from "./actions";

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
  searchParams: Promise<{ q?: string; status?: string; date?: string; brand?: string; courier?: string; ok?: string; error?: string }>;
}) {
  const { q, status, date: dateParam, brand, courier, ok, error } = await searchParams;
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
  const checkDate = selectedDate || bdToday();
  const term = q ? `%${q}%` : null;

  const [rows, statusCounts, allPhones, checkDateOrders] = await Promise.all([
    db.select().from(schema.orders)
      .where(and(
        status ? eq(schema.orders.status, status) : undefined,
        selectedDate ? eq(schema.orders.date, selectedDate) : undefined,
        brand ? eq(schema.orders.pageName, brand) : undefined,
        courier ? eq(schema.orders.courier, courier) : undefined,
        term ? or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term)) : undefined,
      ))
      .orderBy(desc(schema.orders.id)).limit(300),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` }).from(schema.orders).groupBy(schema.orders.status),
    db.select({ phone: schema.orders.phone }).from(schema.orders),
    db.select().from(schema.orders).where(eq(schema.orders.date, checkDate)).orderBy(desc(schema.orders.id)),
  ]);

  const countMap = new Map(statusCounts.map((r) => [r.s, Number(r.c)]));
  const totalCount = statusCounts.reduce((sum, r) => sum + Number(r.c), 0);

  const phoneTotalMap = new Map<string, number>();
  for (const r of allPhones) {
    const p10 = last10(r.phone);
    if (p10.length < 10) continue;
    phoneTotalMap.set(p10, (phoneTotalMap.get(p10) ?? 0) + 1);
  }

  const checkDayOrdersByPhone = new Map<string, typeof checkDateOrders>();
  for (const r of checkDateOrders) {
    const p10 = last10(r.phone);
    if (p10.length < 10 || r.status === "Cancelled") continue;
    const list = checkDayOrdersByPhone.get(p10) ?? [];
    list.push(r);
    checkDayOrdersByPhone.set(p10, list);
  }

  const rawDupGroups = Array.from(checkDayOrdersByPhone.entries()).filter(([, list]) => list.length > 1);
  const dupOrderIds = rawDupGroups.flatMap(([, list]) => list.map((o) => o.id));
  const dupLines = dupOrderIds.length > 0
    ? await db.select({
        orderId: schema.orderLines.orderId,
        sku: schema.items.sku,
        name: schema.items.name,
        size: schema.items.size,
        qty: schema.orderLines.qty,
        price: schema.orderLines.price,
      })
        .from(schema.orderLines)
        .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
        .where(inArray(schema.orderLines.orderId, dupOrderIds))
    : [];

  const dupGroups: DupGroup[] = rawDupGroups.map(([phone10, list]) => ({
    phone10,
    orders: list.map((o) => ({
      id: o.id,
      invoiceNo: o.invoiceNo,
      date: o.date,
      customerName: o.customerName,
      phone: o.phone,
      address: o.address,
      pageName: o.pageName,
      status: o.status,
      paymentMode: o.paymentMode,
      total: o.total,
      paid: o.paid,
      courier: o.courier,
      trackingNo: o.trackingNo,
      note: o.note,
      dupAccepted: o.dupAccepted,
      items: dupLines.filter((l) => l.orderId === o.id).map((l) => ({
        sku: l.sku, name: l.name, size: l.size, qty: l.qty, price: l.price,
      })),
    })),
  }));

  const unacceptedDupGroups = dupGroups.filter((g) => g.orders.filter((o) => o.dupAccepted === 0).length > 1);

  const clientRows: SaleRow[] = rows.map((o) => {
    const p10 = last10(o.phone);
    const list = o.date === checkDate && p10.length === 10 && o.status !== "Cancelled"
      ? (checkDayOrdersByPhone.get(p10) ?? [])
      : [];
    const sameDayDups = list.length > 1 && list.filter((x) => x.dupAccepted === 0).length > 1 && o.dupAccepted === 0;
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
      <h2>Sales / Orders{brand ? ` — ${brand}` : ""}{courier ? ` — ${courier}` : ""}</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      {unacceptedDupGroups.length > 0 && (
        <div className="err" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <b>Warning: {unacceptedDupGroups.length} duplicate phone number(s) on {checkDate}:</b>{" "}
            {unacceptedDupGroups.slice(0, 5).map((g) => `${g.phone10} (${g.orders.map((o) => o.invoiceNo).join(", ")})`).join(" | ")}
            {unacceptedDupGroups.length > 5 ? ` (+${unacceptedDupGroups.length - 5} more)` : ""}
          </div>
          <small>Click <b>Find Duplicates</b> below to compare side-by-side.</small>
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
        <DuplicatesModalClient checkDate={checkDate} groups={dupGroups} acceptAction={acceptDuplicate} deleteAction={deleteOrder} />
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
