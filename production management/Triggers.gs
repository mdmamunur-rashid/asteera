/**
 * ============================================================
 *  EDIT TRIGGER — recompute the relevant module live.
 *
 *  Works as a SIMPLE trigger (function literally named onEdit).
 *  Only uses SpreadsheetApp, so no extra authorization needed.
 *  For heavier actions later (email/SMS), convert to an
 *  installable trigger via Triggers > Add Trigger.
 * ============================================================
 */

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const gid = sh.getSheetId();
  const row = e.range.getRow();

  try {
    if (gid === SHEETS.PRODUCTION.gid && row >= SHEETS.PRODUCTION.data) {
      recalcProductionRow(row);   // fast single-row derive
      recalcMaterialStock();      // stock depends on production
      // If a Work Status cell changed, sync completed stages to the ledger
      const col = e.range.getColumn();
      if (col === COL_PRINT.WORK_STATUS || col === COL_SEW.WORK_STATUS) {
        syncProductionToLedger();
        refreshDashboard();
      }
    } else if (gid === SHEETS.PURCHASE.gid && row >= SHEETS.PURCHASE.data) {
      recalcMaterialStock();
    } else if (gid === SHEETS.SKU_FABRIC.gid) {
      // reference data changed — full production recalc
      recalcProduction();
      recalcMaterialStock();
    } else if (gid === SHEETS.PAYMENT_LEDGER.gid && row >= SHEETS.PAYMENT_LEDGER.data) {
      recalcPaymentLedger();
      refreshDashboard();         // payments move dashboard totals
    } else if (gid === SHEETS.SUPPLIERS.gid) {
      recalcProduction();         // supplier name/id cross-fill
    }
  } catch (err) {
    console.error("onEdit recalc failed: " + err.toString());
    try { e.source.toast(err.message, "⚠️ Automation error", 6); } catch (ignore) {}
  }
}
