import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettingsMap } from "./settings";

/** Minimal RFC-4180 CSV parser handling quoted fields and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell.trim()); cell = ""; }
      else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; i++; }
      else if (ch === "\n" || ch === "\r") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

async function fetchSheetTab(sheetId: string, tabName: string): Promise<string[][]> {
  if (!sheetId) return [];
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  if (text.trim().startsWith("<!DOCTYPE")) return [];
  return parseCsv(text);
}

function normDate(raw: string): string {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

const numVal = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export type SyncResult = { ok: boolean; message: string; counts: Record<string, number> };

export async function syncFromGoogleSheets(): Promise<SyncResult> {
  const s = await getSettingsMap();
  if (s.standalone_mode === "true") {
    return { ok: false, message: "System is in Standalone Mode. Google Sheets sync is disconnected.", counts: {} };
  }

  const invId = s.inv_sheet_id || "";
  const ordId = s.order_sheet_id || "";
  const counts: Record<string, number> = { items: 0, suppliers: 0, brandings: 0, expenses: 0, orders: 0 };

  if (!invId && !ordId) {
    return { ok: false, message: "No Google Spreadsheet IDs configured.", counts };
  }

  // 1. Brandings
  if (invId) {
    const bRows = await fetchSheetTab(invId, "Brandings");
    for (let i = 1; i < bRows.length; i++) {
      const [name, address, logoUrl, phone] = bRows[i];
      if (!name) continue;
      await db.insert(schema.brandings).values({ name, address: address || "", logoUrl: logoUrl || "", phone: phone || "" })
        .onDuplicateKeyUpdate({ set: { address: address || "", logoUrl: logoUrl || "", phone: phone || "" } });
      counts.brandings++;
    }

    // 2. InventoryItems: SKU(0), Item Size(1), Item Name(2), P.Price(3), S.Price(4), ..., Image(9)
    const iRows = await fetchSheetTab(invId, "InventoryItems");
    for (let i = 1; i < iRows.length; i++) {
      const r = iRows[i];
      const sku = r[0];
      if (!sku) continue;
      await db.insert(schema.items).values({
        sku, size: r[1] || "", name: r[2] || sku,
        purchasePrice: numVal(r[3]), salePrice: numVal(r[4]), imageUrl: r[9] || "",
      }).onDuplicateKeyUpdate({
        set: { size: r[1] || "", name: r[2] || sku, purchasePrice: numVal(r[3]), salePrice: numVal(r[4]), imageUrl: r[9] || "" },
      });
      counts.items++;
    }

    // 3. Supliers: RegDate(0), ID(1), Name(2), Address(3), Phone(4)
    const sRows = await fetchSheetTab(invId, "Supliers");
    for (let i = 1; i < sRows.length; i++) {
      const r = sRows[i];
      const code = r[1], name = r[2];
      if (!code || !name) continue;
      await db.insert(schema.suppliers).values({ code, name, address: r[3] || "", phone: r[4] || "" })
        .onDuplicateKeyUpdate({ set: { name, address: r[3] || "", phone: r[4] || "" } });
      counts.suppliers++;
    }

    // 4. Expenses: Sl(0), Date(1), Category(2), For(3), Amount(4), Note(5), CreatedBy(6), Status(7)
    const eRows = await fetchSheetTab(invId, "Expenses");
    const existingExp = await db.select({ c: schema.expenses.id }).from(schema.expenses).limit(1);
    if (existingExp.length === 0) {
      for (let i = 1; i < eRows.length; i++) {
        const r = eRows[i];
        if (!r[2] || numVal(r[4]) <= 0) continue;
        await db.insert(schema.expenses).values({
          date: normDate(r[1]), category: r[2], purpose: r[3] || "", amount: numVal(r[4]),
          notes: r[5] || "", paidBy: r[6] || "", paymentStatus: r[7] || "Paid",
        });
        counts.expenses++;
      }
    }
  }

  // 5. SalesDetails from Order Sheet
  if (ordId) {
    const sdRows = await fetchSheetTab(ordId, "SalesDetails");
    const allItems = await db.select().from(schema.items);
    const skuMap = new Map(allItems.map((it) => [it.sku.toLowerCase(), it]));
    const grouped = new Map<string, { date: string; name: string; phone: string; address: string; delivery: number; discount: number; note: string; lines: { itemId: number; qty: number; price: number }[]; total: number }>();

    for (let i = 1; i < sdRows.length; i++) {
      const r = sdRows[i];
      const invNo = r[1];
      if (!invNo) continue;
      if (!grouped.has(invNo)) {
        grouped.set(invNo, {
          date: normDate(r[0]), name: r[2] || "Customer", phone: r[3] || "", address: r[4] || "",
          delivery: numVal(r[10]), discount: numVal(r[11]), note: r[14] || "", lines: [], total: 0,
        });
      }
      const g = grouped.get(invNo)!;
      const item = skuMap.get((r[5] || "").toLowerCase());
      if (item) {
        g.lines.push({ itemId: item.id, qty: numVal(r[8]) || 1, price: numVal(r[9]) || item.salePrice });
      }
      g.total += numVal(r[13]) || numVal(r[12]);
    }

    for (const [invoiceNo, g] of grouped) {
      const [exists] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.invoiceNo, invoiceNo)).limit(1);
      if (exists) continue;
      const [ins] = await db.insert(schema.orders).values({
        invoiceNo, date: g.date, customerName: g.name, phone: g.phone, address: g.address,
        status: "Billed", deliveryCharge: g.delivery, discount: g.discount, total: g.total, note: g.note,
      }).$returningId();
      if (g.lines.length > 0) {
        await db.insert(schema.orderLines).values(g.lines.map((l) => ({ orderId: ins.id, ...l })));
      }
      counts.orders++;
    }
  }

  return {
    ok: true,
    message: `Synced from Google Sheets (Items: ${counts.items}, Suppliers: ${counts.suppliers}, Brands: ${counts.brandings}, Expenses: ${counts.expenses}, Orders: ${counts.orders}). Note: spreadsheets must be shared as "Anyone with the link can view" for CSV sync.`,
    counts,
  };
}
