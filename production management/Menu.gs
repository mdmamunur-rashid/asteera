/**
 * ============================================================
 *  CUSTOM MENU + MASTER RECALC
 * ============================================================
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ Asteera Automation")
    .addItem("🔄 Recalculate Everything", "recalcAll")
    .addSeparator()
    .addItem("🧮 Production Costs", "recalcProduction")
    .addItem("🔗 Sync Production → Ledger", "syncProductionToLedger")
    .addItem("📦 Material Stock", "recalcMaterialStock")
    .addItem("💰 Payment Ledger", "recalcPaymentLedger")
    .addItem("📊 Refresh Dashboard", "refreshDashboard")
    .addToUi();
}

/** Run all engine modules in dependency order. */
function recalcAll() {
  recalcProduction();        // derive total fabric, costs, suppliers
  syncProductionToLedger();  // create/update ledger rows for completed stages
  recalcMaterialStock();     // depends on production total fabric
  recalcPaymentLedger();     // re-affirm balances & statuses (incl. manual rows)
  refreshDashboard();        // live rollup of everything above
  SpreadsheetApp.getActiveSpreadsheet().toast("All modules recalculated.", "✅ Done", 4);
}
