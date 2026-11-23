"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { num, str, today } from "@/lib/util";

export async function createExpense(f: FormData) {
  await requireSession();
  const category = str(f, "category"), amount = num(f, "amount");
  if (!category || amount <= 0) redirect("/expenses?error=Category+and+a+positive+amount+required");
  const date = str(f, "date") || today();
  await db.insert(schema.expenses).values({
    date,
    category,
    purpose: str(f, "purpose"),
    amount,
    paymentStatus: str(f, "paymentStatus") || "Paid",
    paidBy: str(f, "paidBy"),
    notes: str(f, "notes"),
  });
  revalidatePath("/expenses");
  redirect(`/expenses?month=${encodeURIComponent(date.slice(0, 7))}`);
}

export async function toggleExpenseStatus(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  const next = str(f, "nextStatus") === "Unpaid" ? "Unpaid" : "Paid";
  if (id > 0) {
    await db.update(schema.expenses).set({ paymentStatus: next }).where(eq(schema.expenses.id, id));
  }
  revalidatePath("/expenses");
}

export async function deleteExpense(f: FormData) {
  await requireSession();
  const id = Number(f.get("id"));
  if (id > 0) {
    await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
  }
  revalidatePath("/expenses");
}
