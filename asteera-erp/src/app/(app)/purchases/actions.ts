"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { nextPoNo } from "@/lib/queries";
import { num, parseLines, str, today } from "@/lib/util";

export async function createPurchase(f: FormData) {
  await requireSession();
  const supplierId = Number(f.get("supplierId"));
  const lines = parseLines(str(f, "lines"));
  if (!supplierId || lines.length === 0) redirect("/purchases/new?error=Choose+a+supplier+and+add+at+least+one+valid+line");

  const poNo = await nextPoNo();
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.purchaseOrders).values({
      poNo, supplierId, date: str(f, "date") || today(), paid: num(f, "paid"), note: str(f, "note"),
    }).$returningId();
    await tx.insert(schema.purchaseLines).values(lines.map((l) => ({ poId: r.id, itemId: l.itemId, qty: l.qty, unitCost: l.price })));
    return r.id;
  });
  revalidatePath("/purchases");
  redirect(`/purchases/${id}`);
}

export async function updatePurchase(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), supplierId = Number(f.get("supplierId"));
  const lines = parseLines(str(f, "lines"));
  if (!id || !supplierId || lines.length === 0) redirect(`/purchases/${id}?error=Supplier+and+at+least+one+line+required`);

  await db.transaction(async (tx) => {
    await tx.update(schema.purchaseOrders).set({
      date: str(f, "date") || today(),
      supplierId,
      paid: num(f, "paid"),
      note: str(f, "note"),
    }).where(eq(schema.purchaseOrders.id, id));
    await tx.delete(schema.purchaseLines).where(eq(schema.purchaseLines.poId, id));
    await tx.insert(schema.purchaseLines).values(lines.map((l) => ({ poId: id, itemId: l.itemId, qty: l.qty, unitCost: l.price })));
  });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}?ok=Purchase+order+updated`);
}

export async function payPurchase(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), amount = num(f, "amount");
  if (amount > 0) await db.update(schema.purchaseOrders).set({ paid: sql`${schema.purchaseOrders.paid} + ${amount}` }).where(eq(schema.purchaseOrders.id, id));
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}`);
}

export async function deletePurchase(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  await db.transaction(async (tx) => {
    await tx.delete(schema.purchaseLines).where(eq(schema.purchaseLines.poId, id));
    await tx.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  });
  revalidatePath("/purchases");
  redirect("/purchases");
}
