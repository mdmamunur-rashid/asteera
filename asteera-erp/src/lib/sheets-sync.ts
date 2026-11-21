import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ALL_MODULES, resolvePermissions } from "./auth";
import { getSettingsMap, normalizeLogoUrl } from "./settings";

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
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Google Sheet "${sheetId}" is private (HTTP ${res.status}). Temporarily set Share -> "Anyone with the link can view", sync, then switch back to Restricted.`);
  }
  if (!res.ok) return [];
  const text = await res.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error(`Google Sheet "${sheetId}" requires sign-in. Temporarily set Share -> "Anyone with the link can view" to sync.`);
  }
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
  const prodId = s.prod_sheet_id || "";
  const counts: Record<string, number> = {
    users: 0, items: 0, suppliers: 0, brandings: 0, expenses: 0,
    purchases: 0, orders: 0, fabrics: 0, batches: 0, ledger: 0,
  };

  if (!invId && !ordId && !prodId) {
    return { ok: false, message: "No Google Spreadsheet IDs configured.", counts };
  }

  try {
    if (invId) {
    // 1. Brandings
    const bRows = await fetchSheetTab(invId, "Brandings");
    for (let i = 1; i < bRows.length; i++) {
      const [name, address, rawLogo, phone] = bRows[i];
      if (!name) continue;
      const logoUrl = normalizeLogoUrl(rawLogo);
      await db.insert(schema.brandings).values({ name, address: address || "", logoUrl, phone: phone || "" })
        .onDuplicateKeyUpdate({ set: { address: address || "", logoUrl, phone: phone || "" } });
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

    // 5. RoleManagement & Users: Email(0), Phone(1), Name(2), Photo(3), Role(4), Password(5), Status(6)
    const roleMap: Record<string, string[]> = {};
    const rmRows = await fetchSheetTab(invId, "RoleManagement");
    if (rmRows.length > 0) {
      const roleHeaders = rmRows[0].map((h) => h.trim().toLowerCase());
      for (const rh of roleHeaders) if (rh) roleMap[rh] = [];
      for (let i = 1; i < rmRows.length; i++) {
        for (let c = 0; c < roleHeaders.length; c++) {
          const rh = roleHeaders[c];
          let mod = (rmRows[i][c] || "").trim().toLowerCase();
          if (mod === "expences") mod = "expenses";
          if (mod === "orders") mod = "sales";
          if (rh && mod && (ALL_MODULES as readonly string[]).includes(mod) && !roleMap[rh].includes(mod)) {
            roleMap[rh].push(mod);
          }
        }
      }
    }

    const uRows = await fetchSheetTab(invId, "Users");
    for (let i = 1; i < uRows.length; i++) {
      const r = uRows[i];
      const email = (r[0] || "").trim() || null;
      const phone = (r[1] || "").trim() || null;
      const name = (r[2] || "").trim();
      const photoUrl = (r[3] || "").trim();
      const role = ((r[4] || "employee").trim().toLowerCase()) || "employee";
      const rawPass = String(r[5] || "Asteera123!");
      const status = (r[6] || "Active").trim() || "Active";
      if (!name || (!email && !phone)) continue;

      const perms = roleMap[role]?.length ? roleMap[role] : resolvePermissions(role, null);
      const [existing] = email
        ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1)
        : [];
      if (existing) {
        await db.update(schema.users).set({ name, photoUrl, role, status, permissions: JSON.stringify(perms) }).where(eq(schema.users.id, existing.id));
      } else {
        await db.insert(schema.users).values({
          name, email, phone, photoUrl, role, status,
          permissions: JSON.stringify(perms),
          passwordHash: await bcrypt.hash(rawPass, 10),
        });
      }
      counts.users++;
    }

    // 5b. PurchaseOrders & PurchaseDetails
    const poRows = await fetchSheetTab(invId, "PurchaseOrders");
    const pdRows = await fetchSheetTab(invId, "PurchaseDetails");
    if (poRows.length > 1 || pdRows.length > 1) {
      const allSups = await db.select().from(schema.suppliers);
      const supByCode = new Map(allSups.map((x) => [x.code.toLowerCase(), x.id]));
      const allItems = await db.select().from(schema.items);
      const itemBySku = new Map(allItems.map((x) => [x.sku.toLowerCase(), x.id]));

      const pdByPo = new Map<string, { itemId: number; qty: number; unitCost: number }[]>();
      for (let i = 1; i < pdRows.length; i++) {
        const r = pdRows[i];
        const poNo = (r[1] || "").trim();
        const itemId = itemBySku.get((r[4] || "").trim().toLowerCase());
        if (!poNo || !itemId) continue;
        if (!pdByPo.has(poNo)) pdByPo.set(poNo, []);
        pdByPo.get(poNo)!.push({ itemId, qty: numVal(r[7]) || 1, unitCost: numVal(r[8]) });
      }

      for (let i = 1; i < poRows.length; i++) {
        const r = poRows[i];
        const poNo = (r[1] || "").trim();
        if (!poNo) continue;
        const [exists] = await db.select({ id: schema.purchaseOrders.id }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.poNo, poNo)).limit(1);
        if (exists) continue;
        let supplierId = supByCode.get((r[2] || "").trim().toLowerCase());
        if (!supplierId && r[3]) {
          const code = (r[2] || r[3]).trim();
          const [insSup] = await db.insert(schema.suppliers).values({ code, name: r[3].trim() }).$returningId();
          supplierId = insSup.id;
          supByCode.set(code.toLowerCase(), supplierId);
        }
        if (!supplierId) continue;
        const [insPo] = await db.insert(schema.purchaseOrders).values({
          poNo, date: normDate(r[0]), supplierId, paid: numVal(r[5]),
        }).$returningId();
        const lines = pdByPo.get(poNo) ?? [];
        if (lines.length > 0) {
          await db.insert(schema.purchaseLines).values(lines.map((l) => ({ poId: insPo.id, ...l })));
        }
        counts.purchases++;
      }
    }
  }

  // 6. SalesDetails from Order Sheet
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

  // 7. Production Sheet (Fabrics, Fabric Purchases, Production Batches, Payment Ledger)
  if (prodId) {
    const fabricMap = new Map<string, number>();
    const existingFabrics = await db.select().from(schema.fabrics);
    for (const f of existingFabrics) fabricMap.set(f.name.toLowerCase(), f.id);

    const ensureFabric = async (name: string, unit = "goj"): Promise<number | null> => {
      const clean = name.trim();
      if (!clean) return null;
      const hit = fabricMap.get(clean.toLowerCase());
      if (hit) return hit;
      const [ins] = await db.insert(schema.fabrics).values({ name: clean, unit: unit || "goj" }).$returningId();
      fabricMap.set(clean.toLowerCase(), ins.id);
      counts.fabrics++;
      return ins.id;
    };

    const msRows = await fetchSheetTab(prodId, "Material Stock");
    for (let i = 1; i < msRows.length; i++) {
      const r = msRows[i];
      if (r[1] && r[1].toLowerCase() !== "fabric name") await ensureFabric(r[1], r[2] || "goj");
    }

    const fpRows = await fetchSheetTab(prodId, "Purchase");
    const hasFp = await db.select({ id: schema.fabricPurchases.id }).from(schema.fabricPurchases).limit(1);
    if (hasFp.length === 0) {
      for (let i = 1; i < fpRows.length; i++) {
        const r = fpRows[i];
        if (!r[1] || r[1].toLowerCase() === "fabric name") continue;
        const q = numVal(r[3]);
        if (q <= 0) continue;
        const fabricId = await ensureFabric(r[1], r[2] || "goj");
        if (fabricId) {
          await db.insert(schema.fabricPurchases).values({
            date: normDate(r[0]), fabricId, qty: q, unitPrice: numVal(r[4]),
          });
        }
      }
    }

    const allSups = await db.select().from(schema.suppliers);
    const supByCode = new Map(allSups.map((x) => [x.code.toLowerCase(), x.id]));
    const ensureSup = async (codeRaw: string, nameRaw: string, type: string): Promise<number | null> => {
      const code = (codeRaw || nameRaw).trim();
      const name = (nameRaw || codeRaw).trim();
      if (!code) return null;
      const hit = supByCode.get(code.toLowerCase());
      if (hit) return hit;
      const [ins] = await db.insert(schema.suppliers).values({ code, name, type }).$returningId();
      supByCode.set(code.toLowerCase(), ins.id);
      return ins.id;
    };

    const prodRows = await fetchSheetTab(prodId, "Production Log");
    const hasBatches = await db.select({ id: schema.productionBatches.id }).from(schema.productionBatches).limit(1);
    if (hasBatches.length === 0) {
      for (let i = 1; i < prodRows.length; i++) {
        const r = prodRows[i];
        const sku = (r[3] || r[17] || "").trim();
        if (!sku || sku.toLowerCase() === "sku") continue;
        const qty = numVal(r[4]) || numVal(r[18]);
        if (qty <= 0) continue;
        const fabricId = r[2] ? await ensureFabric(r[2]) : null;
        const printSupId = await ensureSup(r[13] || "", r[12] || "", "Printing");
        const sewSupId = await ensureSup(r[28] || "", r[27] || "", "Sewing");
        const fpu = numVal(r[5]);
        const printPay = numVal(r[11]);
        const printRate = fpu > 0 && qty > 0 && printPay > 0 ? printPay / (qty * fpu) : 35;

        await db.insert(schema.productionBatches).values({
          date: normDate(r[0] || r[16]),
          sku,
          itemName: (r[1] || "").trim(),
          fabricId,
          qty,
          fabricPerUnit: fpu,
          printSupplierId: printSupId,
          printRate,
          printStatus: (r[8] || "Not Started").trim(),
          printReceivedQty: numVal(r[9]),
          sewSupplierId: sewSupId,
          sewUnitCost: numVal(r[19]) || 100,
          sewStatus: (r[21] || "Not Started").trim(),
          sewReceivedQty: numVal(r[23]),
        });
        counts.batches++;
      }
    }

    const ledRows = await fetchSheetTab(prodId, "Payment Ledger");
    for (let i = 1; i < ledRows.length; i++) {
      const r = ledRows[i];
      const ref = (r[0] || "").trim();
      if (!ref || ref.toLowerCase() === "invoice" || ref.toLowerCase() === "invoice no") continue;
      const supplierId = await ensureSup(r[3] || "", r[4] || "", "Other");
      if (!supplierId) continue;
      await db.insert(schema.ledgerEntries).values({
        ref,
        date: normDate(r[5]),
        dueDate: r[6] ? normDate(r[6]) : null,
        supplierId,
        sku: (r[1] || "").trim(),
        description: (r[2] || "").trim(),
        qty: numVal(r[8]),
        unitCost: numVal(r[7]),
        totalDue: numVal(r[9]),
        amountPaid: numVal(r[10]),
      }).onDuplicateKeyUpdate({ set: { totalDue: numVal(r[9]), amountPaid: numVal(r[10]) } });
      counts.ledger++;
    }
  }

  return {
    ok: true,
    message: `Synced (Users: ${counts.users}, Items: ${counts.items}, Suppliers: ${counts.suppliers}, POs: ${counts.purchases}, Orders: ${counts.orders}, Fabrics: ${counts.fabrics}, Batches: ${counts.batches}, Ledger: ${counts.ledger}).`,
    counts,
  };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Sync failed", counts };
  }
}
