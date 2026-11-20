"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { getStockMap } from "@/lib/queries";
import { num, str } from "@/lib/util";

const back = (msg: string) => redirect(`/inventory?error=${encodeURIComponent(msg)}`);

export async function createItem(f: FormData) {
  await requireSession();
  const sku = str(f, "sku"), name = str(f, "name");
  if (!sku || !name) back("SKU and name are required");
  try {
    await db.insert(schema.items).values({
      sku, name, size: str(f, "size"), type: str(f, "type"), category: str(f, "category"),
      purchasePrice: num(f, "purchasePrice"), salePrice: num(f, "salePrice"),
      reorderLevel: Math.round(num(f, "reorderLevel")) || 5,
    });
  } catch {
    back(`SKU '${sku}' already exists`);
  }
  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteItem(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const stock = (await getStockMap()).get(id);
  if (stock && (stock.purchased > 0 || stock.sold > 0)) back("Item has purchase/sales history and can't be deleted");
  await db.delete(schema.items).where(eq(schema.items.id, id));
  revalidatePath("/inventory");
  redirect("/inventory");
}
