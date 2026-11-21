"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canAccess, requireSession } from "@/lib/auth";
import { normalizeLogoUrl, setSetting } from "@/lib/settings";
import { syncFromGoogleSheets } from "@/lib/sheets-sync";
import { str } from "@/lib/util";

async function requireSettingsAccess() {
  const s = await requireSession();
  if (!canAccess(s, "settings")) redirect("/?error=Access+denied");
}

export async function saveBranding(f: FormData) {
  await requireSettingsAccess();
  const id = Number(f.get("id"));
  const name = str(f, "name"), address = str(f, "address"), logoUrl = normalizeLogoUrl(str(f, "logoUrl")), phone = str(f, "phone");
  if (!name) redirect("/settings?error=Brand+name+required");

  if (id > 0) {
    await db.update(schema.brandings).set({ name, address, logoUrl, phone }).where(eq(schema.brandings.id, id));
  } else {
    try {
      await db.insert(schema.brandings).values({ name, address, logoUrl, phone, isDefault: 0 });
    } catch {
      redirect("/settings?error=Brand+name+already+exists");
    }
  }
  revalidatePath("/", "layout");
  redirect("/settings?ok=Brand+saved");
}

export async function setDefaultBrand(f: FormData) {
  await requireSettingsAccess();
  const id = Number(f.get("id"));
  await db.update(schema.brandings).set({ isDefault: 0 });
  await db.update(schema.brandings).set({ isDefault: 1 }).where(eq(schema.brandings.id, id));
  revalidatePath("/", "layout");
  redirect("/settings?ok=Default+logo+and+brand+updated");
}

export async function deleteBranding(f: FormData) {
  await requireSettingsAccess();
  const id = Number(f.get("id"));
  await db.delete(schema.brandings).where(eq(schema.brandings.id, id));
  revalidatePath("/settings");
  redirect("/settings?ok=Brand+removed");
}

export async function saveSheetConfig(f: FormData) {
  await requireSettingsAccess();
  await setSetting("inv_sheet_id", str(f, "inv_sheet_id"));
  await setSetting("order_sheet_id", str(f, "order_sheet_id"));
  await setSetting("prod_sheet_id", str(f, "prod_sheet_id"));
  revalidatePath("/settings");
  redirect("/settings?ok=Sheet+IDs+saved");
}

export async function runSheetSync() {
  await requireSettingsAccess();
  const res = await syncFromGoogleSheets();
  revalidatePath("/", "layout");
  if (!res.ok) redirect(`/settings?error=${encodeURIComponent(res.message)}`);
  redirect(`/settings?ok=${encodeURIComponent(res.message)}`);
}

export async function makeStandalone() {
  await requireSettingsAccess();
  await setSetting("standalone_mode", "true");
  await setSetting("inv_sheet_id", "");
  await setSetting("order_sheet_id", "");
  await setSetting("prod_sheet_id", "");
  revalidatePath("/", "layout");
  redirect("/settings?ok=System+is+now+Standalone.+Google+Sheets+disconnected.");
}

export async function reconnectSheets() {
  await requireSettingsAccess();
  await setSetting("standalone_mode", "false");
  revalidatePath("/", "layout");
  redirect("/settings?ok=Sheet+sync+re-enabled.");
}

export async function saveIntegrations(f: FormData) {
  await requireSettingsAccess();
  const keys = [
    "steadfast_api_key", "steadfast_secret_key",
    "pathao_client_id", "pathao_client_secret", "pathao_username", "pathao_password",
    "pathao_base_url", "pathao_store_id", "pathao_webhook_secret",
    "sms_api_key", "sms_sender", "sms_enabled",
  ];
  for (const k of keys) {
    const val = str(f, k);
    if (val || k === "sms_enabled") await setSetting(k, val);
  }
  revalidatePath("/settings");
  redirect("/settings?ok=Courier+and+SMS+settings+saved");
}
