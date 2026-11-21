import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getSettingsMap(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(schema.settings);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.k] = r.v;
    return map;
  } catch {
    return {};
  }
}

export async function setSetting(k: string, v: string) {
  await db.insert(schema.settings).values({ k, v }).onDuplicateKeyUpdate({ set: { v } });
}

export async function getBrandings() {
  try {
    return await db.select().from(schema.brandings).orderBy(desc(schema.brandings.isDefault), schema.brandings.id);
  } catch {
    return [];
  }
}

export async function getDefaultBrand() {
  const list = await getBrandings();
  return list.find((b) => b.isDefault === 1) ?? list[0] ?? {
    id: 0,
    name: process.env.BRAND_NAME ?? "Asteera",
    address: "",
    logoUrl: "",
    phone: "",
    isDefault: 1,
  };
}

export async function isStandaloneMode(): Promise<boolean> {
  const s = await getSettingsMap();
  return s.standalone_mode === "true";
}

export async function getBrandByName(name?: string | null) {
  if (!name) return getDefaultBrand();
  const [b] = await db.select().from(schema.brandings).where(eq(schema.brandings.name, name)).limit(1);
  return b ?? getDefaultBrand();
}
