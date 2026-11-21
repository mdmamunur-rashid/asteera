"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ALL_MODULES, canAccess, requireSession, resolvePermissions } from "@/lib/auth";
import { str } from "@/lib/util";

async function requireAdmin() {
  const s = await requireSession();
  if (!canAccess(s, "users")) redirect("/?error=Access+denied");
  return s;
}

export async function createUser(f: FormData) {
  await requireAdmin();
  const name = str(f, "name"), email = str(f, "email") || null, phone = str(f, "phone") || null;
  const password = String(f.get("password") ?? "");
  const role = str(f, "role") || "employee";
  if (!name || (!email && !phone) || password.length < 8) {
    redirect("/users?error=Name,+email+or+phone,+and+8%2B+char+password+required");
  }
  const perms = f.getAll("perms").map(String).filter((p) => (ALL_MODULES as readonly string[]).includes(p));
  const finalPerms = perms.length > 0 ? perms : resolvePermissions(role, null);

  try {
    await db.insert(schema.users).values({
      name, email, phone, role,
      status: "Active",
      permissions: JSON.stringify(finalPerms),
      passwordHash: await bcrypt.hash(password, 12),
    });
  } catch {
    redirect("/users?error=Email+or+phone+already+exists");
  }
  revalidatePath("/users");
  redirect("/users?ok=User+created");
}

export async function updateUserAccess(f: FormData) {
  const s = await requireAdmin();
  const id = Number(f.get("id"));
  const role = str(f, "role") || "employee";
  const status = str(f, "status") === "Inactive" ? "Inactive" : "Active";
  const perms = f.getAll("perms").map(String).filter((p) => (ALL_MODULES as readonly string[]).includes(p));

  if (id === s.uid && status === "Inactive") redirect("/users?error=Cannot+deactivate+yourself");

  await db.update(schema.users).set({
    role,
    status,
    permissions: JSON.stringify(perms.length > 0 ? perms : resolvePermissions(role, null)),
  }).where(eq(schema.users.id, id));

  const newPass = String(f.get("newPassword") ?? "");
  if (newPass.length >= 8) {
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPass, 12) }).where(eq(schema.users.id, id));
  }
  revalidatePath("/users");
  redirect("/users?ok=User+updated");
}
