import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DupGroup } from "@/components/DuplicatesModalClient";
import type { PhoneMatchItem, SaleRow } from "@/components/SalesTableClient";
import { last10 } from "@/lib/util";

function bdToday(): string {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " order";
}

export async function loadOrdersView(params: {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  printStatus?: string;
  brand?: string;
  courier?: string;
}) {
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : "";
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : "";
  const checkDate = to || from || bdToday();
  const term = params.q ? `%${params.q}%` : null;

  const filters: SQL[] = [];
  if (params.status) filters.push(eq(schema.orders.status, params.status));
  if (from) filters.push(gte(schema.orders.date, from));
  if (to) filters.push(lte(schema.orders.date, to));
  if (params.printStatus === "printed") filters.push(isNotNull(schema.orders.printedAt));
  if (params.printStatus === "unprinted") filters.push(isNull(schema.orders.printedAt));
  if (params.brand) filters.push(eq(schema.orders.pageName, params.brand));
  if (params.courier) filters.push(eq(schema.orders.courier, params.courier));
  if (term) {
    filters.push(or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term))!);
  }

  const baseScope: SQL[] = [];
  if (params.brand) baseScope.push(eq(schema.orders.pageName, params.brand));
  if (params.courier) baseScope.push(eq(schema.orders.courier, params.courier));

  const [rows, statusCounts, allOrdersForPhone, checkDateOrders] = await Promise.all([
    db.select().from(schema.orders)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.orders.id)).limit(300),
    db.select({ s: schema.orders.status, c: sql<number>`COUNT(*)` })
      .from(schema.orders)
      .where(baseScope.length ? and(...baseScope) : undefined)
      .groupBy(schema.orders.status),
    db.select({
      id: schema.orders.id,
      invoiceNo: schema.orders.invoiceNo,
      date: schema.orders.date,
      customerName: schema.orders.customerName,
      phone: schema.orders.phone,
      total: schema.orders.total,
      status: schema.orders.status,
      courier: schema.orders.courier,
    }).from(schema.orders).orderBy(desc(schema.orders.id)),
    db.select().from(schema.orders).where(eq(schema.orders.date, checkDate)).orderBy(desc(schema.orders.id)),
  ]);

  const countMap = new Map(statusCounts.map((r) => [r.s, Number(r.c)]));
  const totalCount = statusCounts.reduce((sum, r) => sum + Number(r.c), 0);

  const phoneHistoryMap = new Map<string, PhoneMatchItem[]>();
  for (const r of allOrdersForPhone) {
    const p10 = last10(r.phone);
    if (p10.length < 10) continue;
    const list = phoneHistoryMap.get(p10) ?? [];
    list.push({
      id: r.id,
      invoiceNo: r.invoiceNo,
      date: r.date,
      customerName: r.customerName,
      phone: r.phone,
      total: r.total,
      status: r.status,
      courier: r.courier,
    });
    phoneHistoryMap.set(p10, list);
  }

  const checkDayOrdersByPhone = new Map<string, typeof checkDateOrders>();
  for (const r of checkDateOrders) {
    const p10 = last10(r.phone);
    if (p10.length < 10 || r.status === "Cancelled") continue;
    if (params.brand && r.pageName !== params.brand) continue;
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
    const matches = p10.length === 10 ? (phoneHistoryMap.get(p10) ?? []) : [];
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
      printedAt: o.printedAt ? o.printedAt.toISOString() : null,
      orderCountLabel: ordinal(matches.length || 1),
      sameDayDup: sameDayDups,
      phoneMatches: matches,
    };
  });

  return { from, to, checkDate, countMap, totalCount, dupGroups, unacceptedDupGroups, clientRows };
}
