const ORDER_SS_ID = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
const INV_SS_ID = "1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo";

const CONFIG = {
  VALUES_SHEET_NAME: "Dress Query/Order",
  SALES_DETAILS_SHEET: "SalesDetails",
  SALES_ORDER_SHEET: "SalesOrder", 
  STATUS_READY_TO_BILL: "Ready to Bill",
  STATUS_BILLED: "Billed",
  COL_ORDER_STATUS: "Order Status",
  COL_ORDER_INVOICE_NO: "Order Invoice No.",
  COL_CUSTOMER_NAME: "Customer Name",
  COL_PHONE: "Phone",
  COL_CUSTOMER_ADDRESS: "Customer Address",
  COL_PRODUCT_SKU: "Product SKU",
  COL_PRODUCT_QTY: "Product QTY",
  COL_PRODUCT_PRICE: "Product Price", 
  COL_SIZE: "Size",
  COL_BILL_DATE: "Bill Date",
  COL_DISCOUNT: "Discount",
  COL_DELIVERY_CHARGE: "Delivery Charge",
  COL_PAID: "Paid",
  COL_NOTE: "Note 1"
};

/**
 * Optimized Billing Engine (Fast Mode)
 */
function generateInvoices() {
  console.log("Starting Optimized Billing...");
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const valuesSheet = ss.getSheetByName(CONFIG.VALUES_SHEET_NAME);
    if (!valuesSheet) throw new Error("Orders sheet not found.");

    const data = valuesSheet.getDataRange().getDisplayValues();
    const headers = data[0];
    const findColIdx = (name) => headers.indexOf(name);
    const colIdx = {};
    for (const key in CONFIG) { if (key.startsWith("COL_")) colIdx[CONFIG[key]] = findColIdx(CONFIG[key]); }

    const { skuMap } = getInventoryData();
    
    const newDetailsRows = [];
    const newOrderSummaryRows = [];
    const skippedOrders = []; // To track failed orders for the popup
    
    let latestInvoiceNo = getInitialInvoiceNumber(valuesSheet, colIdx[CONFIG.COL_ORDER_INVOICE_NO], colIdx[CONFIG.COL_BILL_DATE]);
    const billDateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");

    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const rowData = data[i];
      const currentStatus = String(rowData[colIdx[CONFIG.COL_ORDER_STATUS]] || "").trim().toLowerCase();
      const targetStatus = CONFIG.STATUS_READY_TO_BILL.trim().toLowerCase();

      if (currentStatus === targetStatus) {
        const customerName = rowData[colIdx[CONFIG.COL_CUSTOMER_NAME]];
        
        // 1. Basic Field Validation
        const requiredFields = [
          { name: "Product SKU", key: CONFIG.COL_PRODUCT_SKU },
          { name: "Product QTY", key: CONFIG.COL_PRODUCT_QTY },
          { name: "Size", key: CONFIG.COL_SIZE },
          { name: "Customer Name", key: CONFIG.COL_CUSTOMER_NAME },
          { name: "Phone", key: CONFIG.COL_PHONE },
          { name: "Customer Address", key: CONFIG.COL_CUSTOMER_ADDRESS }
        ];
        
        let emptyFields = [];
        for (const field of requiredFields) {
          const val = String(rowData[colIdx[field.key]] || "").trim();
          if (val === "") emptyFields.push(field.name);
        }

        if (emptyFields.length > 0) {
          skippedOrders.push(`${customerName}: Missing ${emptyFields.join(", ")}`);
          continue; 
        }

        // 2. Parse and Validate SKUs/Sizes/Inventory
        const skuRaw = String(rowData[colIdx[CONFIG.COL_PRODUCT_SKU]] || "").trim();
        const skus = skuRaw.split(/[,\/]+/).map(s => s.trim()).filter(s => s !== "");
        
        const sizeRaw = String(rowData[colIdx[CONFIG.COL_SIZE]] || "").trim();
        const sizes = sizeRaw.split(/[,\/]+/).map(s => s.trim()).filter(s => s !== "");
        
        const qtyRaw = String(rowData[colIdx[CONFIG.COL_PRODUCT_QTY]] || "").trim();
        const rawQtys = qtyRaw.split(/[,\/]+/).map(q => q.trim()).filter(q => q !== "");

        // Validation: Size count must match SKU count (or be at least 1)
        if (sizes.length === 0) {
          skippedOrders.push(`${customerName}: No Sizes found in order sheet.`);
          continue;
        }

        let inventoryMissing = [];
        let rowItems = [];
        let subtotalMRP = 0;
        let validationFailed = false;

        // Calculate quantities first
        let qtys = [];
        if (rawQtys.length <= 1) {
          const totalQty = parseInt(rawQtys[0]) || skus.length;

          // NEW: Fraction Guard Logic
          if (totalQty % skus.length !== 0) {
            valuesSheet.getRange(i + 1, colIdx[CONFIG.COL_ORDER_STATUS] + 1).setValue("qty calculation error").setBackground("#f4cccc");
            skippedOrders.push(`${customerName}: Fractional QTY detected (${totalQty} / ${skus.length})`);
            continue;
          }

          const qPerSku = totalQty / skus.length;
          qtys = skus.map(() => qPerSku);
        } else {
          qtys = skus.map((_, idx) => parseInt(rawQtys[idx]) || 0);
        }

        for (let j = 0; j < skus.length; j++) {
          const sku = skus[j];
          const info = skuMap[sku];
          const orderSize = sizes[j] || sizes[0]; // Use specific size or fallback to first size if list is short

          if (!info) {
            inventoryMissing.push(sku);
            validationFailed = true;
          } else {
            const qty = qtys[j] || 0;
            const lineTotal = qty * info.price;
            subtotalMRP += lineTotal;
            rowItems.push({ sku, size: orderSize, name: info.name, qty, price: info.price, lineTotal });
          }
        }

        if (validationFailed) {
          skippedOrders.push(`${customerName}: SKU(s) [${inventoryMissing.join(", ")}] not found in Inventory.`);
          continue;
        }

        // 3. Success: Generate Invoice Number and Row Data
        let invoiceNo = rowData[colIdx[CONFIG.COL_ORDER_INVOICE_NO]];
        if (!invoiceNo || String(invoiceNo).trim() === "") {
          latestInvoiceNo++;
          invoiceNo = `${billDateStr}-${String(latestInvoiceNo).padStart(4, "0")}`;
          valuesSheet.getRange(i + 1, colIdx[CONFIG.COL_ORDER_INVOICE_NO] + 1).setValue(invoiceNo);
          valuesSheet.getRange(i + 1, colIdx[CONFIG.COL_BILL_DATE] + 1).setValue(new Date()).setNumberFormat("dd-MMM-yyyy");
        }

        const delivery = parseFloat(rowData[colIdx[CONFIG.COL_DELIVERY_CHARGE]]) || 0;
        const pPriceOverride = parseFloat(rowData[colIdx[CONFIG.COL_PRODUCT_PRICE]]) || 0;
        const paidAmount = parseFloat(rowData[colIdx[CONFIG.COL_PAID]]) || 0;
        const noteValue = String(rowData[colIdx[CONFIG.COL_NOTE]] || "").trim();
        
        const effectiveProductPrice = pPriceOverride > 0 ? pPriceOverride : (subtotalMRP + delivery);
        const totalDiscount = Math.max(0, (subtotalMRP + delivery) - effectiveProductPrice);

        rowItems.forEach(item => {
          const lineSoldPrice = subtotalMRP > 0 ? (item.lineTotal / subtotalMRP) * effectiveProductPrice : 0;
          newDetailsRows.push([
            new Date(), invoiceNo, rowData[colIdx[CONFIG.COL_CUSTOMER_NAME]], 
            rowData[colIdx[CONFIG.COL_PHONE]], rowData[colIdx[CONFIG.COL_CUSTOMER_ADDRESS]], 
            item.sku, item.size, item.name, item.qty, item.price, delivery, totalDiscount, item.lineTotal, lineSoldPrice, noteValue, "No"
          ]);
        });

        newOrderSummaryRows.push([
          new Date(), invoiceNo, rowData[colIdx[CONFIG.COL_CUSTOMER_NAME]], 
          skus.join(", "), subtotalMRP + delivery, effectiveProductPrice, ""
        ]);

        valuesSheet.getRange(i + 1, colIdx[CONFIG.COL_ORDER_STATUS] + 1).setValue(CONFIG.STATUS_BILLED);
        count++;
      }
    }

    if (count > 0 || skippedOrders.length > 0) {
      if (count > 0) {
        writeBulkData(ss, CONFIG.SALES_DETAILS_SHEET, newDetailsRows);
        writeBulkData(ss, CONFIG.SALES_ORDER_SHEET, newOrderSummaryRows);
        updateInventoryQtySold();
        updateInventoryRemainingQty();
      }
      
      let message = `Successfully processed ${count} orders.`;
      if (skippedOrders.length > 0) {
        message += "\n\n--- Skipped Orders ---\n" + skippedOrders.join("\n");
      }

      // Check context before alerting
      try {
        SpreadsheetApp.getUi().alert("Billing Complete", message, SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (e) {
        console.log("ERP Context: UI alert skipped. " + message);
      }
      
      return { success: true, message: `Successfully processed ${count} orders.`, skipped: skippedOrders };
    } else {
      try {
        SpreadsheetApp.getUi().alert("No pending orders found.");
      } catch (e) {
        console.log("ERP Context: No pending orders.");
      }
      return { success: false, message: "No pending orders found." };
    }
  } catch (e) {
    try {
      SpreadsheetApp.getUi().alert("Error: " + e.toString());
    } catch (err) {
      console.error("ERP Error: " + e.toString());
    }
    return { success: false, message: "Error: " + e.toString() };
  }
}

function updateInventoryQtySold() {
  try {
    const invSS = SpreadsheetApp.openById(INV_SS_ID);
    const ordSS = SpreadsheetApp.openById(ORDER_SS_ID);
    
    const invSheet = invSS.getSheetByName("InventoryItems");
    const sdSheet = ordSS.getSheetByName("SalesDetails");
    if (!invSheet || !sdSheet) return;

    const invData = invSheet.getDataRange().getValues();
    const sdData = sdSheet.getDataRange().getValues();
    
    const salesMap = {};
    for (let i = 1; i < sdData.length; i++) {
      const sku = String(sdData[i][5]).trim();
      const qty = parseFloat(sdData[i][8]) || 0;
      if (sku) salesMap[sku] = (salesMap[sku] || 0) + qty;
    }

    for (let i = 1; i < invData.length; i++) {
      const sku = String(invData[i][0]).trim();
      if (sku) {
        invSheet.getRange(i + 1, 7).setValue(salesMap[sku] || 0); // QTY Sold is Col G (Index 6)
      }
    }
  } catch (e) { console.error("Error updating qty sold: " + e.toString()); }
}

function updateInventoryRemainingQty() {
  try {
    const invSS = SpreadsheetApp.openById(INV_SS_ID);
    const sheet = invSS.getSheetByName("InventoryItems");
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const purchased = parseFloat(data[i][5]) || 0;
      const sold = parseFloat(data[i][6]) || 0;
      // Allow negative balance: Remaining = Purchased - Sold
      sheet.getRange(i + 1, 8).setValue(purchased - sold); // Remaining QTY is Col H (Index 7)
    }
  } catch (e) { console.error("Error updating remaining qty: " + e.toString()); }
}

function writeBulkData(ss, sheetName, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  // Clean old entries for these invoices first
  const existingData = sheet.getDataRange().getValues();
  const invoiceNumsToClean = [...new Set(rows.map(r => String(r[1])))];
  
  for (let i = existingData.length - 1; i >= 1; i--) {
    if (invoiceNumsToClean.includes(String(existingData[i][1]))) {
      sheet.deleteRow(i + 1);
    }
  }
  
  // Batch append
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function getInitialInvoiceNumber(sheet, colIdx, dateIdx) {
  const pref = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const data = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const val = String(data[i][colIdx]);
    if (val.startsWith(pref + "-")) {
      max = Math.max(max, parseInt(val.split("-")[1]) || 0);
    }
  }
  return max;
}

function getInventoryData() {
  const invSS = SpreadsheetApp.openById(INV_SS_ID);
  const sheet = invSS.getSheetByName("InventoryItems");
  const data = sheet.getDataRange().getValues();
  const skuMap = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][0]).trim();
    if (sku) skuMap[sku] = { name: data[i][2], size: data[i][1], price: parseFloat(data[i][4]) || 0 };
  }
  return { skuMap };
}
