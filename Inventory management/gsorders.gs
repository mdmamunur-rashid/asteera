// CONFIGURATION for Billing
const BILL_CONFIG = {
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
  NOTE_COL_NAME: "Note 1"
};

// CONFIGURATION for Pathao
const PATHAO_CONFIG = {
  ORDER_STATUS_COL_NAME: "Order Status",
  ORDER_INVOICE_NO_COL_NAME: "Order Invoice No.",
  CUSTOMER_NAME_COL_NAME: "Customer Name",
  PHONE_COL_NAME: "Phone",
  CUSTOMER_ADDRESS_COL_NAME: "Customer Address",
  PRODUCT_SKU_COL_NAME: "Product SKU",
  PRODUCT_QTY_COL_NAME: "Product QTY",
  PRODUCT_PRICE_COL_NAME: "Product Price",
  NOTE_COL_NAME: "Note 1",
  COURIER_TRACKING_NO_COL_NAME: "Courier Tracking No",
  COD_COL_NAME: "COD",
  PAYMENT_STATUS_COL_NAME: "Payment Status",
  DELIVERY_METHOD_COL_NAME: "Delivery Method",
  ORDER_STATUS_BILLED: "Billed",
  ORDER_STATUS_IN_COURIER: "In Courier",
  ORDER_STATUS_PATHAO_FAILED: "Hold",
  PAYMENT_STATUS_COD: "COD",
  PAYMENT_STATUS_PAID: "Paid"
};

/**
 * STRATEGY: Robust Header Mapping (from PathaoIntegration.gs)
 */
function erpGetColumnIndex(headers, headerName) {
  const cleanTarget = String(headerName || "").toLowerCase().trim().replace(/\s+/g, ' ');
  const lowerHeaders = headers.map(h => String(h || "").toLowerCase().trim().replace(/\s+/g, ' '));
  return lowerHeaders.indexOf(cleanTarget);
}

/**
 * ERP Wrapper for Generating Invoices
 */
function erpGenerateInvoices() {
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const valuesSheet = ss.getSheetByName(BILL_CONFIG.VALUES_SHEET_NAME);
    if (!valuesSheet) return { success: false, message: "Orders sheet not found." };

    const data = valuesSheet.getDataRange().getDisplayValues();
    const headers = data[0];
    
    const colIdx = {};
    for (const key in BILL_CONFIG) { 
      if (key.startsWith("COL_")) {
        colIdx[BILL_CONFIG[key]] = erpGetColumnIndex(headers, BILL_CONFIG[key]); 
      }
    }
    const mNoteIdx = erpGetColumnIndex(headers, BILL_CONFIG.NOTE_COL_NAME);

    if (colIdx[BILL_CONFIG.COL_ORDER_STATUS] === -1) {
      return { success: false, message: "Required column 'Order Status' not found." };
    }

    const { skuMap } = getBillingInventoryData();
    
    const newDetailsRows = [];
    const newOrderSummaryRows = [];
    const skippedOrders = [];
    
    let latestInvoiceNo = getBillingInitialInvoiceNumber(valuesSheet, colIdx[BILL_CONFIG.COL_ORDER_INVOICE_NO]);
    const billDateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");

    let count = 0;
    const splitRegex = /[,\n\r;\/]+/;

    for (let i = 1; i < data.length; i++) {
      const rowData = data[i];
      const currentStatus = String(rowData[colIdx[BILL_CONFIG.COL_ORDER_STATUS]] || "").trim().toLowerCase();
      
      if (currentStatus === BILL_CONFIG.STATUS_READY_TO_BILL.toLowerCase()) {
        const customerName = rowData[colIdx[BILL_CONFIG.COL_CUSTOMER_NAME]];
        
        const skuRaw = String(rowData[colIdx[BILL_CONFIG.COL_PRODUCT_SKU]] || "").trim();
        const skus = skuRaw.split(splitRegex).map(s => s.trim()).filter(s => s !== "");
        const sizeRaw = String(rowData[colIdx[BILL_CONFIG.COL_SIZE]] || "").trim();
        const sizes = sizeRaw.split(splitRegex).map(s => s.trim()).filter(s => s !== "");
        const qtyRaw = String(rowData[colIdx[BILL_CONFIG.COL_PRODUCT_QTY]] || "").trim();
        const rawQtys = qtyRaw.split(splitRegex).map(q => q.trim()).filter(q => q !== "");

        if (skus.length === 0) {
          skippedOrders.push(`${customerName}: Missing Product SKU`);
          continue;
        }

        let inventoryMissing = [];
        let rowItems = [];
        let subtotalMRP = 0;
        let validationFailed = false;

        let qtys = [];
        if (rawQtys.length <= 1) {
          const totalQty = parseInt(rawQtys[0]) || skus.length;
          if (totalQty % skus.length !== 0) {
            valuesSheet.getRange(i + 1, colIdx[BILL_CONFIG.COL_ORDER_STATUS] + 1).setValue("qty calculation error").setBackground("#f4cccc");
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
          const orderSize = sizes[j] || sizes[0] || "N/A";
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

        latestInvoiceNo++;
        const invoiceNo = `${billDateStr}-${String(latestInvoiceNo).padStart(4, "0")}`;
        const delivery = parseFloat(rowData[colIdx[BILL_CONFIG.COL_DELIVERY_CHARGE]]) || 0;
        const pPriceOverride = parseFloat(rowData[colIdx[BILL_CONFIG.COL_PRODUCT_PRICE]]) || 0;
        const effectiveProductPrice = pPriceOverride > 0 ? pPriceOverride : (subtotalMRP + delivery);
        const totalDiscount = Math.max(0, (subtotalMRP + delivery) - effectiveProductPrice);

        rowItems.forEach(item => {
          const lineSoldPrice = subtotalMRP > 0 ? (item.lineTotal / subtotalMRP) * effectiveProductPrice : 0;
          newDetailsRows.push([
            new Date(), invoiceNo, rowData[colIdx[BILL_CONFIG.COL_CUSTOMER_NAME]], 
            rowData[colIdx[BILL_CONFIG.COL_PHONE]], rowData[colIdx[BILL_CONFIG.COL_CUSTOMER_ADDRESS]], 
            item.sku, item.size, item.name, item.qty, item.price, delivery, totalDiscount, item.lineTotal, lineSoldPrice,
            rowData[mNoteIdx] || "", "No"
          ]);
        });

        newOrderSummaryRows.push([
          new Date(), invoiceNo, rowData[colIdx[BILL_CONFIG.COL_CUSTOMER_NAME]], 
          skus.join(", "), subtotalMRP + delivery, effectiveProductPrice, ""
        ]);

        valuesSheet.getRange(i + 1, colIdx[BILL_CONFIG.COL_ORDER_INVOICE_NO] + 1).setValue(invoiceNo);
        valuesSheet.getRange(i + 1, colIdx[BILL_CONFIG.COL_BILL_DATE] + 1).setValue(new Date()).setNumberFormat("dd-MMM-yyyy");
        valuesSheet.getRange(i + 1, colIdx[BILL_CONFIG.COL_ORDER_STATUS] + 1).setValue(BILL_CONFIG.STATUS_BILLED);
        count++;
      }
    }

    if (count > 0) {
      writeBillingBulkData(ss, BILL_CONFIG.SALES_DETAILS_SHEET, newDetailsRows);
      writeBillingBulkData(ss, BILL_CONFIG.SALES_ORDER_SHEET, newOrderSummaryRows);
      
      // Update inventory totals
      try { updateqtysold(); } catch(e) {}
      try { updateremainingqty(); } catch(e) {}
      
      return { success: true, message: `Successfully processed ${count} orders.`, skipped: skippedOrders };
    } else {
      return { success: false, message: "No pending orders found.", skipped: skippedOrders };
    }
  } catch (e) {
    return { success: false, message: "Error: " + e.toString() };
  }
}

function getPathaoAccessToken(config) {
  const props = PropertiesService.getScriptProperties();
  const storedAccessToken = props.getProperty('PATHAO_ACCESS_TOKEN');
  const storedRefreshToken = props.getProperty('PATHAO_REFRESH_TOKEN');
  const tokenExpiryTime = props.getProperty('PATHAO_TOKEN_EXPIRY');

  if (storedAccessToken && tokenExpiryTime && Date.now() < parseInt(tokenExpiryTime, 10)) {
    return storedAccessToken;
  }

  let payload;
  const url = `${config.baseUrl}/aladdin/api/v1/issue-token`;

  if (storedRefreshToken) {
    payload = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: storedRefreshToken
    };
  } else {
    payload = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'password',
      username: config.username,
      password: config.password
    };
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());
  
  if (res.getResponseCode() === 200 && json.access_token) {
    props.setProperty('PATHAO_ACCESS_TOKEN', json.access_token);
    if (json.refresh_token) props.setProperty('PATHAO_REFRESH_TOKEN', json.refresh_token);
    props.setProperty('PATHAO_TOKEN_EXPIRY', (Date.now() + (json.expires_in * 1000) - 300000).toString());
    return json.access_token;
  }
  return null;
}

function callPathaoApi(payload, token, baseUrl) {
  const res = UrlFetchApp.fetch(`${baseUrl}/aladdin/api/v1/orders`, {
    method: 'post', contentType: 'application/json', headers: { 'Authorization': `Bearer ${token}` },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const json = JSON.parse(res.getContentText());
  return (res.getResponseCode() === 200 && json.data) ? json.data : json;
}

/**
 * ERP Wrapper for Generating Pathao Orders
 */
function erpGeneratePathaoOrders() {
  try {
    const config = getPathaoStoredConfig();
    if (!config.clientId || !config.pathaoStoreId) return { success: false, message: "Pathao API credentials or Store ID missing." };
    
    const accessToken = getPathaoAccessToken(config);
    if (!accessToken) return { success: false, message: "Could not obtain Pathao access token." };

    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const sheet = ss.getSheetByName(BILL_CONFIG.VALUES_SHEET_NAME);
    if (!sheet) return { success: false, message: "Orders sheet not found." };

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Robust Header Mapping
    const findIdx = (name) => erpGetColumnIndex(headers, name);
    
    const col = {
      status: findIdx("Order Status"),
      invoice: findIdx("Order Invoice No."),
      name: findIdx("Customer Name"),
      phone: findIdx("Phone"),
      address: findIdx("Customer Address"),
      sku: findIdx("Product SKU"),
      qty: findIdx("Product QTY"),
      price: findIdx("Product Price"),
      note: findIdx("Note 1"),
      tracking: findIdx("Courier Tracking No"),
      cod: findIdx("COD"),
      method: findIdx("Delivery Method"),
      paymentStatus: findIdx("Payment Status"),
      pageName: findIdx("Page Name")
    };

    if (col.status === -1 || col.method === -1) {
      return { success: false, message: "Required columns (Order Status or Delivery Method) not found." };
    }

    const brandingsMap = {};
    if (typeof getBrandings === 'function') {
      getBrandings().forEach(b => { brandingsMap[b.name] = b.phone || ""; });
    }
    const DEFAULT_CALL_CENTER = "01821155665";
    const getCallCenter = (pName) => brandingsMap[pName] || DEFAULT_CALL_CENTER;

    let ordersCreatedCount = 0;
    let skippedCount = 0;
    const rowsToUpdate = [];

    for (let i = 1; i < values.length; i++) {
      const rowData = values[i];
      const status = String(rowData[col.status] || "").trim().toLowerCase();
      const tracking = String(rowData[col.tracking] || "").trim();
      const method = String(rowData[col.method] || "").trim().toLowerCase();
      const pageName = col.pageName !== -1 ? (rowData[col.pageName] || "Asteera") : "Asteera";

      if (status === "billed" && (!tracking || tracking === "")) {
        if (method !== "pathao") {
          skippedCount++;
          continue;
        }

        let phone = String(rowData[col.phone] || "").replace(/[^0-9]/g, '');
        if (phone.length === 10 && !phone.startsWith('0')) phone = '0' + phone;
        if (phone.length > 11) phone = phone.substring(phone.length - 11);

        const sku = rowData[col.sku];
        const qty = rowData[col.qty];
        const price = rowData[col.price];
        const note = col.note !== -1 ? rowData[col.note] : "";
        const codValue = rowData[col.cod];

        const itemDescription = `SKU: ${sku}, Qty: ${qty}, Price: ${price}, Note: ${note || 'N/A'}`;
        
        let amountToCollect = 0;
        let paymentStatus = "Paid";
        if (codValue && !isNaN(parseFloat(codValue)) && parseFloat(codValue) > 0) {
          amountToCollect = Math.round(parseFloat(codValue));
          paymentStatus = "COD";
        }

        const payload = {
          store_id: parseInt(config.pathaoStoreId, 10),
          merchant_order_id: String(rowData[col.invoice] || ""),
          recipient_name: String(rowData[col.name] || "Customer"),
          recipient_phone: phone,
          recipient_address: String(rowData[col.address] || ""),
          delivery_type: 48,
          item_type: 2,
          special_instruction: String(note || ""),
          item_quantity: parseInt(qty, 10) || 1,
          item_weight: "0.5",
          item_description: itemDescription,
          amount_to_collect: amountToCollect
        };

        try {
          const res = callPathaoApi(payload, accessToken, config.baseUrl);
          if (res && res.consignment_id) {
            rowsToUpdate.push({ 
              row: i + 1, 
              status: "In Courier", 
              tracking: res.consignment_id,
              paymentStatus: paymentStatus
            });
            ordersCreatedCount++;

            // --- TRIGGER SMS NOTIFICATION ---
            if (typeof sendAsteeraSMS === 'function') {
              const smsMessage = `Dear ${String(rowData[col.name]).toUpperCase()}!\nYour order has been shift to pathao courier.\nAmount: ${amountToCollect}\nCall Center: ${getCallCenter(pageName)}\nThanks\n${pageName}`;
              sendAsteeraSMS(phone, smsMessage);
            }
          } else {
            rowsToUpdate.push({ row: i + 1, status: "Hold", tracking: "Error: " + (res.message || "API error") });
          }
        } catch (e) {
          rowsToUpdate.push({ row: i + 1, status: "Hold", tracking: "Exception: " + e.message });
        }
        
        // ADDED DELAY TO PREVENT RATE LIMITING
        Utilities.sleep(500);
      }
    }

    for (const u of rowsToUpdate) {
      sheet.getRange(u.row, col.status + 1).setValue(u.status);
      sheet.getRange(u.row, col.tracking + 1).setValue(u.tracking);
      if (u.paymentStatus && col.paymentStatus !== -1) {
        sheet.getRange(u.row, col.paymentStatus + 1).setValue(u.paymentStatus);
      }
    }

    if (ordersCreatedCount > 0) erpUpdateStatusSummary();

    return { success: true, message: `Success: ${ordersCreatedCount} orders sent to Pathao. ${skippedCount} non-Pathao orders skipped.` };
  } catch (e) {
    return { success: false, message: "System Error: " + e.toString() };
  }
}

/**
 * ERP Wrapper for Updating Status Summary
 */
function erpUpdateStatusSummary() {
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const orderSheet = ss.getSheetByName(BILL_CONFIG.VALUES_SHEET_NAME);
    const data = orderSheet.getDataRange().getValues();
    if (data.length <= 1) return;

    // Get Inventory Map for validation
    const invSS = SpreadsheetApp.openById(INV_SS_ID);
    const invSheet = invSS.getSheetByName("InventoryItems");
    const invSkus = new Set(invSheet.getDataRange().getValues().map(r => String(r[0]).trim().toLowerCase()));

    const headers = data[0];
    const skuIdx = erpGetColumnIndex(headers, "Product SKU");
    const sizeIdx = erpGetColumnIndex(headers, "Size");
    const statusIdx = erpGetColumnIndex(headers, "Order Status");
    const qtyIdx = erpGetColumnIndex(headers, "Product QTY");
    
    if (skuIdx === -1 || statusIdx === -1) return;

    const summary = {}, allStatuses = new Set();
    const splitRegex = /[,\n\r;\/]+/;

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][statusIdx] || "").trim();
      if (!status) continue;
      allStatuses.add(status);

      const skus = String(data[i][skuIdx] || "").split(splitRegex).map(s => s.trim()).filter(s => s !== "");
      const sizes = String(data[i][sizeIdx] || "").split(splitRegex).map(s => s.trim()).filter(s => s !== "");
      const rawQtys = String(data[i][qtyIdx] || "").split(splitRegex).map(q => q.trim()).filter(q => q !== "");

      for (let j = 0; j < skus.length; j++) {
        const sku = skus[j];
        const size = sizes[j] || sizes[0] || "N/A";
        // Handle quantity distribution
        let qty = 1;
        if (rawQtys.length === 1) {
          qty = parseFloat(rawQtys[0]) / skus.length;
        } else {
          qty = parseFloat(rawQtys[j]) || 1;
        }
        
        const key = sku + "|" + size;
        if (!summary[key]) summary[key] = { sku, size, counts: {} };
        summary[key].counts[status] = (summary[key].counts[status] || 0) + qty;
      }
    }

    const sortedStatuses = Array.from(allStatuses).sort();
    let summarySheet = ss.getSheetByName("Status Summary") || ss.insertSheet("Status Summary");
    summarySheet.clear().getBandings().forEach(b => b.remove());

    const summaryData = [["SKU", "Size", ...sortedStatuses, "Total"]];
    const skuRows = Object.keys(summary).sort();
    
    skuRows.forEach(key => {
      const item = summary[key], row = [item.sku, item.size];
      let rowTotal = 0;
      sortedStatuses.forEach(s => { 
        const c = item.counts[s] || 0; 
        row.push(c || ""); 
        rowTotal += c; 
      });
      row.push(rowTotal || "");
      summaryData.push(row);
    });

    const range = summarySheet.getRange(1, 1, summaryData.length, summaryData[0].length);
    range.setValues(summaryData).setHorizontalAlignment("center").setVerticalAlignment("middle");
    range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    summarySheet.getRange(1, 1, 1, summaryData[0].length).setFontWeight("bold").setBackground("#316974").setFontColor("#ffffff");
    
    // FORMATTING: Red Strikethrough for missing SKUs
    for (let k = 0; k < skuRows.length; k++) {
      const rowIdx = k + 2;
      const skuVal = String(summaryData[k + 1][0]);
      if (!invSkus.has(skuVal.toLowerCase())) {
        summarySheet.getRange(rowIdx, 1).setFontColor("#ff0000").setFontLine("line-through");
      }
    }

    summarySheet.setFrozenRows(1);
    summarySheet.autoResizeColumns(1, summaryData[0].length);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getOrderStats() {
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const sheet = ss.getSheetByName(BILL_CONFIG.VALUES_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const statusIdx = erpGetColumnIndex(headers, "Order Status");
    const trackingIdx = erpGetColumnIndex(headers, "Courier Tracking No");
    const methodIdx = erpGetColumnIndex(headers, "Delivery Method");
    const billDateIdx = erpGetColumnIndex(headers, "Bill Date");

    let stats = {
      readyToBill: 0,
      pendingPathao: 0,
      pendingSteadfast: 0,
      totalToday: 0
    };

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][statusIdx] || "").trim();
      const tracking = String(data[i][trackingIdx] || "").trim();
      const method = String(data[i][methodIdx] || "").trim().toLowerCase();

      if (status === "Ready to Bill") stats.readyToBill++;
      if (status === "Billed" && !tracking) {
        if (method === "pathao") stats.pendingPathao++;
        if (method === "steadfast") stats.pendingSteadfast++;
      }

      if (billDateIdx !== -1 && data[i][billDateIdx] instanceof Date) {
        const rowDate = Utilities.formatDate(data[i][billDateIdx], Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (rowDate === today) stats.totalToday++;
      }
    }
    return stats;
  } catch (e) { return { readyToBill: 0, pendingPathao: 0, pendingSteadfast: 0, totalToday: 0 }; }
}

/**
 * ERP WRAPPERS FOR COURIER INTEGRATION
 * These bridge the Orders Hub UI to the back-end .gs functions.
 */

/**
 * Combined ERP Wrapper for Syncing All Couriers
 */
function erpSyncAllCouriers() {
  let messages = [];
  
  try {
    // 1. Trigger Pathao Sync (Uses the full implementation above)
    const pathaoRes = erpGeneratePathaoOrders();
    messages.push(pathaoRes.message);
    
    // 2. Trigger Steadfast Sync
    const steadfastRes = erpGenerateSteadfastOrders();
    messages.push(steadfastRes.message);
    
    return { 
      success: true, 
      message: messages.join(" | ")
    };
  } catch (e) {
    return { success: false, message: "Sync Error: " + e.toString() };
  }
}

/**
 * Sends SMS via Automas API (ERP Project Copy)
 */
function sendAsteeraSMS(number, message) {
  if (!number || !message) return;
  // Set SMS_API_KEY / SMS_SENDER in Apps Script > Project Settings > Script properties.
  const props = PropertiesService.getScriptProperties();
  const API_KEY = props.getProperty('SMS_API_KEY');
  const SENDER = props.getProperty('SMS_SENDER') || "8809617171817";
  if (!API_KEY) { console.error("ERP SMS Error: SMS_API_KEY script property is not set"); return; }
  const ENDPOINT = "https://api.automas.com.bd/smsapiv3";

  let formattedNumber = String(number).trim().replace(/[^\d]/g, '');
  if (!formattedNumber.startsWith('88')) formattedNumber = '88' + (formattedNumber.startsWith('0') ? formattedNumber : '0' + formattedNumber);

  const url = `${ENDPOINT}?apikey=${API_KEY}&sender=${SENDER}&msisdn=${formattedNumber}&smstext=${encodeURIComponent(message)}`;

  try {
    UrlFetchApp.fetch(url, { "method": "get", "muteHttpExceptions": true });
  } catch (e) { console.error("ERP SMS Error: " + e.toString()); }
}

/**
 * ERP Wrapper for Generating Steadfast Orders
 */
function erpGenerateSteadfastOrders() {
  try {
    const config = getSteadfastStoredConfig();
    if (!config.apiKey || !config.secretKey) return { success: false, message: "Steadfast API credentials missing." };

    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const sheet = ss.getSheetByName(BILL_CONFIG.VALUES_SHEET_NAME);
    if (!sheet) return { success: false, message: "Orders sheet not found." };

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const findIdx = (name) => erpGetColumnIndex(headers, name);

    const col = {
      status: findIdx("Order Status"),
      invoice: findIdx("Order Invoice No."),
      name: findIdx("Customer Name"),
      phone: findIdx("Phone"),
      address: findIdx("Customer Address"),
      sku: findIdx("Product SKU"),
      qty: findIdx("Product QTY"),
      price: findIdx("Product Price"),
      note: findIdx("Note 1"),
      tracking: findIdx("Courier Tracking No"),
      cod: findIdx("COD"),
      method: findIdx("Delivery Method"),
      paymentStatus: findIdx("Payment Status"),
      pageName: findIdx("Page Name")
    };

    if (col.status === -1 || col.method === -1) return { success: false, message: "Required columns missing." };

    const brandingsMap2 = {};
    if (typeof getBrandings === 'function') {
      getBrandings().forEach(b => { brandingsMap2[b.name] = b.phone || ""; });
    }
    const getCallCenter2 = (pName) => brandingsMap2[pName] || "01821155665";

    let ordersCreatedCount = 0;
    let skippedCount = 0;
    const rowsToUpdate = [];

    for (let i = 1; i < values.length; i++) {
      const rowData = values[i];
      const status = String(rowData[col.status] || "").trim().toLowerCase();
      const tracking = String(rowData[col.tracking] || "").trim();
      const method = String(rowData[col.method] || "").trim().toLowerCase();
      const pageName = col.pageName !== -1 ? (rowData[col.pageName] || "Asteera") : "Asteera";

      if (status === "billed" && (!tracking || tracking === "")) {
        if (method !== "steadfast") {
          skippedCount++;
          continue;
        }

        const invoiceNo = rowData[col.invoice];
        const recipientName = rowData[col.name];
        let recipientPhone = String(rowData[col.phone] || "").replace(/[^0-9]/g, '');
        if (recipientPhone.length === 10 && !recipientPhone.startsWith('0')) recipientPhone = '0' + recipientPhone;
        if (recipientPhone.length > 11) recipientPhone = recipientPhone.substring(recipientPhone.length - 11);
        
        const recipientAddress = rowData[col.address];
        const productSku = rowData[col.sku];
        const productQty = rowData[col.qty];
        const productPrice = rowData[col.price];
        const note = rowData[col.note];
        const codValue = parseFloat(rowData[col.cod]) || 0;

        const itemDescription = `SKU: ${productSku}, Qty: ${productQty}, Price: ${productPrice}`;
        const finalNote = note ? `${note} | ${itemDescription}` : itemDescription;

        const payload = {
          invoice: String(invoiceNo || ""),
          recipient_name: String(recipientName || "Customer"),
          recipient_phone: recipientPhone,
          recipient_address: String(recipientAddress || ""),
          cod_amount: Math.round(codValue),
          note: finalNote
        };

        try {
          const res = callSteadfastApi(payload, config);
          if (res && res.status === 200 && res.consignment) {
            const paymentStatus = codValue > 0 ? "COD" : "Paid";
            rowsToUpdate.push({
              row: i + 1,
              status: "In Courier",
              tracking: res.consignment.consignment_id,
              paymentStatus: paymentStatus
            });
            ordersCreatedCount++;

            // --- TRIGGER SMS NOTIFICATION ---
            if (typeof sendAsteeraSMS === 'function') {
              const smsMessage = `Dear ${String(recipientName).toUpperCase()}!\nYour order has been shift to steadfast courier.\nAmount: ${Math.round(codValue)}\nCall Center: ${getCallCenter2(pageName)}\nThanks\n${pageName}`;
              sendAsteeraSMS(recipientPhone, smsMessage);
            }
          } else {
            rowsToUpdate.push({ row: i + 1, status: "Hold", tracking: "Error: " + (res.message || "API error") });
          }
        } catch (e) {
          rowsToUpdate.push({ row: i + 1, status: "Hold", tracking: "Exception: " + e.message });
        }
        Utilities.sleep(500);
      }
    }

    for (const u of rowsToUpdate) {
      sheet.getRange(u.row, col.status + 1).setValue(u.status);
      sheet.getRange(u.row, col.tracking + 1).setValue(u.tracking);
      if (u.paymentStatus && col.paymentStatus !== -1) {
        sheet.getRange(u.row, col.paymentStatus + 1).setValue(u.paymentStatus);
      }
    }

    if (ordersCreatedCount > 0) erpUpdateStatusSummary();
    return { success: true, message: `Success: ${ordersCreatedCount} orders sent to Steadfast. ${skippedCount} skipped.` };
  } catch (e) {
    return { success: false, message: "System Error: " + e.toString() };
  }
}

function callSteadfastApi(payload, config) {
  const url = "https://portal.packzy.com/api/v1/create_order";
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { 'Api-Key': config.apiKey, 'Secret-Key': config.secretKey },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const content = res.getContentText();
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Steadfast API Parse Error: " + content);
    return { status: 500, message: content };
  }
}

function getSteadfastStoredConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    apiKey: props.getProperty('STEADFAST_API_KEY'),
    secretKey: props.getProperty('STEADFAST_SECRET_KEY')
  };
}

function saveSteadfastConfig(apiKey, secretKey) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('STEADFAST_API_KEY', apiKey);
    props.setProperty('STEADFAST_SECRET_KEY', secretKey);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getSteadfastConfig() {
  return getSteadfastStoredConfig();
}

function getBillingInventoryData() {
  const invSS = SpreadsheetApp.openById(INV_SS_ID);
  const sheet = invSS.getSheetByName("InventoryItems");
  const data = sheet.getDataRange().getValues();
  const skuMap = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][0]).trim();
    if (sku) skuMap[sku] = { name: data[i][2], price: parseFloat(data[i][4]) || 0 };
  }
  return { skuMap };
}

function getBillingInitialInvoiceNumber(sheet, colIdx) {
  const pref = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const data = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const val = String(data[i][colIdx]);
    if (val.startsWith(pref + "-")) max = Math.max(max, parseInt(val.split("-")[1]) || 0);
  }
  return max;
}

function writeBillingBulkData(ss, sheetName, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet || rows.length === 0) return;
  const existingData = sheet.getDataRange().getValues();
  const invoiceNumsToClean = [...new Set(rows.map(r => String(r[1])))];
  for (let i = existingData.length - 1; i >= 1; i--) {
    if (invoiceNumsToClean.includes(String(existingData[i][1]))) sheet.deleteRow(i + 1);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function getPathaoStoredConfig() {
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const metadata = ss.getDeveloperMetadata();
    const config = {};
    const prefix = "ASTEERA_CONFIG_";
    metadata.forEach(m => {
      const key = m.getKey();
      if (key.startsWith(prefix)) {
        const cleanKey = key.replace(prefix, "");
        if (cleanKey === "CLIENT_ID") config.clientId = m.getValue();
        if (cleanKey === "CLIENT_SECRET") config.clientSecret = m.getValue();
        if (cleanKey === "USERNAME") config.username = m.getValue();
        if (cleanKey === "PASSWORD") config.password = m.getValue();
        if (cleanKey === "BASE_URL") config.baseUrl = m.getValue();
        if (cleanKey === "STORE_ID") config.pathaoStoreId = m.getValue();
      }
    });
    if (config.clientId && config.pathaoStoreId) return config;
  } catch (e) {}

  const props = PropertiesService.getScriptProperties();
  return {
    clientId: props.getProperty('PATHAO_CLIENT_ID'),
    clientSecret: props.getProperty('PATHAO_CLIENT_SECRET'),
    username: props.getProperty('PATHAO_USERNAME'),
    password: props.getProperty('PATHAO_PASSWORD'),
    baseUrl: props.getProperty('PATHAO_BASE_URL'),
    pathaoStoreId: props.getProperty('PATHAO_STORE_ID')
  };
}
