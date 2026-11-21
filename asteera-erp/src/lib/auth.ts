import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "asteera_session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-only-secret-change-me");

export const ALL_MODULES = [
  "dashboard", "inventory", "suppliers", "purchases", "sales",
  "expenses", "production", "fabrics", "ledger", "users", "settings", "profile",
] as const;

export const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: [...ALL_MODULES],
  employee: ["dashboard", "inventory", "sales", "purchases", "profile"],
  moderator: ["dashboard", "sales", "expenses", "profile"],
  staff: ["dashboard", "inventory", "sales", "expenses", "profile"],
  user: ["dashboard", "expenses", "profile"],
};

export type Session = { uid: number; name: string; role: string; permissions: string[] };

export function resolvePermissions(role: string, rawJson?: string | null): string[] {
  if (rawJson) {
    try {
      const arr = JSON.parse(rawJson);
      if (Array.isArray(arr) && arr.length > 0) return arr.map(String);
    } catch { /* fall through */ }
  }
  return ROLE_DEFAULTS[role.toLowerCase()] ?? ROLE_DEFAULTS.staff;
}

export function canAccess(s: Session | null, mod: string): boolean {
  if (!s) return false;
  if (s.role.toLowerCase() === "admin") return true;
  return s.permissions.includes(mod);
}

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const role = String(payload.role ?? "staff");
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.map(String)
      : resolvePermissions(role, null);
    return { uid: Number(payload.uid), name: String(payload.name), role, permissions };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated");
  return s;
}

export const SESSION_COOKIE = COOKIE;
