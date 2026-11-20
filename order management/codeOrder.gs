

// AUTOMAS SMS CONFIGURATION
const AUTOMAS_CONFIG = {
  // Set SMS_API_KEY in Apps Script > Project Settings > Script properties.
  get API_KEY() { return PropertiesService.getScriptProperties().getProperty('SMS_API_KEY'); },
  SENDER: "8809617171817",
  ENDPOINT: "https://api.automas.com.bd/smsapiv3"
};

/**
 * Dedicated trigger for Order Management sheet.
 * Handles single edits and bulk pastes.
 */
function authorizedOnEdit(e) {
  if (!e || !e.source) return;
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();

  if (sheetName === "Return Order") {
    if (typeof handleReturnSheetEdit === 'function') handleReturnSheetEdit(e);
    return;
  }

  if (sheetName !== "Dress Query/Order") return;

  const range = e.range;
  const startRow = range.getRow();
  if (startRow <= 1) return; 

  const numRows = range.getNumRows();
  const numCols = range.getNumColumns();
  const lastCol = sheet.getLastColumn();
  
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const lowerHeaders = headers.map(h => h.toString().toLowerCase().trim().replace(/\s+/g, ' '));
  
  const findCol = (name) => {
    const searchName = name.toLowerCase().trim().replace(/\s+/g, ' ');
    const idx = lowerHeaders.indexOf(searchName);
    return idx !== -1 ? idx + 1 : 0;
  };

  const col = {
    queryNo: 1, 
    address: findCol("Customer Address"),
    phone: findCol("Phone"),
    district: findCol("District"),
    deliveryCharge: findCol("Delivery Charge"),
    productSku: findCol("Product SKU"),
    productNameList: findCol("Product Name List"),
    productQty: findCol("Product QTY"),
    productPrice: findCol("Product Price"), 
    discount: findCol("Discount"),
    paid: findCol("Paid"),
    cod: findCol("COD"),
    customerName: findCol("Customer Name"),
    orderStatus: findCol("Order Status"),
    size: findCol("Size"),
    invoiceNo: findCol("Order Invoice No."),
    pageName: findCol("Page Name"),
    deliveryMethod: findCol("Delivery Method")
  };

  const editedCols = [];
  const startCol = range.getColumn();
  for (let c = 0; c < numCols; c++) { editedCols.push(startCol + c); }
  
  const targetCols = [
    col.address, col.district, col.productPrice, col.deliveryCharge, 
    col.paid, col.productSku, col.productQty, col.orderStatus, col.cod, col.size
  ];
  if (!editedCols.some(c => targetCols.includes(c))) return;

  const invCache = getInventoryCache();
  const rowDataRange = sheet.getRange(startRow, 1, numRows, lastCol);
  const rowData = rowDataRange.getValues();
  const backgroundData = rowDataRange.getBackgrounds();

  let billedRowsEdited = [];
  let needsStatusSummaryUpdate = false;
  let updateCount = 0;
  let smsCount = 0;

  for (let i = 0; i < numRows; i++) {
    const rowIdxInSheet = startRow + i;
    const currentRow = rowData[i];
    
    const getVal = (cIdx) => cIdx > 0 ? currentRow[cIdx - 1] : "";
    const getFloatVal = (cIdx) => cIdx > 0 ? parseFloat(currentRow[cIdx - 1]) || 0 : 0;
    const setVal = (cIdx, val) => { if (cIdx > 0) { currentRow[cIdx - 1] = val; updateCount++; } };

    const currentStatus = String(getVal(col.orderStatus)).trim();
    const isStatusChange = editedCols.includes(col.orderStatus);

    // RESTRICTION: Skip if Billed, UNLESS we are specifically changing the status to "In Courier"
    if (currentStatus === "Billed" && !isStatusChange) {
      billedRowsEdited.push(rowIdxInSheet);
      continue; 
    }
    
    const nameVal = String(getVal(col.customerName)).trim();
    const skuValCheck = String(getVal(col.productSku)).trim();
    if (!nameVal && !skuValCheck) continue;

    setVal(col.queryNo, rowIdxInSheet - 1);

    if (editedCols.includes(col.address)) {
      const addr = getVal(col.address);
      const district = findDistrictInAddress(addr);
      if (district && col.district > 0) {
        setVal(col.district, district);
        setVal(col.deliveryCharge, (district.toLowerCase().includes("dhaka")) ? 70 : 130);
      }
    }
    
    if (editedCols.includes(col.district)) {
      const district = String(getVal(col.district)).toLowerCase();
      setVal(col.deliveryCharge, (district.includes("dhaka")) ? 70 : 130);
    }

    if (editedCols.includes(col.orderStatus)) {
      const newStatus = String(getVal(col.orderStatus)).trim();
      needsStatusSummaryUpdate = true;

      // --- TRIGGER SMS ON "In Courier" ---
      if (newStatus === "In Courier") {
        const phone = String(getVal(col.phone)).trim();
        const name = String(getVal(col.customerName)).trim().toUpperCase();
        const codAmount = getVal(col.cod);
        const courierMethod = String(getVal(col.deliveryMethod) || "courier").toLowerCase();
        const pageName = getVal(col.pageName) || "Asteera";

        if (phone && phone.length >= 10) {
          const callCenter = getBrandingPhone(pageName);
          const smsMessage = `Dear ${name}!\nYour order has been shift to ${courierMethod} courier.\nAmount: ${codAmount}\nCall Center: ${callCenter}\nThanks\n${pageName}`;
          const sent = sendAsteeraSMS(phone, smsMessage);
          if (sent) smsCount++;
        }
      }

      const returnStatuses = ["Returned", "Partial Delivery", "Paid Return"];
      if (returnStatuses.includes(newStatus)) {
        if (typeof copyToReturnOrderSheet === 'function') {
          copyToReturnOrderSheet(e.source, sheet, rowIdxInSheet, newStatus, {});
        }
      }
    }

    const pricingRelated = [col.productPrice, col.deliveryCharge, col.paid, col.productSku, col.productQty, col.orderStatus, col.cod, col.district, col.address];
    if (editedCols.some(c => pricingRelated.includes(c))) {
      
      if (editedCols.includes(col.productSku) && col.productNameList > 0) {
        const skuVal = String(getVal(col.productSku)).trim();
        if (skuVal) {
          const skus = skuVal.split(/[,\/]+/).map(s => s.trim()).filter(s => s !== "");
          setVal(col.productNameList, skus.map(s => invCache.names[s] || ("Unknown SKU: " + s)).join("/ "));
        } else {
          setVal(col.productNameList, "");
        }
      }

      const skuVal = String(getVal(col.productSku)).trim();
      const qtyVal = String(getVal(col.productQty)).trim() || "1";
      const { subtotal, hasQtyError } = calculateInMemSubtotal(skuVal, qtyVal, invCache.prices);

      if (col.productQty > 0) backgroundData[i][col.productQty - 1] = hasQtyError ? "#f4cccc" : null;

      if (subtotal !== null) {
        const pPrice = getFloatVal(col.productPrice), dCharge = getFloatVal(col.deliveryCharge), paid = getFloatVal(col.paid);
        if (col.discount > 0) setVal(col.discount, Math.max(0, (subtotal + dCharge) - pPrice));
        if (col.cod > 0 && !editedCols.includes(col.cod)) setVal(col.cod, pPrice - paid);
      }
    }

    if (editedCols.some(c => [col.productSku, col.size, col.orderStatus].includes(c))) needsStatusSummaryUpdate = true;
  }

  if (updateCount > 0) {
    rowDataRange.setValues(rowData);
    rowDataRange.setBackgrounds(backgroundData);
  }

  if (smsCount > 0) {
    e.source.toast(`Successfully sent ${smsCount} SMS notification(s).`, "SMS Status", 5);
  }

  if (needsStatusSummaryUpdate && typeof updateStatusSummary === 'function') updateStatusSummary();

  if (billedRowsEdited.length > 0) {
    SpreadsheetApp.getUi().alert("🛑 CRITICAL WARNING: Billed Rows Modified\n\nRows: " + billedRowsEdited.join(", ") + " are already 'Billed'.\nAutomation skipped to protect data.");
  }
}

/**
 * Returns the phone number for a given page name from the Brandings sheet.
 * Falls back to the default Asteera call centre if not found.
 */
function getBrandingPhone(pageName) {
  const DEFAULT_PHONE = "01821155665";
  try {
    const sheet = SpreadsheetApp.openById(INV_SS_ID).getSheetByName("Brandings");
    if (!sheet) return DEFAULT_PHONE;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === pageName && data[i][3]) {
        return String(data[i][3]).trim();
      }
    }
  } catch (e) {
    console.error("getBrandingPhone error: " + e.toString());
  }
  return DEFAULT_PHONE;
}

/**
 * Sends SMS via Automas API
 */
function sendAsteeraSMS(number, message) {
  if (!number || !message) return false;
  let formattedNumber = String(number).trim().replace(/[^\d]/g, '');
  if (!formattedNumber.startsWith('88')) formattedNumber = '88' + (formattedNumber.startsWith('0') ? formattedNumber : '0' + formattedNumber);

  const url = `${AUTOMAS_CONFIG.ENDPOINT}?apikey=${AUTOMAS_CONFIG.API_KEY}&sender=${AUTOMAS_CONFIG.SENDER}&msisdn=${formattedNumber}&smstext=${encodeURIComponent(message)}`;

  try {
    const response = UrlFetchApp.fetch(url, { "method": "get", "muteHttpExceptions": true });
    const resText = response.getContentText();
    console.log("Automas Response: " + resText);
    return response.getResponseCode() === 200;
  } catch (e) { 
    console.error("Automas Error: " + e.toString()); 
    return false;
  }
}

function getInventoryCache() {
  const cache = { names: {}, prices: {} };
  try {
    const invSS = SpreadsheetApp.openById(INV_SS_ID);
    const invSheet = invSS.getSheetByName("InventoryItems");
    if (!invSheet) return cache;
    const data = invSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) { 
      const sku = String(data[i][0]).trim();
      if (sku) { cache.names[sku] = String(data[i][2]); cache.prices[sku] = parseFloat(data[i][4]) || 0; }
    }
  } catch (e) { console.error("Cache Error: " + e.message); }
  return cache;
}

function calculateInMemSubtotal(skuVal, qtyVal, priceMap) {
  if (!skuVal) return { subtotal: 0, hasQtyError: false };
  const splitRegex = /[,\n\r;\/]+/;
  const skus = skuVal.split(splitRegex).map(s => s.trim()).filter(s => s !== "");
  if (skus.length === 0) return { subtotal: 0, hasQtyError: false };
  const rawQtys = qtyVal.split(splitRegex).map(q => q.trim()).filter(q => q !== "");
  let qtys = [], hasQtyError = false;
  if (rawQtys.length <= 1) {
    const totalQty = parseInt(rawQtys[0]) || skus.length;
    if (totalQty % skus.length !== 0) { hasQtyError = true; qtys = skus.map(() => 1); }
    else qtys = skus.map(() => totalQty / skus.length);
  } else qtys = skus.map((_, i) => parseInt(rawQtys[i]) || 0);
  let subtotal = 0;
  skus.forEach((sku, i) => { if (priceMap.hasOwnProperty(sku)) subtotal += priceMap[sku] * (qtys[i] || 0); });
  return { subtotal, hasQtyError };
}

function findDistrictInAddress(address) {
  if (!address) return null;
  const cities = ["Dhaka", "Chittagong", "Rajshahi", "Khulna", "Barisal", "Sylhet", "Rangpur", "Mymensingh", "Gazipur", "Narayanganj"];
  const addr = address.toString().toLowerCase();
  for (const city of cities) { if (addr.includes(city.toLowerCase())) return city; }
  return null;
}
