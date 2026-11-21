"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/util";

export async function updateProfile(f: FormData) {
  const s = await requireSession();
  const name = str(f, "name"), photoUrl = str(f, "photoUrl");
  if (!name) redirect("/profile?error=Name+is+required");
  await db.update(schema.users).set({ name, photoUrl }).where(eq(schema.users.id, s.uid));
  revalidatePath("/profile");
  redirect("/profile?ok=Profile+updated");
}

export async function changePassword(f: FormData) {
  const s = await requireSession();
  const oldPass = String(f.get("oldPassword") ?? "");
  const newPass = String(f.get("newPassword") ?? "");
  const confPass = String(f.get("confirmPassword") ?? "");

  if (newPass.length < 8) redirect("/profile?error=New+password+must+be+at+least+8+characters");
  if (newPass !== confPass) redirect("/profile?error=New+passwords+do+not+match");

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.uid)).limit(1);
  if (!u || !(await bcrypt.compare(oldPass, u.passwordHash))) {
    redirect("/profile?error=Current+password+is+incorrect");
  }
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPass, 12) }).where(eq(schema.users.id, s.uid));
  redirect("/profile?ok=Password+changed");
}
