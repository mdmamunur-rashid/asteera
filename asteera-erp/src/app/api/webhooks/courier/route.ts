import { NextResponse, type NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettingsMap } from "@/lib/settings";

const PATHAO_STATUS_MAP: Record<string, string> = {
  "order.created": "In Courier",
  "order.picked": "In Courier",
  "order.in-transit": "In Courier",
  "order.delivered": "Delivered",
  "order.partial-delivery": "Delivered",
  "order.cancelled": "Cancelled",
  "order.on-hold": "Hold",
  "order.returned": "Returned",
  delivered: "Delivered",
  partial_delivered: "Delivered",
  cancelled: "Cancelled",
  hold: "Hold",
  returned: "Returned",
};

const STEADFAST_STATUS_MAP: Record<string, string> = {
  delivered: "Delivered",
  partial_delivered: "Delivered",
  cancelled: "Cancelled",
  hold: "Hold",
  in_review: "In Courier",
  pending: "In Courier",
};

export async function POST(req: NextRequest) {
  const s = await getSettingsMap();
  const secret = s.pathao_webhook_secret || process.env.PATHAO_WEBHOOK_SECRET || "";
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const consignmentId = String(body.consignment_id ?? "");
  const merchantOrderId = String(body.merchant_order_id ?? body.invoice ?? "");
  const event = String(body.event ?? "").toLowerCase();
  const sfStatus = String(body.status ?? "").toLowerCase();

  const nextStatus = event ? PATHAO_STATUS_MAP[event] : sfStatus ? STEADFAST_STATUS_MAP[sfStatus] : undefined;

  if (nextStatus && (consignmentId || merchantOrderId)) {
    const conds = [];
    if (consignmentId) conds.push(eq(schema.orders.trackingNo, consignmentId));
    if (merchantOrderId) conds.push(eq(schema.orders.invoiceNo, merchantOrderId));
    await db.update(schema.orders).set({ status: nextStatus }).where(conds.length === 2 ? or(conds[0], conds[1]) : conds[0]);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Pathao-Merchant-Webhook-Integration-Secret"] = secret;

  return NextResponse.json({ ok: true, updated: Boolean(nextStatus) }, { status: body.event ? 202 : 200, headers });
}
