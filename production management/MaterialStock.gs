/**
 * ============================================================
 *  MODULE 1 — MATERIAL STOCK
 *
 *  Purchase Vol = SUM(Purchase Raw Material qty) per fabric
 *  Used Vol     = SUM(Production Log PRINTING Total Fabric) per fabric
 *  Remaining    = Purchase Vol - Used Vol
 *
 *  Fabric is consumed at the printing stage only (sewing uses no
 *  fabric), so usage is summed from the printing block.
 * ============================================================
 */

function recalcMaterialStock() {
  // 1. Purchases by fabric
  const purchaseByFabric = {};
  getDataRows(SHEETS.PURCHASE).forEach(r => {
    const fabric = norm(r[COL_PURCHASE.FABRIC_NAME - 1]);
    if (!fabric) return;
    purchaseByFabric[fabric] = (purchaseByFabric[fabric] || 0) + toNum(r[COL_PURCHASE.QTY - 1]);
  });

  // 2. Usage by fabric (printing Total Fabric)
  const usedByFabric = {};
  getDataRows(SHEETS.PRODUCTION).forEach(r => {
    const fabric = norm(r[COL_PRINT.FABRIC_NAME - 1]);
    if (!fabric) return;
    usedByFabric[fabric] = (usedByFabric[fabric] || 0) + toNum(r[COL_PRINT.TOTAL_FABRIC - 1]);
  });

  // 3. Write back to Material Stock
  const sh = getSheet(SHEETS.MATERIAL_STOCK);
  const def = SHEETS.MATERIAL_STOCK;
  const lastRow = sh.getLastRow();
  if (lastRow < def.data) return;

  const numRows = lastRow - def.data + 1;
  const range = sh.getRange(def.data, 1, numRows, 6);
  const vals = range.getValues();

  vals.forEach(row => {
    const fabric = norm(row[COL_STOCK.FABRIC_NAME - 1]);
    if (!fabric) return;
    const purchased = purchaseByFabric[fabric] || 0;
    const used = usedByFabric[fabric] || 0;
    row[COL_STOCK.PURCHASE_VOL - 1] = purchased;
    row[COL_STOCK.USED_VOL - 1] = used;
    row[COL_STOCK.REMAINING - 1] = purchased - used;
  });

  range.setValues(vals);
  highlightLowStock(sh, def, vals);
}

/** Red-highlight the Remaining cell when at/below the low-stock threshold. */
function highlightLowStock(sh, def, vals) {
  const colors = [];
  for (let i = 0; i < vals.length; i++) {
    const fabric = String(vals[i][COL_STOCK.FABRIC_NAME - 1]).trim();
    const remaining = toNum(vals[i][COL_STOCK.REMAINING - 1]);
    colors.push([(fabric && remaining <= CONFIG.LOW_STOCK_THRESHOLD) ? "#f4cccc" : null]);
  }
  if (colors.length) {
    sh.getRange(def.data, COL_STOCK.REMAINING, colors.length, 1).setBackgrounds(colors);
  }
}
