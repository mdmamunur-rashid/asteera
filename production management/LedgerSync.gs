/**
 * ============================================================
 *  MODULE 4 — PRODUCTION → PAYMENT LEDGER SYNC
 *
 *  When a stage is "Completed", upsert a Payment Ledger row:
 *    PRINTING complete -> owes PRINTING supplier (Print Payment)
 *    SEWING   complete -> owes SEWING supplier (Sewn Total Cost)
 *
 *  Idempotent: keyed by Invoice # = "PRD-P-<row>" / "PRD-S-<row>".
 *  Re-running UPDATES the matching row (preserving Amount Paid)
 *  rather than creating duplicates. Manual ledger rows (other
 *  Invoice #s) are never touched.
 *
 *  Caveat: keys use the sheet row number, so the Production Log
 *  should be append-only. Inserting/deleting rows mid-sheet can
 *  shift keys. Orphaned rows (stage reverted from Completed) are
 *  left in place to protect payment history.
 * ============================================================
 */

function syncProductionToLedger() {
  const prodSh = getSheet(SHEETS.PRODUCTION);
  const pdef = SHEETS.PRODUCTION;
  const lastRow = prodSh.getLastRow();
  if (lastRow < pdef.data) return;
  const prodVals = prodSh.getRange(pdef.data, 1, lastRow - pdef.data + 1, 30).getValues();

  const ledSh = getSheet(SHEETS.PAYMENT_LEDGER);
  const ldef = SHEETS.PAYMENT_LEDGER;
  const ledLast = ledSh.getLastRow();
  const ledVals = ledLast >= ldef.data
    ? ledSh.getRange(ldef.data, 1, ledLast - ldef.data + 1, 13).getValues()
    : [];

  const keyToIdx = {};
  ledVals.forEach((r, i) => {
    const k = String(r[COL_LEDGER.INVOICE - 1]).trim();
    if (k) keyToIdx[k] = i;
  });

  const { byId } = getSupplierMaps();
  const skuMap = getSkuFabricMap();
  const today = new Date();
  const appends = [];

  function upsert(key, sku, product, supId, dateVal, unit, qty, due) {
    const sup = byId[supId] || { name: "" };

    if (key in keyToIdx) {
      const i = keyToIdx[key];
      if (i < 0) return;                       // already queued this pass
      const r = ledVals[i];
      const paid = toNum(r[COL_LEDGER.AMOUNT_PAID - 1]);
      r[COL_LEDGER.SKU - 1] = sku;
      if (product) r[COL_LEDGER.PRODUCT_NAME - 1] = product;
      r[COL_LEDGER.SUPPLIER_ID - 1] = supId;
      r[COL_LEDGER.SUPPLIER_NAME - 1] = sup.name;
      r[COL_LEDGER.UNIT_COST - 1] = unit;
      r[COL_LEDGER.QTY - 1] = qty;
      r[COL_LEDGER.TOTAL_DUE - 1] = due;
      r[COL_LEDGER.BALANCE - 1] = due - paid;
      r[COL_LEDGER.PAYMENT_STATUS - 1] =
        paid <= 0 ? CONFIG.PAYMENT.UNPAID
                  : (due - paid <= 0 ? CONFIG.PAYMENT.PAID : CONFIG.PAYMENT.PARTIAL);
    } else {
      const r = new Array(13).fill("");
      r[COL_LEDGER.INVOICE - 1] = key;
      r[COL_LEDGER.SKU - 1] = sku;
      r[COL_LEDGER.PRODUCT_NAME - 1] = product;
      r[COL_LEDGER.SUPPLIER_ID - 1] = supId;
      r[COL_LEDGER.SUPPLIER_NAME - 1] = sup.name;
      r[COL_LEDGER.INVOICE_DATE - 1] = dateVal || today;
      r[COL_LEDGER.UNIT_COST - 1] = unit;
      r[COL_LEDGER.QTY - 1] = qty;
      r[COL_LEDGER.TOTAL_DUE - 1] = due;
      r[COL_LEDGER.AMOUNT_PAID - 1] = 0;
      r[COL_LEDGER.BALANCE - 1] = due;
      r[COL_LEDGER.PAYMENT_STATUS - 1] = CONFIG.PAYMENT.UNPAID;
      appends.push(r);
      keyToIdx[key] = -1;                       // guard duplicate in same pass
    }
  }

  prodVals.forEach((row, idx) => {
    const sheetRow = pdef.data + idx;

    // PRINTING completed -> bill printing supplier
    if (isStageComplete(row[COL_PRINT.WORK_STATUS - 1])) {
      const sku   = String(row[COL_PRINT.SKU - 1]).trim();
      const supId = String(row[COL_PRINT.SUPPLIER_ID - 1]).trim();
      const due   = toNum(row[COL_PRINT.PRINT_PAYMENT - 1]);
      const qty   = toNum(row[COL_PRINT.QTY - 1]);
      if (sku && supId && due > 0) {
        const unit = qty ? +(due / qty).toFixed(2) : due;
        const product = String(row[COL_PRINT.ITEM_NAME - 1] || "")
                        || (skuMap[sku] ? skuMap[sku].productName : "");
        upsert("PRD-P-" + sheetRow, sku, product, supId,
               row[COL_PRINT.ORDER_DATE - 1], unit, qty, due);
      }
    }

    // SEWING completed -> bill sewing supplier
    if (isStageComplete(row[COL_SEW.WORK_STATUS - 1])) {
      const sku   = String(row[COL_SEW.SKU - 1]).trim();
      const supId = String(row[COL_SEW.SUPPLIER_ID - 1]).trim();
      const due   = toNum(row[COL_SEW.TOTAL_COST - 1]);
      const qty   = toNum(row[COL_SEW.QTY - 1]);
      if (sku && supId && due > 0) {
        const unit = toNum(row[COL_SEW.UNIT_COST - 1]) || (qty ? +(due / qty).toFixed(2) : due);
        const product = skuMap[sku] ? skuMap[sku].productName : "";
        upsert("PRD-S-" + sheetRow, sku, product, supId,
               row[COL_SEW.ORDER_DATE - 1], unit, qty, due);
      }
    }
  });

  // Bulk write updates to existing rows
  if (ledVals.length) {
    ledSh.getRange(ldef.data, 1, ledVals.length, 13).setValues(ledVals);
  }
  // Append new rows
  if (appends.length) {
    ledSh.getRange(ledSh.getLastRow() + 1, 1, appends.length, 13).setValues(appends);
  }
}
