"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/util";

export async function createSupplier(f: FormData) {
  await requireSession();
  const code = str(f, "code"), name = str(f, "name");
  if (!code || !name) redirect("/suppliers?error=Code+and+name+required");
  try {
    await db.insert(schema.suppliers).values({
      code, name, type: str(f, "type") || "Other", address: str(f, "address"), phone: str(f, "phone"),
    });
  } catch {
    redirect("/suppliers?error=Supplier+code+already+exists");
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
