"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { nextInvoiceNo } from "@/lib/queries";
import { num, ORDER_STATUSES, parseLines, str, today } from "@/lib/util";

export async function createOrder(f: FormData) {
  await requireSession();
  const customerName = str(f, "customerName");
  const lines = parseLines(str(f, "lines"));
  if (!customerName || lines.length === 0) redirect("/sales/new?error=Customer+name+and+at+least+one+valid+line+required");

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery = num(f, "deliveryCharge"), discount = num(f, "discount");
  const total = Math.max(0, subtotal + delivery - discount);
  const status = ORDER_STATUSES.includes(str(f, "status")) ? str(f, "status") : "Billed";

  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.orders).values({
      invoiceNo: await nextInvoiceNo(), date: str(f, "date") || today(), customerName,
      phone: str(f, "phone"), address: str(f, "address"), pageName: str(f, "pageName"), status,
      paymentMode: str(f, "paymentMode") === "Paid" ? "Paid" : "COD",
      deliveryCharge: delivery, discount, total, paid: num(f, "paid"), note: str(f, "note"),
    }).$returningId();
    await tx.insert(schema.orderLines).values(lines.map((l) => ({ orderId: r.id, itemId: l.itemId, qty: l.qty, price: l.price })));
    return r.id;
  });
  revalidatePath("/sales");
  redirect(`/sales/${id}`);
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
