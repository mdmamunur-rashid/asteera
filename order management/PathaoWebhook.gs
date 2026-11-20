/**
 * Pathao Webhook Integration for Google Sheets.
 */

const PATHAO_EVENT_TO_SHEET_STATUS_MAP = {
  "order.created": "Pathao Order Created",
  "order.updated": "Pathao Order Updated",
  "order.pickup-requested": "Pickup Requested",
  "order.assigned-for-pickup": "Assigned For Pickup",
  "order.picked": "Picked Up",
  "order.pickup-failed": "Pickup Failed",
  "order.pickup-cancelled": "Pickup Cancelled",
  "order.at-the-sorting-hub": "At Sorting Hub",
  "order.in-transit": "In Transit",
  "order.received-at-last-mile-hub": "Received at Last Mile Hub",
  "order.assigned-for-delivery": "Assigned for Delivery",
  "order.delivered": "Delivered",
  "order.partial-delivery": "Partial Delivery",
  "order.returned": "Returned",
  "order.delivery-failed": "Delivery Failed",
  "order.on-hold": "On Hold",
  "order.paid": "Payment Invoice",
  "order.paid-return": "Paid Return",
  "order.exchanged": "Exchanged"
};

const STEADFAST_STATUS_MAP = {
  "pending": "In Courier",
  "in_transit": "In Transit",
  "delivered": "Delivered",
  "partial_delivered": "Partial Delivery",
  "cancelled": "Delivery Failed",
  "hold": "On Hold",
  "returned": "Returned"
};

/**
 * Main Webhook Receiver
 */
function doPost(e) {
  // Set PATHAO_WEBHOOK_SECRET in Apps Script > Project Settings > Script properties.
  const secret = PropertiesService.getScriptProperties().getProperty('PATHAO_WEBHOOK_SECRET') || "";

  try {
    let payload;
    try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = {}; }
    
    // 1. LOG THE RESPONSE
    logPathaoResponse(payload);
    
    let consignmentId = payload.consignment_id;
    let newStatus = null;
    let courierType = "";

    // 2. DETECT COURIER TYPE
    if (payload.event) { 
      // PATHAO
      courierType = "Pathao";
      newStatus = PATHAO_EVENT_TO_SHEET_STATUS_MAP[payload.event];
    } else if (payload.status && payload.consignment_id) {
      // STEADFAST
      courierType = "Steadfast";
      newStatus = STEADFAST_STATUS_MAP[payload.status];
    }

    if (consignmentId && newStatus) {
      const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
      const sheet = ss.getSheetByName(TARGET_SHEET_NAME_ORDERS);
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const trackingColIdx = headers.indexOf(COURIER_TRACKING_NO_COL_NAME);
      const statusColIdx = headers.indexOf(ORDER_STATUS_COL_NAME);
      
      let rowToUpdate = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][trackingColIdx]) === String(consignmentId)) {
          rowToUpdate = i + 1;
          break;
        }
      }

      if (rowToUpdate !== -1) {
        sheet.getRange(rowToUpdate, statusColIdx + 1).setValue(newStatus);
        
        // 3. COPY TO RETURN ORDER SHEET IF APPLICABLE
        const isPathaoReturn = courierType === "Pathao" && ["order.returned", "order.paid-return", "order.partial-delivery"].includes(payload.event);
        const isSteadfastReturn = courierType === "Steadfast" && ["returned", "partial_delivered", "cancelled"].includes(payload.status);

        if (isPathaoReturn || isSteadfastReturn) {
          copyToReturnOrderSheet(ss, sheet, rowToUpdate, newStatus, payload);
        }

        if (typeof updateStatusSummary === 'function') updateStatusSummary();
      }
    }

    // 4. RETURN RESPONSE
    const response = { 
      "status": "success",
      "message": "Webhook received successfully."
    };
    if (courierType === "Pathao") {
      response["Asteera-Pathao-Merchant-Webhook-Integration-Secret"] = secret;
    }
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ "error": e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Copies order data to the "Return Order" sheet.
 */
function copyToReturnOrderSheet(ss, sourceSheet, rowIdx, newStatus, payload) {
  try {
    const RETURN_SHEET_NAME = "Return Order";
    let returnSheet = ss.getSheetByName(RETURN_SHEET_NAME);
    
    const headers = ["Query No", "Customer Name", "Phone", "Customer Address", "Product SKU", "Size", "Qty", "District", "Invoice No", "Courier Tracking", "Courier", "Order Value", "Return Cost", "Order Status", "Return Date", "Return SKU", "Receive Qty", "Return Receive Status", "Return Type"];
    
    if (!returnSheet) {
      returnSheet = ss.insertSheet(RETURN_SHEET_NAME);
      returnSheet.appendRow(headers);
      returnSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9ead3");
      returnSheet.setFrozenRows(1);
    }

    const sourceData = sourceSheet.getRange(rowIdx, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    const sourceHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    
    const getVal = (name) => {
      const idx = sourceHeaders.indexOf(name);
      return idx !== -1 ? sourceData[idx] : "";
    };

    const invoiceNo = String(getVal("Order Invoice No.") || "").trim();
    if (!invoiceNo) return;

    // --- CHECK FOR DUPLICATES ---
    const returnData = returnSheet.getDataRange().getValues();
    const returnHeaders = returnData[0];
    const invIdx = returnHeaders.indexOf("Invoice No");
    const statusIdx = returnHeaders.indexOf("Order Status");

    let existingRowIdx = -1;
    if (invIdx !== -1) {
      for (let i = 1; i < returnData.length; i++) {
        if (String(returnData[i][invIdx]).trim() === invoiceNo) {
          existingRowIdx = i + 1;
          break;
        }
      }
    }

    // If already exists, just update status and return
    if (existingRowIdx !== -1) {
      if (statusIdx !== -1) {
        returnSheet.getRange(existingRowIdx, statusIdx + 1).setValue(newStatus);
      }
      return;
    }

    // FIX: More robust return cost extraction from payload
    const returnCost = payload.return_charge || payload.delivery_fee || payload.return_fee || "";

    const rowData = [
      getVal("Query No"),
      getVal("Customer Name"),
      getVal("Phone"),
      getVal("Customer Address"),
      getVal("Product SKU"),
      getVal("Size"),
      getVal("Product QTY"),
      getVal("District"),
      invoiceNo,
      getVal("Courier Tracking No"),
      getVal("Delivery Method") || "Pathao",
      getVal("Product Price"),
      returnCost,
      newStatus,
      new Date(), 
      "", 
      "", 
      "Pending", 
      newStatus.includes("Partial") ? "Partial" : "Full"
    ];

    returnSheet.appendRow(rowData);
    returnSheet.getRange(returnSheet.getLastRow(), 15).setNumberFormat("dd-MMM-yyyy");
    
  } catch (e) {
    console.error("Error in copyToReturnOrderSheet: " + e.message);
  }
}

function logPathaoResponse(payload) {
  if (!payload || Object.keys(payload).length === 0) return;
  try {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
    let sheet = ss.getSheetByName("pathao responses") || ss.insertSheet("pathao responses");
    let headers = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : ["Log Date"];
    if (headers.length === 1) sheet.getRange(1,1).setValue("Log Date").setFontWeight("bold");

    const payloadKeys = Object.keys(payload);
    payloadKeys.forEach(key => {
      if (headers.indexOf(key) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(key).setFontWeight("bold").setBackground("#efefef");
        headers.push(key);
      }
    });

    const rowData = headers.map(h => h === "Log Date" ? new Date() : (payload[h] || ""));
    sheet.appendRow(rowData);
  } catch (err) {}
}
