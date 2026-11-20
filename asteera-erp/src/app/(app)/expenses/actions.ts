"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { num, str, today } from "@/lib/util";

export async function createExpense(f: FormData) {
  await requireSession();
  const category = str(f, "category"), amount = num(f, "amount");
  if (!category || amount <= 0) redirect("/expenses?error=Category+and+a+positive+amount+required");
  await db.insert(schema.expenses).values({
    date: str(f, "date") || today(), category, purpose: str(f, "purpose"), amount,
    paymentStatus: str(f, "paymentStatus") || "Paid", paidBy: str(f, "paidBy"), notes: str(f, "notes"),
  });
  revalidatePath("/expenses");
  redirect("/expenses");
}
