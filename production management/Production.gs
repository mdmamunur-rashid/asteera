/**
 * ============================================================
 *  MODULE 2 — PRODUCTION LOG ENGINE
 *
 *  PRINTING auto-fields (per the agreed spec):
 *   Order Date    -> today, if blank
 *   Item Name     -> from the previous row with the same SKU
 *   Fabric Name   -> from the previous row with the same SKU
 *   Fabric/Unit   -> SKU Fabric Need col B (match SKU)
 *   Total Fabric  -> Qty to Print x Fabric/Unit
 *   Work Type     -> "Print"
 *   Work Status   -> "Processing" (default, if blank)
 *   Print Payment -> Total Fabric x print rate (SKU Fabric Need col E,
 *                    else global default 35/goj)
 *   Supplier Name -> matched from Supplier ID
 *   Received Date -> today, when Work Status becomes complete ("Done")
 *
 *  SEWING mirrors the analogous auto-fields (Work Type "Sewing",
 *  Sewn Unit Cost = Selai cost col D, Sewn Total Cost = qty x unit).
 *
 *  Manual keys (SKU, Qty, Received QTY, supplier id, payments) and any
 *  value already present are never overwritten.
 * ============================================================
 */

function buildProductionContext() {
  return {
    skuMap:    getSkuFabricMap(),
    rates:     getGlobalRates(),
    suppliers: getSupplierMaps(),
    today:     new Date()
  };
}

/**
 * Compute derived fields for one row (mutates row).
 * skuHistory maps SKU -> {itemName, fabricName} from earlier rows and
 * is updated in place so later rows can index off it.
 */
function processProductionRow(row, ctx, skuHistory) {
  // ---------------- PRINTING ----------------
  const pSku = String(row[COL_PRINT.SKU - 1]).trim();
  if (pSku) {
    if (!row[COL_PRINT.ORDER_DATE - 1])  row[COL_PRINT.ORDER_DATE - 1] = ctx.today;
    if (!row[COL_PRINT.WORK_TYPE - 1])   row[COL_PRINT.WORK_TYPE - 1] = "Print";
    if (!row[COL_PRINT.WORK_STATUS - 1]) row[COL_PRINT.WORK_STATUS - 1] = "Processing";

    // Item Name & Fabric Name indexed from previous row with same SKU
    const hist = skuHistory[pSku] || {};
    if (!row[COL_PRINT.ITEM_NAME - 1] && hist.itemName)     row[COL_PRINT.ITEM_NAME - 1] = hist.itemName;
    if (!row[COL_PRINT.FABRIC_NAME - 1] && hist.fabricName) row[COL_PRINT.FABRIC_NAME - 1] = hist.fabricName;

    // Fabric per Unit from SKU Fabric Need (col B)
    const ref = ctx.skuMap[pSku];
    if (ref && !row[COL_PRINT.FABRIC_PER_UNIT - 1]) row[COL_PRINT.FABRIC_PER_UNIT - 1] = ref.fabricPerUnit;

    // Total Fabric = qty x fabric/unit
    const qty = toNum(row[COL_PRINT.QTY - 1]);
    const fpu = toNum(row[COL_PRINT.FABRIC_PER_UNIT - 1]);
    const totalFabric = qty * fpu;
    row[COL_PRINT.TOTAL_FABRIC - 1] = totalFabric || "";

    // Print Payment = Total Fabric x print rate
    const printRate = (ref && ref.printRate) ? ref.printRate : ctx.rates.print;
    row[COL_PRINT.PRINT_PAYMENT - 1] = totalFabric ? Math.round(totalFabric * printRate) : "";

    resolveSupplier(row, COL_PRINT.SUPPLIER_ID, COL_PRINT.SUPPLIER_NAME,
                    ctx.suppliers.byId, ctx.suppliers.byName);

    if (isStageComplete(row[COL_PRINT.WORK_STATUS - 1]) && !row[COL_PRINT.RECEIVED_DATE - 1]) {
      row[COL_PRINT.RECEIVED_DATE - 1] = ctx.today;
    }

    // Seed history for later rows
    const itemNow = String(row[COL_PRINT.ITEM_NAME - 1] || "").trim();
    const fabNow  = String(row[COL_PRINT.FABRIC_NAME - 1] || "").trim();
    if (itemNow || fabNow) {
      skuHistory[pSku] = {
        itemName:   itemNow || hist.itemName || "",
        fabricName: fabNow  || hist.fabricName || ""
      };
    }
  }

  // ---------------- SEWING ----------------
  const sSku = String(row[COL_SEW.SKU - 1]).trim();
  if (sSku) {
    if (!row[COL_SEW.ORDER_DATE - 1])  row[COL_SEW.ORDER_DATE - 1] = ctx.today;
    if (!row[COL_SEW.WORK_TYPE - 1])   row[COL_SEW.WORK_TYPE - 1] = "Sewing";
    if (!row[COL_SEW.WORK_STATUS - 1]) row[COL_SEW.WORK_STATUS - 1] = "Processing";

    const ref = ctx.skuMap[sSku];
    const unit = (ref && ref.selaiCost) ? ref.selaiCost : ctx.rates.selai;
    if (!row[COL_SEW.UNIT_COST - 1]) row[COL_SEW.UNIT_COST - 1] = unit;

    const qty = toNum(row[COL_SEW.QTY - 1]);
    const uc  = toNum(row[COL_SEW.UNIT_COST - 1]);
    row[COL_SEW.TOTAL_COST - 1] = (qty && uc) ? qty * uc : "";

    resolveSupplier(row, COL_SEW.SUPPLIER_ID, COL_SEW.SUPPLIER_NAME,
                    ctx.suppliers.byId, ctx.suppliers.byName);

    if (isStageComplete(row[COL_SEW.WORK_STATUS - 1]) && !row[COL_SEW.RECEIVED_DATE - 1]) {
      row[COL_SEW.RECEIVED_DATE - 1] = ctx.today;
    }
  }

  return row;
}

/** Recalculate the entire Production Log (history accumulates top-down). */
function recalcProduction() {
  const sh = getSheet(SHEETS.PRODUCTION);
  const def = SHEETS.PRODUCTION;
  const lastRow = sh.getLastRow();
  if (lastRow < def.data) return;

  const numRows = lastRow - def.data + 1;
  const range = sh.getRange(def.data, 1, numRows, 30);
  const vals = range.getValues();
  const ctx = buildProductionContext();
  const skuHistory = {};

  vals.forEach(row => processProductionRow(row, ctx, skuHistory));
  range.setValues(vals);
}

/** Recalculate a single row (onEdit). Builds SKU history from rows above. */
function recalcProductionRow(rowNum) {
  const sh = getSheet(SHEETS.PRODUCTION);
  const def = SHEETS.PRODUCTION;

  const skuHistory = {};
  if (rowNum > def.data) {
    const above = sh.getRange(def.data, 1, rowNum - def.data, 30).getValues();
    above.forEach(r => {
      const sku = String(r[COL_PRINT.SKU - 1]).trim();
      if (!sku) return;
      const item = String(r[COL_PRINT.ITEM_NAME - 1] || "").trim();
      const fab  = String(r[COL_PRINT.FABRIC_NAME - 1] || "").trim();
      if (item || fab) skuHistory[sku] = { itemName: item, fabricName: fab };
    });
  }

  const range = sh.getRange(rowNum, 1, 1, 30);
  const row = range.getValues()[0];
  processProductionRow(row, buildProductionContext(), skuHistory);
  range.setValues([row]);
}
