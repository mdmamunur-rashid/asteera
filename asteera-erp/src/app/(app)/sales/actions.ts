"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { dispatchPathao, dispatchSteadfast } from "@/lib/integrations";
import { nextInvoiceNo } from "@/lib/queries";
import { last10, num, ORDER_STATUSES, parseLines, str, today } from "@/lib/util";

export async function createOrder(f: FormData) {
  await requireSession();
  const customerName = str(f, "customerName");
  const lines = parseLines(str(f, "lines"));
  if (!customerName || lines.length === 0) redirect("/sales/new?error=Customer+name+and+at+least+one+valid+line+required");

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery = num(f, "deliveryCharge"), discount = num(f, "discount");
  const total = Math.max(0, subtotal + delivery - discount);
  const status = ORDER_STATUSES.includes(str(f, "status")) ? str(f, "status") : "Billed";

  const orderDate = str(f, "date") || today();
  const phone = str(f, "phone");
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.orders).values({
      invoiceNo: await nextInvoiceNo(), date: orderDate, customerName,
      phone, address: str(f, "address"), pageName: str(f, "pageName"), status,
      paymentMode: str(f, "paymentMode") === "Paid" ? "Paid" : "COD",
      deliveryCharge: delivery, discount, total, paid: num(f, "paid"), note: str(f, "note"),
    }).$returningId();
    await tx.insert(schema.orderLines).values(lines.map((l) => ({ orderId: r.id, itemId: l.itemId, qty: l.qty, price: l.price })));
    return r.id;
  });

  const p10 = last10(phone);
  let dupWarn = "";
  if (p10.length === 10) {
    const sameDay = await db.select({ id: schema.orders.id, invoiceNo: schema.orders.invoiceNo, phone: schema.orders.phone })
      .from(schema.orders)
      .where(and(eq(schema.orders.date, orderDate), ne(schema.orders.id, id), like(schema.orders.phone, `%${p10.slice(-6)}`)));
    const dups = sameDay.filter((o) => last10(o.phone) === p10);
    if (dups.length > 0) {
      dupWarn = `?warn=${encodeURIComponent(`Duplicate phone (${p10}) found on ${orderDate}: ${dups.map((d) => d.invoiceNo).join(", ")}`)}`;
    }
  }
  revalidatePath("/sales");
  redirect(`/sales/${id}${dupWarn}`);
}

export async function updateOrder(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const customerName = str(f, "customerName");
  const lines = parseLines(str(f, "lines"));
  if (!id || !customerName || lines.length === 0) redirect(`/sales/${id}?error=Customer+name+and+at+least+one+line+required`);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery = num(f, "deliveryCharge"), discount = num(f, "discount"), returnCost = num(f, "returnCost");
  const total = Math.max(0, subtotal + delivery - discount + returnCost);
  const status = ORDER_STATUSES.includes(str(f, "status")) ? str(f, "status") : "Billed";

  await db.transaction(async (tx) => {
    await tx.update(schema.orders).set({
      date: str(f, "date") || today(),
      customerName,
      phone: str(f, "phone"),
      address: str(f, "address"),
      pageName: str(f, "pageName"),
      status,
      paymentMode: str(f, "paymentMode") === "Paid" ? "Paid" : "COD",
      deliveryCharge: delivery,
      discount,
      returnCost,
      total,
      paid: num(f, "paid"),
      note: str(f, "note"),
    }).where(eq(schema.orders.id, id));
    await tx.delete(schema.orderLines).where(eq(schema.orderLines.orderId, id));
    await tx.insert(schema.orderLines).values(lines.map((l) => ({ orderId: id, itemId: l.itemId, qty: l.qty, price: l.price })));
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?ok=Order+updated`);
}

export async function setOrderStatus(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), status = str(f, "status");
  if (ORDER_STATUSES.includes(status)) {
    await db.update(schema.orders).set({
      status,
      courier: str(f, "courier") || undefined,
      trackingNo: str(f, "trackingNo") || undefined,
    }).where(eq(schema.orders.id, id));
  }
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}`);
}

export async function payOrder(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), amount = num(f, "amount");
  if (amount > 0) await db.update(schema.orders).set({ paid: sql`${schema.orders.paid} + ${amount}` }).where(eq(schema.orders.id, id));
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}`);
}

export async function markPrinted(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  await db.update(schema.orders).set({ printedAt: sql`NOW()` }).where(eq(schema.orders.id, id));
  redirect(`/sales/${id}`);
}

export async function markAllUnprinted() {
  await requireSession();
  await db.update(schema.orders).set({ printedAt: sql`NOW()` }).where(isNull(schema.orders.printedAt));
  revalidatePath("/sales/bulk-print");
  redirect("/sales/bulk-print?ok=Marked+all+as+printed");
}

export async function sendToSteadfast(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const res = await dispatchSteadfast(id);
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?${res.ok ? "ok" : "error"}=${encodeURIComponent(res.message)}`);
}

export async function sendToPathao(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const res = await dispatchPathao(id);
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?${res.ok ? "ok" : "error"}=${encodeURIComponent(res.message)}`);
}

export async function bulkOrderAction(f: FormData) {
  await requireSession();
  const ids = f.getAll("ids").map(Number).filter((n) => n > 0);
  const action = str(f, "bulkAction");
  if (ids.length === 0 || !action) redirect("/sales?error=Select+orders+and+an+action");

  if (action === "print") {
    redirect(`/sales/bulk-print?ids=${ids.join(",")}`);
  }
  if (action === "steadfast") {
    let okCount = 0;
    for (const id of ids) { if ((await dispatchSteadfast(id)).ok) okCount++; }
    revalidatePath("/sales");
    redirect(`/sales?ok=${encodeURIComponent(`Sent ${okCount}/${ids.length} to Steadfast`)}`);
  }
  if (action === "pathao") {
    let okCount = 0;
    for (const id of ids) { if ((await dispatchPathao(id)).ok) okCount++; }
    revalidatePath("/sales");
    redirect(`/sales?ok=${encodeURIComponent(`Sent ${okCount}/${ids.length} to Pathao`)}`);
  }
  if (ORDER_STATUSES.includes(action)) {
    await db.update(schema.orders).set({ status: action }).where(inArray(schema.orders.id, ids));
    revalidatePath("/sales");
    redirect(`/sales?ok=${encodeURIComponent(`Updated ${ids.length} order(s) to ${action}`)}`);
  }
  redirect("/sales");
}

export async function processReturn(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const returnType = str(f, "returnType") === "Full" ? "Full" : "Partial";
  const returnCost = num(f, "returnCost");
  const note = str(f, "note");

  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  if (!o) redirect("/sales");
  const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, id));

  const returnedItems: { lineId: number; itemId: number; qty: number }[] = [];
  if (returnType === "Full") {
    for (const l of lines) {
      returnedItems.push({ lineId: l.id, itemId: l.itemId, qty: l.qty });
    }
    await db.transaction(async (tx) => {
      await tx.update(schema.orderLines).set({ qty: 0 }).where(eq(schema.orderLines.orderId, id));
      await tx.update(schema.orders).set({
        status: "Returned",
        returnCost: o.returnCost + returnCost,
        total: returnCost,
      }).where(eq(schema.orders.id, id));
      await tx.insert(schema.orderReturns).values({
        orderId: id, invoiceNo: o.invoiceNo, returnType: "Full",
        itemsJson: JSON.stringify(returnedItems), returnCost, note,
      });
    });
  } else {
    const lineId = Number(f.get("lineId"));
    const retQty = num(f, "returnQty");
    const target = lines.find((l) => l.id === lineId);
    if (!target || retQty <= 0) redirect(`/sales/${id}?error=Select+line+and+return+quantity`);
    const actualRet = Math.min(target.qty, retQty);
    const newQty = Math.max(0, target.qty - actualRet);
    returnedItems.push({ lineId: target.id, itemId: target.itemId, qty: actualRet });

    await db.transaction(async (tx) => {
      await tx.update(schema.orderLines).set({ qty: newQty }).where(eq(schema.orderLines.id, target.id));
      const newSubtotal = lines.reduce((sum, l) => sum + (l.id === target.id ? newQty : l.qty) * l.price, 0);
      const newTotal = Math.max(0, newSubtotal + o.deliveryCharge - o.discount + o.returnCost + returnCost);
      await tx.update(schema.orders).set({
        returnCost: o.returnCost + returnCost,
        total: newTotal,
      }).where(eq(schema.orders.id, id));
      await tx.insert(schema.orderReturns).values({
        orderId: id, invoiceNo: o.invoiceNo, returnType: "Partial",
        itemsJson: JSON.stringify(returnedItems), returnCost, note,
      });
    });
  }

  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?ok=Return+processed`);
}
