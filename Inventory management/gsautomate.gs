/**
 * Automatic triggers for manual spreadsheet edits.
 */
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  const range = e.range;
  const col = range.getColumn();
  const row = range.getRow();
  const value = e.value;

  if (row <= 1) return; // Skip header

  // --- 1. Edit in PurchaseOrders ---
  if (sheetName === "PurchaseOrders") {
    // Column 6 is "Total Paid"
    if (col === 6) {
      const totalAmount = sheet.getRange(row, 5).getValue(); // Col 5
      const totalPaid = parseFloat(value) || 0;
      sheet.getRange(row, 7).setValue(totalAmount - totalPaid); // Col 7 is PO Balance
    }
  }

  // --- 2. Edit in PurchaseDetails ---
  if (sheetName === "PurchaseDetails") {
    // Column 8 is "QTY", Column 9 is "Unit Cost"
    if (col === 8 || col === 9) {
      const qty = sheet.getRange(row, 8).getValue();
      const unitCost = sheet.getRange(row, 9).getValue();
      const total = qty * unitCost;
      
      // Update Detail Total
      sheet.getRange(row, 10).setValue(total); // Col 10 is Total Purchase Price
      
      // Update PurchaseOrders summary and Inventory
      const poId = sheet.getRange(row, 2).getValue();
      if (poId) {
        updatetotalpo(); // Re-summarize this PO
        updateqtypurchased(); // Refresh Inventory stock
        updateremainingqty();
      }
    }
  }


}

/**
 * CORE RECALCULATION: Scans every row in PurchaseDetails and SalesDetails 
 * and overwrites the InventoryItems sheet with fresh totals.
 * Run this function manually to fix any stock discrepancies.
 */
function recalculateInventoryFromScratch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Ensure we use the correct ID for Order Management
  const ordId = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
  let ordSS;
  try {
    ordSS = SpreadsheetApp.openById(ordId);
  } catch (e) {
    throw new Error("Could not open Order Spreadsheet. Please check the ID: " + ordId);
  }
  
  const invSheet = ss.getSheetByName("InventoryItems");
  const pdSheet = ss.getSheetByName("PurchaseDetails");
  const sdSheet = ordSS.getSheetByName("SalesDetails");
  
  if (!invSheet || !pdSheet || !sdSheet) {
    throw new Error("One or more sheets (InventoryItems, PurchaseDetails, SalesDetails) not found.");
  }

  const invData = invSheet.getDataRange().getValues();
  const pdData = pdSheet.getDataRange().getValues();
  const sdData = sdSheet.getDataRange().getValues();

  // Helper to find column index by header name
  const getColIdx = (headers, name) => {
    const clean = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = clean(name);
    return headers.map(h => clean(h)).indexOf(target);
  };

  // 1. Map PurchaseDetails (Col E is SKU, Col H is QTY)
  const pdH = pdData[0];
  const pdSkuIdx = getColIdx(pdH, "SKU");
  const pdQtyIdx = getColIdx(pdH, "Qty");
  
  const purchasedMap = {};
  if (pdSkuIdx !== -1 && pdQtyIdx !== -1) {
    for (let i = 1; i < pdData.length; i++) {
      const sku = String(pdData[i][pdSkuIdx] || "").trim().toUpperCase();
      const qty = parseFloat(pdData[i][pdQtyIdx]) || 0;
      if (sku) purchasedMap[sku] = (purchasedMap[sku] || 0) + qty;
    }
  }

  // 2. Map SalesDetails (Col F is SKU, Col I is Qty)
  const sdH = sdData[0];
  const sdSkuIdx = getColIdx(sdH, "SKU");
  const sdQtyIdx = getColIdx(sdH, "Qty");
  
  const soldMap = {};
  if (sdSkuIdx !== -1 && sdQtyIdx !== -1) {
    for (let j = 1; j < sdData.length; j++) {
      const sku = String(sdData[j][sdSkuIdx] || "").trim().toUpperCase();
      const qty = parseFloat(sdData[j][sdQtyIdx]) || 0;
      if (sku) soldMap[sku] = (soldMap[sku] || 0) + qty;
    }
  }

  // 3. Update InventoryItems (Column F: Purchased, Column G: Sold, Column H: Remaining)
  const invH = invData[0];
  const invSkuIdx = 0; // SKU is usually Column A (Index 0)
  const pCol = getColIdx(invH, "QTY Purchased");
  const sCol = getColIdx(invH, "QTY Sold");
  const rCol = getColIdx(invH, "Remaining QTY");
  const reqCol = getColIdx(invH, "Reorder Required");

  if (pCol === -1 || sCol === -1 || rCol === -1) {
    throw new Error("Could not find Inventory columns (QTY Purchased, QTY Sold, or Remaining QTY).");
  }

  const updateRows = [];
  for (let k = 1; k < invData.length; k++) {
    const sku = String(invData[k][invSkuIdx] || "").trim().toUpperCase();
    if (!sku) {
      updateRows.push([invData[k][pCol], invData[k][sCol], invData[k][rCol], invData[k][reqCol]]);
      continue;
    }

    const pQty = purchasedMap[sku] || 0;
    const sQty = soldMap[sku] || 0;
    const remQty = pQty - sQty;
    const reorder = remQty <= 5 ? "Yes" : "No";

    updateRows.push([pQty, sQty, remQty, reorder]);
  }

  // Bulk write for performance (starting from QTY Purchased column)
  if (updateRows.length > 0) {
    invSheet.getRange(2, pCol + 1, updateRows.length, 4).setValues(updateRows);
  }

  return "Success! Inventory has been fully recalculated from all history.";
}

