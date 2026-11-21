/**
 * Robust helper to find column index by name (Case & Space insensitive)
 */
function getIdx(headers, name) {
  if (!headers || !name) return -1;
  const clean = (txt) => String(txt || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = clean(name);
  return headers.map(h => clean(h)).indexOf(target);
}

/**
 * Handles edits in the "Return Order" sheet.
 * SCANS ALL ROWS for uncalculated "Received" items.
 * (Triggered by the master authorizedOnEdit in codeOrder.gs)
 */
function handleReturnSheetEdit(e) {
  const ss = e.source;
  const sheet = ss.getSheetByName("Return Order");
  if (!sheet) return;

  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();
  const headers = data[0];

  // Map critical columns
  const statusIdx = getIdx(headers, "Return Receive Status");
  const processStatusIdx = 19; // Column T
  
  if (statusIdx === -1) return;

  // Ensure header for Column T exists if missing
  if (headers.length <= processStatusIdx || !headers[processStatusIdx]) {
    sheet.getRange(1, 20).setValue("System Status").setFontWeight("bold").setBackground("#efefef");
  }

  let rowsProcessed = 0;

  for (let i = 1; i < data.length; i++) {
    const rowStatus = String(data[i][statusIdx] || "").trim();
    const systemStatus = String(data[i][processStatusIdx] || "").trim();

    if (rowStatus === "Received" && systemStatus === "") {
      const rowIdx = i + 1;
      const success = processReceivedReturn(ss, sheet, rowIdx, headers);
      
      if (success) {
        sheet.getRange(rowIdx, 20).setValue("Calculated").setBackground("#d9ead3");
        rowsProcessed++;
      }
    }
  }

  if (rowsProcessed > 0) {
    ss.toast(`Successfully processed ${rowsProcessed} return(s).`, "Success");
  }
}

/**
 * Surgical logic to subtract items from SalesDetails and update system values.
 */
function processReceivedReturn(ss, returnSheet, rowIdx, headers) {
  try {
    const numCols = returnSheet.getLastColumn();
    const rowData = returnSheet.getRange(rowIdx, 1, 1, numCols).getValues()[0];
    const find = (name) => {
      const idx = getIdx(headers, name);
      return idx !== -1 ? rowData[idx] : "";
    };
    
    const invoiceNo = String(find("Invoice No") || "").trim();
    const returnType = String(find("Return Type") || "Partial").trim();
    const rawSkus = String(find("Return SKU") || find("Product SKU") || "").trim();
    const rawQtys = String(find("Receive Qty") || "").trim();
    const returnCostVal = parseFloat(find("Return Cost")) || 0;
    
    if (!invoiceNo) return false;

    const salesSheet = ss.getSheetByName("SalesDetails");
    const masterSheet = ss.getSheetByName("Dress Query/Order");
    if (!salesSheet || !masterSheet) return false;

    // Ensure SalesDetails has enough columns (up to R)
    if (salesSheet.getLastColumn() < 18) {
      const colsToAdd = 18 - salesSheet.getLastColumn();
      salesSheet.insertColumnsAfter(salesSheet.getLastColumn(), colsToAdd);
      salesSheet.getRange(1, 17).setValue("Return Status").setFontWeight("bold");
      salesSheet.getRange(1, 18).setValue("Return Cost").setFontWeight("bold");
    }

    const splitRegex = /[,\n\r;\/]+/;
    const returnSkus = rawSkus.split(splitRegex).map(s => s.trim()).filter(s => s !== "");
    const returnQtys = rawQtys.split(splitRegex).map(q => parseFloat(q.trim()) || 0);

    const sData = salesSheet.getDataRange().getValues();
    const sH = sData[0];
    
    const sInvIdx = getIdx(sH, "Invoice Num");
    const sSkuIdx = getIdx(sH, "SKU");
    const sQtyIdx = getIdx(sH, "Qty");
    const sPriceIdx = getIdx(sH, "Price");
    const sTotalIdx = getIdx(sH, "Total");
    const sSoldIdx = getIdx(sH, "Sold Price");
    const sPrintIdx = getIdx(sH, "Printed");
    const sRetInfoIdx = getIdx(sH, "Return Status");
    const sRetCostIdx = getIdx(sH, "Return Cost");

    if (sInvIdx === -1 || sSkuIdx === -1 || sQtyIdx === -1) {
      throw new Error("Missing SalesDetails headers (Invoice Num, SKU, or Qty)");
    }

    const dateStr = Utilities.formatDate(new Date(), "GMT+6", "dd-MMM-yy");

    if (returnType.toLowerCase() === "full") {
      for (let i = 1; i < sData.length; i++) {
        if (String(sData[i][sInvIdx]).trim() === invoiceNo) {
          salesSheet.getRange(i + 1, sQtyIdx + 1).setValue(0);
          if (sTotalIdx !== -1) salesSheet.getRange(i + 1, sTotalIdx + 1).setValue(0);
          if (sSoldIdx !== -1) salesSheet.getRange(i + 1, sSoldIdx + 1).setValue(0);
          if (sPrintIdx !== -1) salesSheet.getRange(i + 1, sPrintIdx + 1).setValue("No");
          if (sRetInfoIdx !== -1) salesSheet.getRange(i + 1, sRetInfoIdx + 1).setValue(`FULL RETURN on ${dateStr}`);
          if (sRetCostIdx !== -1) salesSheet.getRange(i + 1, sRetCostIdx + 1).setValue(returnCostVal);
        }
      }
    } else {
      let firstRowUpdated = false;
      returnSkus.forEach((sku, idx) => {
        const deductQty = returnQtys[idx] || returnQtys[0] || 0;
        if (deductQty <= 0) return;

        for (let i = 1; i < sData.length; i++) {
          if (String(sData[i][sInvIdx]).trim() === invoiceNo && String(sData[i][sSkuIdx]).trim() === sku) {
            const currentQty = parseFloat(sData[i][sQtyIdx]) || 0;
            const unitPrice = parseFloat(sData[i][sPriceIdx]) || 0;
            const newQty = Math.max(0, currentQty - deductQty);
            
            salesSheet.getRange(i + 1, sQtyIdx + 1).setValue(newQty);
            if (sTotalIdx !== -1) salesSheet.getRange(i + 1, sTotalIdx + 1).setValue(newQty * unitPrice);
            if (sSoldIdx !== -1) salesSheet.getRange(i + 1, sSoldIdx + 1).setValue(newQty * unitPrice);
            if (sPrintIdx !== -1) salesSheet.getRange(i + 1, sPrintIdx + 1).setValue("No");
            if (sRetInfoIdx !== -1) salesSheet.getRange(i + 1, sRetInfoIdx + 1).setValue(`Returned ${deductQty} items on ${dateStr}`);
            
            if (!firstRowUpdated && sRetCostIdx !== -1) {
              salesSheet.getRange(i + 1, sRetCostIdx + 1).setValue(returnCostVal);
              firstRowUpdated = true;
            }
            break;
          }
        }
      });
    }

    syncPriceToMaster(ss, masterSheet, salesSheet, invoiceNo);
    return true;
  } catch (err) {
    ss.toast("Error: " + err.message, "Return Failure", 10);
    return false;
  }
}

/**
 * Recalculates master price and syncs Inventory.
 */
/**
 * Recalculates master price and syncs Inventory.
 */
function syncPriceToMaster(ss, masterSheet, salesSheet, invoiceNo) {
  const sData = salesSheet.getDataRange().getValues();
  const sH = sData[0];
  const sInvIdx = getIdx(sH, "Invoice Num");
  const sSoldIdx = getIdx(sH, "Sold Price");
  const sDelIdx = getIdx(sH, "Delivery");
  const sRetCostIdx = getIdx(sH, "Return Cost");

  let newProductSum = 0, deliveryCharge = 0, returnCost = 0;

  for (let i = 1; i < sData.length; i++) {
    if (String(sData[i][sInvIdx]).trim() === invoiceNo) {
      newProductSum += parseFloat(sData[i][sSoldIdx]) || 0;
      deliveryCharge = parseFloat(sData[i][sDelIdx]) || 0;
      const rc = parseFloat(sData[i][sRetCostIdx]) || 0;
      if (rc > 0) returnCost = rc;
    }
  }

  const mData = masterSheet.getDataRange().getValues();
  const mH = mData[0];
  const mInvIdx = getIdx(mH, "Order Invoice No.");
  const mPriceIdx = getIdx(mH, "Product Price");
  const mStatusIdx = getIdx(mH, "Order Status");

  if (mInvIdx !== -1 && mPriceIdx !== -1) {
    for (let k = 1; k < mData.length; k++) {
      if (String(mData[k][mInvIdx]).trim() === invoiceNo) {
        masterSheet.getRange(k + 1, mPriceIdx + 1).setValue(newProductSum + deliveryCharge + returnCost);
        if (newProductSum === 0) masterSheet.getRange(k + 1, mStatusIdx + 1).setValue("Returned");
        break;
      }
    }
  }
  
  // FIXED: Pass ss to ensure context is preserved
  syncInventoryDirect(ss);
}

/**
 * Cross-Project Inventory Sync.
 */
function syncInventoryDirect(ss) {
  const INV_SS_ID = "1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo";
  let invSS;
  try {
    invSS = SpreadsheetApp.openById(INV_SS_ID);
  } catch (e) {
    console.error("Could not open Inventory Spreadsheet: " + e.message);
    return;
  }
  
  const invSheet = invSS.getSheetByName("InventoryItems");
  const salesSheet = ss.getSheetByName("SalesDetails");
  if (!invSheet || !salesSheet) return;

  const invData = invSheet.getDataRange().getValues();
  const salesData = salesSheet.getDataRange().getValues();
  const sH = salesData[0];
  
  const skuIdx = getIdx(sH, "SKU");
  const qtyIdx = getIdx(sH, "Qty");

  if (skuIdx === -1 || qtyIdx === -1) return;

  const soldMap = {};
  for (let i = 1; i < salesData.length; i++) {
    const sku = String(salesData[i][skuIdx] || "").trim().toUpperCase();
    const qty = parseFloat(salesData[i][qtyIdx]) || 0;
    if (sku) soldMap[sku] = (soldMap[sku] || 0) + qty;
  }

  // Find column indices in Inventory sheet
  const invH = invData[0];
  const pCol = getIdx(invH, "QTY Purchased");
  const sCol = getIdx(invH, "QTY Sold");
  const rCol = getIdx(invH, "Remaining QTY");
  const reqCol = getIdx(invH, "Reorder Required");

  if (sCol === -1) return;

  for (let j = 1; j < invData.length; j++) {
    const sku = String(invData[j][0] || "").trim().toUpperCase();
    if (sku) {
      const soldQty = soldMap[sku] || 0;
      const purchasedQty = parseFloat(invData[j][pCol]) || 0; 
      const remQty = purchasedQty - soldQty;
      const reorder = remQty <= 5 ? "Yes" : "No";

      invSheet.getRange(j + 1, sCol + 1).setValue(soldQty); 
      if (rCol !== -1) invSheet.getRange(j + 1, rCol + 1).setValue(remQty);
      if (reqCol !== -1) invSheet.getRange(j + 1, reqCol + 1).setValue(reorder);
    }
  }
}
