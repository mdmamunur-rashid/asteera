"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession, resolvePermissions } from "@/lib/auth";
import { str } from "@/lib/util";

export async function login(formData: FormData) {
  const id = str(formData, "identifier");
  const password = String(formData.get("password") ?? "");
  if (!id || !password) redirect("/login?error=Fill+all+fields");

  const [u] = await db
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.email, id), eq(schema.users.phone, id)))
    .limit(1);

  if (!u || !(await bcrypt.compare(password, u.passwordHash))) redirect("/login?error=Invalid+credentials");
  if (u.status && u.status.toLowerCase() !== "active") redirect("/login?error=Account+is+inactive");

  await createSession({
    uid: u.id,
    name: u.name,
    role: u.role,
    permissions: resolvePermissions(u.role, u.permissions),
  });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
