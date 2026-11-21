/**
 * Updates the "Status Summary" sheet based on the current state of "Dress Query/Order".
 * This function filters out "Delivered" status and aggregates counts by SKU and Size.
 */
function updateStatusSummary() {
  const TARGET_SPREADSHEET_ID_ORDERS = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
  const TARGET_SHEET_NAME_ORDERS = "Dress Query/Order";
  const SUMMARY_SHEET_NAME = "Status Summary";
  const INV_SS_ID = "1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo";

  try {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
    const orderSheet = ss.getSheetByName(TARGET_SHEET_NAME_ORDERS);
    if (!orderSheet) {
      console.error("Order sheet not found: " + TARGET_SHEET_NAME_ORDERS);
      return;
    }

    const data = orderSheet.getDataRange().getValues();
    if (data.length <= 1) return;

    // 1. Get Inventory Map for validation (BATCH READ)
    const invSkus = new Set();
    try {
      const invSS = SpreadsheetApp.openById(INV_SS_ID);
      const invSheet = invSS.getSheetByName("InventoryItems");
      if (invSheet) {
        invSheet.getDataRange().getValues().forEach(r => {
          const sku = String(r[0]).trim().toLowerCase();
          if (sku) invSkus.add(sku);
        });
      }
    } catch (e) {
      console.error("Inventory check failed: " + e.message);
    }

    const headers = data[0];
    const skuIdx = headers.indexOf("Product SKU");
    const sizeIdx = headers.indexOf("Size");
    const statusIdx = headers.indexOf("Order Status");
    const qtyIdx = headers.indexOf("Product QTY");

    if (skuIdx === -1 || sizeIdx === -1 || statusIdx === -1 || qtyIdx === -1) {
      console.error("Required columns missing in Order sheet.");
      return;
    }

    // 2. Aggregate Data in Memory
    const summary = {};
    const allStatuses = new Set();

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][statusIdx] || "").trim();
      if (!status) continue;
      allStatuses.add(status);

      const skuVal = String(data[i][skuIdx] || "").trim();
      const sizeVal = String(data[i][sizeIdx] || "").trim();
      const qtyVal = String(data[i][qtyIdx] || "").trim();

      const getParts = (str) => !str ? [] : str.split(/[\/\n\r;,]+/).map(s => s.trim()).filter(s => s !== "");

      const skus = getParts(skuVal);
      const sizes = getParts(sizeVal);
      const rawQtys = getParts(qtyVal);

      let qtys = [];
      if (skus.length > 0) {
        if (rawQtys.length <= 1) {
          const totalQty = parseFloat(rawQtys[0]) || skus.length; 
          const qPerSku = totalQty / skus.length;
          qtys = skus.map(() => qPerSku);
        } else {
          qtys = skus.map((_, idx) => parseFloat(rawQtys[idx]) || 0);
        }
      }

      for (let j = 0; j < skus.length; j++) {
        const sku = skus[j];
        const size = sizes[j] || sizes[0] || "N/A";
        const qty = qtys[j] || 0;
        const key = sku + "|" + size;

        if (!summary[key]) {
          summary[key] = { sku: sku, size: size, counts: {} };
        }
        summary[key].counts[status] = (summary[key].counts[status] || 0) + qty;
      }
    }

    const sortedStatuses = Array.from(allStatuses).sort();
    if (sortedStatuses.includes("Delivered")) {
      sortedStatuses.splice(sortedStatuses.indexOf("Delivered"), 1);
      sortedStatuses.push("Delivered");
    }

    // 3. Prepare Summary Data
    let summarySheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
    if (!summarySheet) {
      summarySheet = ss.insertSheet(SUMMARY_SHEET_NAME);
    } else {
      summarySheet.clear();
      summarySheet.getBandings().forEach(b => b.remove());
    }

    const summaryHeaders = ["SKU", "Size", ...sortedStatuses, "Total"];
    const summaryData = [summaryHeaders];
    const fontColors = [summaryHeaders.map(() => "#ffffff")];
    const fontLines = [summaryHeaders.map(() => "none")];

    const sortedKeys = Object.keys(summary).sort((a, b) => {
      const [skuA, sizeA] = a.split("|");
      const [skuB, sizeB] = b.split("|");
      if (skuA !== skuB) return skuA.localeCompare(skuB, undefined, {numeric: true});
      return sizeA.localeCompare(sizeB, undefined, {numeric: true});
    });

    for (const key of sortedKeys) {
      const item = summary[key];
      const row = [item.sku, item.size];
      let rowTotal = 0;
      for (const status of sortedStatuses) {
        const count = item.counts[status] || 0;
        row.push(count === 0 ? "" : (Math.round(count * 100) / 100));
        rowTotal += count;
      }
      row.push(rowTotal === 0 ? "" : (Math.round(rowTotal * 100) / 100));
      summaryData.push(row);

      // Validation Colors (In-Memory)
      const isMissing = !invSkus.has(item.sku.toLowerCase());
      fontColors.push([isMissing ? "#ff0000" : "#000000", "#000000", ...sortedStatuses.map(() => "#000000"), "#000000"]);
      fontLines.push([isMissing ? "line-through" : "none", "none", ...sortedStatuses.map(() => "none"), "none"]);
    }

    // 4. Batch Update UI
    if (summaryData.length > 1) {
      const range = summarySheet.getRange(1, 1, summaryData.length, summaryHeaders.length);
      range.setValues(summaryData);
      range.setFontColors(fontColors);
      range.setFontLines(fontLines);
      
      range.setHorizontalAlignment("center").setVerticalAlignment("middle");
      range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);

      const headerRange = summarySheet.getRange(1, 1, 1, summaryHeaders.length);
      headerRange.setFontWeight("bold").setBackground("#316974").setFontColor("#ffffff");
      
      range.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
      summarySheet.setFrozenRows(1);
      summarySheet.setFrozenColumns(2);
      summarySheet.autoResizeColumns(1, summaryHeaders.length);
    } else {
      summarySheet.getRange(1, 1).setValue("No pending orders found to summarize.");
    }

  } catch (e) {
    console.error("updateStatusSummary Error: " + e.message);
  }
}
