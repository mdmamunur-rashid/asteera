/**
 * Opens the Print Preview dialog.
 */
function showPrintPreview() {
  const html = HtmlService.createTemplateFromFile('PrintPreview')
    .evaluate()
    .setWidth(850)
    .setHeight(700)
    .setTitle('Asteera - Invoice Print Queue');
  SpreadsheetApp.getUi().showModalDialog(html, 'Asteera - Invoice Print Queue');
}

/**
 * Fetches invoices for preview.
 * @param {boolean} showAll If true, returns all invoices. If false, only "Ready to Print".
 */
function getInvoicesForPreview(showAll = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const invoices = [];
  
  for (let i = 1; i < data.length; i++) {
    const status = data[i][7] ? data[i][7].toString() : "";
    const isReady = status.includes("Ready to Print");
    const isPrinted = status.includes("Printed");

    if (showAll || isReady) {
      invoices.push({
        row: i + 1,
        invoiceNo: data[i][1],
        customerName: data[i][2],
        products: data[i][3],
        link: data[i][6],
        status: isPrinted ? "Printed" : "Ready"
      });
    }
  }
  return invoices;
}

/**
 * Updates the local sheet status to "Printed".
 */
function markAsPrinted(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sheet) return;
  
  const timestamp = "Printed on " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yy 'at' hh:mm:ss a");
  const statusCell = sheet.getRange(row, 8);
  const richTextValue = statusCell.getRichTextValue();
  const currentLink = richTextValue ? richTextValue.getLinkUrl() : "";
  
  const newRichText = SpreadsheetApp.newRichTextValue()
    .setText(timestamp)
    .setLinkUrl(currentLink)
    .build();
    
  statusCell.setRichTextValue(newRichText);
  statusCell.setBackground("#d9ead3").setFontColor("#38761d");
  return true;
}

/**
 * Generates a merged A5 PDF containing all "Ready to Print" invoices.
 */
function generateBulkPDF() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const valuesSheet = ss.getSheetByName(CONFIG.VALUES_SHEET_NAME);
    const templateSheet = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
    const lookupSheet = ss.getSheetByName(CONFIG.LOOKUP_SHEET_NAME);

    const { skuMap, sizeMap } = getLookupData(lookupSheet);
    
    // Get col indices
    const headers = valuesSheet.getDataRange().getValues()[0];
    const lowerHeaders = headers.map(h => h.toString().toLowerCase().trim().replace(/\s+/g, ' '));
    const findColIdx = (name) => {
      const cleanName = name.toLowerCase().trim().replace(/\s+/g, ' ');
      return lowerHeaders.indexOf(cleanName);
    };
    const colIdx = {};
    [
      CONFIG.COL_ORDER_STATUS, CONFIG.COL_ORDER_INVOICE_NO, CONFIG.COL_CUSTOMER_NAME,
      CONFIG.COL_PHONE, CONFIG.COL_CUSTOMER_ADDRESS, CONFIG.COL_NOTE, CONFIG.COL_NOTE2,
      CONFIG.COL_PRODUCT_SKU, CONFIG.COL_PRODUCT_QTY, CONFIG.COL_PRODUCT_PRICE, CONFIG.COL_SIZE,
      CONFIG.COL_BILL_DATE, CONFIG.COL_DISCOUNT, CONFIG.COL_DELIVERY_CHARGE, CONFIG.COL_PAID
    ].forEach(headerName => {
      colIdx[headerName] = findColIdx(headerName);
    });

    const invoices = getInvoicesForPreview(false); // Only Ready items
    if (invoices.length === 0) return "No pending invoices to print.";
    
    const tempSS = SpreadsheetApp.create("Bulk_Print_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm"));
    const tempId = tempSS.getId();

    try {
      const values = valuesSheet.getDataRange().getValues();
      const invoiceMap = {};
      for (let i = 1; i < values.length; i++) {
        const invNo = String(values[i][colIdx[CONFIG.COL_ORDER_INVOICE_NO]]);
        if (invNo) invoiceMap[invNo] = values[i];
      }

      const usedNames = {};
      invoices.forEach((inv) => {
        const rowData = invoiceMap[inv.invoiceNo];
        if (rowData) {
          const newSheet = templateSheet.copyTo(tempSS);
          populateInvoiceTemplate(newSheet, rowData, colIdx, skuMap, sizeMap, inv.invoiceNo);
          
          let baseName = String(inv.invoiceNo).substring(0, 25);
          let finalName = baseName;
          if (usedNames[baseName]) {
            usedNames[baseName]++;
            finalName = baseName + "_" + usedNames[baseName];
          } else { usedNames[baseName] = 1; }
          newSheet.setName(finalName);
        }
      });

      SpreadsheetApp.flush();
      const firstSheet = tempSS.getSheetByName("Sheet1");
      if (firstSheet) tempSS.deleteSheet(firstSheet);

      // Export Parameters for A5 with Margins
      const url = "https://docs.google.com/spreadsheets/d/" + tempId + "/export?" +
                  "format=pdf&size=8&portrait=true&fitw=true&gridlines=false" +
                  "&top_margin=0.40&bottom_margin=0.40&left_margin=0.40&right_margin=0.40" +
                  "&horizontal_alignment=CENTER&printnotes=false";
      
      const token = ScriptApp.getOAuthToken();
      const response = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true });
      
      const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
      const pdfFile = parentFolder.createFile(response.getBlob().setName("Bulk_Invoices_" + Utilities.formatDate(new Date(), "GMT+6", "dd-MMM-yyyy") + ".pdf"));
      
      // Mark all as printed
      invoices.forEach(inv => markAsPrinted(inv.row));

      return pdfFile.getUrl();
    } finally {
      DriveApp.getFileById(tempId).setTrashed(true);
    }
  } catch (e) { return "Error: " + e.message; }
}
