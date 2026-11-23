"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { num, str, today } from "@/lib/util";

export async function createCampaign(f: FormData) {
  await requireSession();
  const name = str(f, "name");
  if (!name) redirect("/campaigns?error=Campaign+name+required");
  await db.insert(schema.campaigns).values({
    date: str(f, "date") || today(),
    name,
    brand: str(f, "brand"),
    spend: num(f, "spend"),
    ordersCount: Math.round(num(f, "ordersCount")),
    revenue: num(f, "revenue"),
    notes: str(f, "notes"),
  });
  revalidatePath("/campaigns");
  redirect("/campaigns?ok=Campaign+saved");
}

export async function deleteCampaign(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  if (id > 0) await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
  revalidatePath("/campaigns");
  redirect("/campaigns");
}
