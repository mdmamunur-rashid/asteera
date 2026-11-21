import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBrandByName, getSettingsMap } from "./settings";

function normalizeBdPhone(raw: string): string {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("880")) digits = "0" + digits.slice(3);
  else if (digits.length === 10 && !digits.startsWith("0")) digits = "0" + digits;
  if (digits.length > 11) digits = digits.slice(-11);
  return digits;
}

export async function sendAsteeraSMS(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSettingsMap();
  if (s.sms_enabled === "false") return { ok: false, error: "SMS disabled" };
  const apiKey = s.sms_api_key || process.env.SMS_API_KEY || "";
  const sender = s.sms_sender || process.env.SMS_SENDER || "8809617171817";
  if (!apiKey || !phone || !message) return { ok: false, error: "SMS credentials or phone missing" };

  let msisdn = String(phone).replace(/[^\d]/g, "");
  if (!msisdn.startsWith("88")) msisdn = "88" + (msisdn.startsWith("0") ? msisdn : "0" + msisdn);

  const url = `https://api.automas.com.bd/smsapiv3?apikey=${encodeURIComponent(apiKey)}&sender=${encodeURIComponent(sender)}&msisdn=${encodeURIComponent(msisdn)}&smstext=${encodeURIComponent(message)}`;
  try {
    const res = await fetch(url);
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMS fetch failed" };
  }
}

export async function dispatchSteadfast(orderId: number): Promise<{ ok: boolean; message: string }> {
  const s = await getSettingsMap();
  const apiKey = s.steadfast_api_key || process.env.STEADFAST_API_KEY || "";
  const secretKey = s.steadfast_secret_key || process.env.STEADFAST_SECRET_KEY || "";
  if (!apiKey || !secretKey) return { ok: false, message: "Steadfast API credentials not configured in Settings." };

  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!o) return { ok: false, message: "Order not found." };

  const phone = normalizeBdPhone(o.phone);
  const cod = Math.max(0, Math.round(o.total - o.paid));
  const payload = {
    invoice: o.invoiceNo,
    recipient_name: o.customerName,
    recipient_phone: phone,
    recipient_address: o.address || "Dhaka",
    cod_amount: cod,
    note: o.note || "",
  };

  try {
    const res = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": apiKey, "Secret-Key": secretKey },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { status?: number; consignment?: { consignment_id?: string | number }; message?: string };
    if (res.ok && json?.status === 200 && json?.consignment?.consignment_id) {
      const trackingNo = String(json.consignment.consignment_id);
      await db.update(schema.orders).set({
        status: "In Courier",
        courier: "Steadfast",
        trackingNo,
        paymentMode: cod > 0 ? "COD" : "Paid",
      }).where(eq(schema.orders.id, orderId));

      const brand = await getBrandByName(o.pageName);
      await sendAsteeraSMS(
        phone,
        `Dear ${o.customerName.toUpperCase()}!\nYour order has been shipped via Steadfast courier.\nTracking: ${trackingNo}\nAmount: ${cod}\nCall Center: ${brand.phone}\nThanks\n${brand.name}`,
      );
      return { ok: true, message: `Steadfast consignment created: ${trackingNo}` };
    }
    return { ok: false, message: json?.message || `Steadfast error (${res.status})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Steadfast request failed" };
  }
}

export async function dispatchPathao(orderId: number): Promise<{ ok: boolean; message: string }> {
  const s = await getSettingsMap();
  const baseUrl = (s.pathao_base_url || "https://api-hermes.pathao.com").replace(/\/+$/, "");
  const clientId = s.pathao_client_id || process.env.PATHAO_CLIENT_ID || "";
  const clientSecret = s.pathao_client_secret || process.env.PATHAO_CLIENT_SECRET || "";
  const username = s.pathao_username || process.env.PATHAO_USERNAME || "";
  const password = s.pathao_password || process.env.PATHAO_PASSWORD || "";
  const storeId = Number(s.pathao_store_id || process.env.PATHAO_STORE_ID || 0);

  if (!clientId || !clientSecret || !username || !password || !storeId) {
    return { ok: false, message: "Pathao credentials or Store ID missing in Settings." };
  }

  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!o) return { ok: false, message: "Order not found." };

  const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId));
  const totalQty = Math.max(1, Math.round(lines.reduce((sum, l) => sum + l.qty, 0)));
  const phone = normalizeBdPhone(o.phone);
  const cod = Math.max(0, Math.round(o.total - o.paid));

  try {
    const tokenRes = await fetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, username, password, grant_type: "password" }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; message?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return { ok: false, message: tokenJson?.message || "Failed to obtain Pathao token" };
    }

    const orderRes = await fetch(`${baseUrl}/aladdin/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenJson.access_token}` },
      body: JSON.stringify({
        store_id: storeId,
        merchant_order_id: o.invoiceNo,
        recipient_name: o.customerName,
        recipient_phone: phone,
        recipient_address: o.address || "Dhaka",
        delivery_type: 48,
        item_type: 2,
        item_quantity: totalQty,
        item_weight: 0.5,
        amount_to_collect: cod,
        special_instruction: o.note || "",
      }),
    });
    const orderJson = (await orderRes.json()) as { data?: { consignment_id?: string }; message?: string };
    if (orderRes.ok && orderJson?.data?.consignment_id) {
      const trackingNo = String(orderJson.data.consignment_id);
      await db.update(schema.orders).set({
        status: "In Courier",
        courier: "Pathao",
        trackingNo,
        paymentMode: cod > 0 ? "COD" : "Paid",
      }).where(eq(schema.orders.id, orderId));

      const brand = await getBrandByName(o.pageName);
      await sendAsteeraSMS(
        phone,
        `Dear ${o.customerName.toUpperCase()}!\nYour order has been shipped via Pathao courier.\nTracking: ${trackingNo}\nAmount: ${cod}\nCall Center: ${brand.phone}\nThanks\n${brand.name}`,
      );
      return { ok: true, message: `Pathao consignment created: ${trackingNo}` };
    }
    return { ok: false, message: orderJson?.message || `Pathao order error (${orderRes.status})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Pathao request failed" };
  }
}
