"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { num, STAGE_STATUSES, str, today } from "@/lib/util";

export async function createBatch(f: FormData) {
  await requireSession();
  const sku = str(f, "sku"), qty = num(f, "qty");
  if (!sku || qty <= 0) redirect("/production?error=SKU+and+quantity+required");
  const [item] = await db.select().from(schema.items).where(eq(schema.items.sku, sku)).limit(1);
  await db.insert(schema.productionBatches).values({
    date: str(f, "date") || today(), sku, itemName: item?.name ?? str(f, "itemName"),
    fabricId: Number(f.get("fabricId")) || null, qty, fabricPerUnit: num(f, "fabricPerUnit"),
    printSupplierId: Number(f.get("printSupplierId")) || null, printRate: num(f, "printRate"),
    sewSupplierId: Number(f.get("sewSupplierId")) || null, sewUnitCost: num(f, "sewUnitCost"),
  });
  revalidatePath("/production");
  redirect("/production");
}

/** Update one stage; on "Done" the supplier ledger entry is created/updated idempotently (amount paid preserved). */
export async function updateStage(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), stage = str(f, "stage"), status = str(f, "status");
  if (!STAGE_STATUSES.includes(status) || !["print", "sew"].includes(stage)) redirect("/production?error=Invalid+stage+update");

  const [b] = await db.select().from(schema.productionBatches).where(eq(schema.productionBatches.id, id)).limit(1);
  if (!b) redirect("/production?error=Batch+not+found");
  const received = num(f, "receivedQty") || b.qty;

  if (stage === "print") {
    await db.update(schema.productionBatches).set({
      printStatus: status, printReceivedQty: status === "Done" ? received : 0, printReceivedDate: status === "Done" ? today() : null,
    }).where(eq(schema.productionBatches.id, id));
    if (status === "Done" && b.printSupplierId) {
      const totalFabric = b.qty * b.fabricPerUnit, due = totalFabric * b.printRate;
      await upsertLedger(`PRD-P-${id}`, b.printSupplierId, b.sku, `Printing batch #${id}`, totalFabric, b.printRate, due);
    }
  } else {
    await db.update(schema.productionBatches).set({
      sewStatus: status, sewReceivedQty: status === "Done" ? received : 0, sewReceivedDate: status === "Done" ? today() : null,
    }).where(eq(schema.productionBatches.id, id));
    if (status === "Done" && b.sewSupplierId) {
      await upsertLedger(`PRD-S-${id}`, b.sewSupplierId, b.sku, `Sewing batch #${id}`, received, b.sewUnitCost, received * b.sewUnitCost);
    }
  }
  revalidatePath("/production");
  redirect("/production");
}

async function upsertLedger(ref: string, supplierId: number, sku: string, description: string, qty: number, unitCost: number, totalDue: number) {
  await db.insert(schema.ledgerEntries).values({ ref, date: today(), supplierId, sku, description, qty, unitCost, totalDue })
    .onDuplicateKeyUpdate({ set: { qty, unitCost, totalDue, supplierId } }); // amountPaid untouched
}

export async function createFabric(f: FormData) {
  await requireSession();
  const name = str(f, "name");
  if (!name) redirect("/fabrics?error=Fabric+name+required");
  try { await db.insert(schema.fabrics).values({ name, unit: str(f, "unit") || "goj" }); }
  catch { redirect("/fabrics?error=Fabric+already+exists"); }
  revalidatePath("/fabrics");
  redirect("/fabrics");
}

export async function buyFabric(f: FormData) {
  await requireSession();
  const fabricId = Number(f.get("fabricId")), qty = num(f, "qty");
  if (!fabricId || qty <= 0) redirect("/fabrics?error=Choose+fabric+and+quantity");
  await db.insert(schema.fabricPurchases).values({ date: str(f, "date") || today(), fabricId, qty, unitPrice: num(f, "unitPrice") });
  revalidatePath("/fabrics");
  redirect("/fabrics");
}

export async function payLedger(f: FormData) {
  await requireSession();
  const id = Number(f.get("id")), amount = num(f, "amount");
  const [e] = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.id, id)).limit(1);
  if (e && amount > 0) await db.update(schema.ledgerEntries).set({ amountPaid: Math.min(e.totalDue, e.amountPaid + amount) }).where(eq(schema.ledgerEntries.id, id));
  revalidatePath("/ledger");
  redirect("/ledger");
}
