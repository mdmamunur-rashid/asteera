/**
 * Steadfast Courier Integration for Google Sheets.
 */

// Configuration Keys
const STEADFAST_API_KEY_PROPERTY = 'STEADFAST_API_KEY';
const STEADFAST_SECRET_KEY_PROPERTY = 'STEADFAST_SECRET_KEY';
const STEADFAST_BASE_URL = 'https://portal.packzy.com/api/v1';

/**
 * Main function to generate Steadfast orders for rows with "Billed" status.
 */
function generateSteadfastOrders() {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    console.log("ERP Context: UI not available.");
  }
  
  const config = getSteadfastConfig();

  if (!config.apiKey || !config.secretKey) {
    if (ui) ui.alert('Configuration Error', 'Steadfast API Key or Secret Key is missing. Please configure them in the sidebar.', ui.ButtonSet.OK);
    return { success: false, message: "Steadfast credentials missing." };
  }

  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
  const sheet = ss.getSheetByName(TARGET_SHEET_NAME_ORDERS);

  if (!sheet) {
    if (ui) ui.alert('Sheet Error', `Sheet "${TARGET_SHEET_NAME_ORDERS}" not found.`, ui.ButtonSet.OK);
    return { success: false, message: "Sheet not found." };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const orderStatusColIdx = getColumnIndexByName(headers, ORDER_STATUS_COL_NAME);
  const orderInvoiceNoColIdx = getColumnIndexByName(headers, ORDER_INVOICE_NO_COL_NAME);
  const customerNameColIdx = getColumnIndexByName(headers, CUSTOMER_NAME_COL_NAME);
  const phoneColIdx = getColumnIndexByName(headers, PHONE_COL_NAME);
  const customerAddressColIdx = getColumnIndexByName(headers, CUSTOMER_ADDRESS_COL_NAME);
  const productSkuColIdx = getColumnIndexByName(headers, PRODUCT_SKU_COL_NAME);
  const productQtyColIdx = getColumnIndexByName(headers, PRODUCT_QTY_COL_NAME);
  const productPriceColIdx = getColumnIndexByName(headers, PRODUCT_PRICE_COL_NAME);
  const noteColIdx = getColumnIndexByName(headers, NOTE_COL_NAME);
  const courierTrackingNoColIdx = getColumnIndexByName(headers, COURIER_TRACKING_NO_COL_NAME);
  const codColIdx = getColumnIndexByName(headers, COD_COL_NAME);
  const deliveryMethodColIdx = getColumnIndexByName(headers, DELIVERY_METHOD_COL_NAME);
  const paymentStatusColIdx = getColumnIndexByName(headers, PAYMENT_STATUS_COL_NAME);
  const pageNameColIdx = getColumnIndexByName(headers, "Page Name");

  let ordersCreatedCount = 0;
  let skippedCount = 0;
  const rowsToUpdate = [];

  for (let i = 1; i < values.length; i++) {
    const rowData = values[i];
    const orderStatus = rowData[orderStatusColIdx];
    const courierTrackingNo = rowData[courierTrackingNoColIdx];
    const deliveryMethod = String(rowData[deliveryMethodColIdx] || "").trim().toLowerCase();

    if (orderStatus === ORDER_STATUS_BILLED && (!courierTrackingNo || courierTrackingNo.toString().trim() === '')) {
      
      if (deliveryMethod !== "steadfast") {
        skippedCount++;
        continue;
      }

      const invoiceNo = rowData[orderInvoiceNoColIdx];
      const recipientName = rowData[customerNameColIdx];
      let recipientPhone = rowData[phoneColIdx].toString().replace(/[^0-9]/g, '');
      if (recipientPhone.length === 10 && !recipientPhone.startsWith('0')) recipientPhone = '0' + recipientPhone;
      if (recipientPhone.length > 11) recipientPhone = recipientPhone.substring(recipientPhone.length - 11);
      
      const recipientAddress = rowData[customerAddressColIdx];
      const productSku = rowData[productSkuColIdx];
      const productQty = rowData[productQtyColIdx];
      const productPrice = rowData[productPriceColIdx];
      const note = rowData[noteColIdx];
      const codValue = parseFloat(rowData[codColIdx]) || 0;
      const pageName = pageNameColIdx !== -1 ? rowData[pageNameColIdx] : "Asteera";

      const itemDescription = `SKU: ${productSku}, Qty: ${productQty}, Price: ${productPrice}`;
      const finalNote = note ? `${note} | ${itemDescription}` : itemDescription;

      const orderPayload = {
        invoice: invoiceNo.toString(),
        recipient_name: recipientName.toString(),
        recipient_phone: recipientPhone,
        recipient_address: recipientAddress.toString(),
        cod_amount: Math.round(codValue),
        note: finalNote
      };

      try {
        const response = createSteadfastOrder(orderPayload, config);
        if (response && response.status === 200 && response.consignment) {
          const consignmentId = response.consignment.consignment_id;
          const paymentStatus = codValue > 0 ? PAYMENT_STATUS_COD : PAYMENT_STATUS_PAID;
          rowsToUpdate.push({ 
            row: i + 1, 
            status: ORDER_STATUS_IN_COURIER, 
            trackingNo: consignmentId, 
            paymentStatus: paymentStatus 
          });
          ordersCreatedCount++;

          // --- TRIGGER SMS NOTIFICATION ---
          if (typeof sendAsteeraSMS === 'function') {
            const callCenter = getBrandingPhone(pageName);
            const smsMessage = `Dear ${recipientName.toString().toUpperCase()}!\nYour order has been shift to steadfast courier.\nAmount: ${Math.round(codValue)}\nCall Center: ${callCenter}\nThanks\n${pageName}`;
            sendAsteeraSMS(recipientPhone, smsMessage);
          }
        } else {
          const errMsg = response ? response.errors || response.message : "Unknown error";
          rowsToUpdate.push({ 
            row: i + 1, 
            status: "Hold", 
            trackingNo: "Error: " + JSON.stringify(errMsg) 
          });
        }
        
        // ADDED DELAY TO PREVENT RATE LIMITING
        Utilities.sleep(500);

      } catch (e) {
        rowsToUpdate.push({ row: i + 1, status: "Hold", trackingNo: "API Error: " + e.message });
      }
    }
  }

  // Update Sheet
  for (const update of rowsToUpdate) {
    sheet.getRange(update.row, orderStatusColIdx + 1).setValue(update.status);
    sheet.getRange(update.row, courierTrackingNoColIdx + 1).setValue(update.trackingNo);
    if (update.paymentStatus) {
      sheet.getRange(update.row, paymentStatusColIdx + 1).setValue(update.paymentStatus);
    }
  }

  if (ordersCreatedCount > 0 && typeof updateStatusSummary === 'function') {
    updateStatusSummary();
  }

  if (ui) ui.alert('Steadfast Integration', `Created: ${ordersCreatedCount}\nSkipped: ${skippedCount}`, ui.ButtonSet.OK);
  return { success: true, message: `Created: ${ordersCreatedCount}, Skipped: ${skippedCount}` };
}

/**
 * API Call to Steadfast
 */
function createSteadfastOrder(payload, config) {
  const url = `${STEADFAST_BASE_URL}/create_order`;
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Api-Key': config.apiKey,
      'Secret-Key': config.secretKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const content = response.getContentText();
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Steadfast API JSON Parse Error. Raw Content: " + content);
    return { status: 500, message: "Non-JSON response from API: " + content };
  }
}

function getSteadfastConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    apiKey: props.getProperty(STEADFAST_API_KEY_PROPERTY),
    secretKey: props.getProperty(STEADFAST_SECRET_KEY_PROPERTY)
  };
}

function saveSteadfastConfig(apiKey, secretKey) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(STEADFAST_API_KEY_PROPERTY, apiKey);
  props.setProperty(STEADFAST_SECRET_KEY_PROPERTY, secretKey);
  return true;
}

function showSteadfastConfigSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('SteadfastConfig')
      .setTitle('Steadfast API Configuration')
      .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}
