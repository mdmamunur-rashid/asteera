"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { ORDER_STATUSES, str } from "@/lib/util";

export async function saveSheetChanges(f: FormData) {
  await requireSession();
  const tab = str(f, "tab");
  const raw = str(f, "changes");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    redirect(`/sheet-edit?tab=${encodeURIComponent(tab)}&error=Invalid+payload`);
  }
  if (rows.length === 0) redirect(`/sheet-edit?tab=${encodeURIComponent(tab)}&ok=No+changes+to+save`);

  if (tab === "inventory") {
    await db.transaction(async (tx) => {
      for (const r of rows) {
        const id = Number(r.id);
        if (!id) continue;
        await tx.update(schema.items).set({
          sku: String(r.sku ?? "").trim(),
          name: String(r.name ?? "").trim(),
          size: String(r.size ?? "").trim(),
          type: String(r.type ?? "").trim(),
          category: String(r.category ?? "").trim(),
          purchasePrice: Number(r.purchasePrice) || 0,
          salePrice: Number(r.salePrice) || 0,
          reorderLevel: Math.round(Number(r.reorderLevel)) || 5,
        }).where(eq(schema.items.id, id));
      }
    });
    revalidatePath("/inventory");
  } else if (tab === "orders") {
    await db.transaction(async (tx) => {
      for (const r of rows) {
        const id = Number(r.id);
        if (!id) continue;
        const st = String(r.status ?? "Billed");
        await tx.update(schema.orders).set({
          date: String(r.date ?? "").slice(0, 10),
          customerName: String(r.customerName ?? "").trim(),
          phone: String(r.phone ?? "").trim(),
          address: String(r.address ?? "").trim(),
          pageName: String(r.pageName ?? "").trim(),
          status: ORDER_STATUSES.includes(st) ? st : "Billed",
          deliveryCharge: Number(r.deliveryCharge) || 0,
          discount: Number(r.discount) || 0,
          total: Number(r.total) || 0,
          paid: Number(r.paid) || 0,
          courier: String(r.courier ?? "").trim(),
          trackingNo: String(r.trackingNo ?? "").trim(),
          note: String(r.note ?? "").trim(),
        }).where(eq(schema.orders.id, id));
      }
    });
    revalidatePath("/sales");
  } else if (tab === "purchases") {
    await db.transaction(async (tx) => {
      for (const r of rows) {
        const id = Number(r.id);
        if (!id) continue;
        await tx.update(schema.purchaseOrders).set({
          date: String(r.date ?? "").slice(0, 10),
          poNo: String(r.poNo ?? "").trim(),
          supplierId: Number(r.supplierId) || 1,
          paid: Number(r.paid) || 0,
          note: String(r.note ?? "").trim(),
        }).where(eq(schema.purchaseOrders.id, id));
      }
    });
    revalidatePath("/purchases");
  }

  revalidatePath("/sheet-edit");
  redirect(`/sheet-edit?tab=${encodeURIComponent(tab)}&ok=${encodeURIComponent(`Saved ${rows.length} row(s)`)}`);
}
