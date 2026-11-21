var INV_SS_ID = "1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo";
var ORDER_SS_ID = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";

/**
 * MANDATORY PERMISSIONS:
 * The following scopes are required for Pathao integration and URL Fetch.
 * If you see a permission error, please run any function (like doGet) 
 * once manually in the script editor to trigger the authorization popup.
 * 
 * @OnlyCurrentDoc
 * @ScriptAttribute { "permissions": [ "https://www.googleapis.com/auth/script.external_request", "https://www.googleapis.com/auth/spreadsheets" ] }
 */

/**
 * RUN THIS FUNCTION MANUALLY IN THE SCRIPT EDITOR
 * IF YOU SEE A PERMISSION ERROR.
 * It forces Google to show the "Review Permissions" popup.
 */
function TRIGGER_PERMISSION_POPUP() {
  const response = UrlFetchApp.fetch("https://www.google.com");
  Logger.log("Response Code: " + response.getResponseCode());
  Logger.log("Permission Granted successfully!");
}

function doGet(e) {
  if (!e || !e.parameter) {
    return HtmlService.createHtmlOutput("<h2>Error</h2><p>No data provided. This function should not be run manually.</p>");
  }

  try {
    initializeSheets();
    var page = e.parameter.page || 'dashboard';
    var logoUrl = "https://lh3.googleusercontent.com/d/1sxBW7iWGbmNx40M0NonM8u8pa68KYhZg";
    if (page === 'login') return HtmlService.createTemplateFromFile('login').evaluate().setTitle('ASTEERA - Login').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    if (['invoice', 'po_invoice', 'bulk_print', 'expense_report'].includes(page)) {
      var t = HtmlService.createTemplateFromFile(page);
      t.logo = logoUrl;
      t.forceBrand = e.parameter.forceBrand || "";
      if (page === 'invoice') t.soId = e.parameter.soId;
      if (page === 'po_invoice') t.poId = e.parameter.poId;
      if (page === 'bulk_print') {
        t.type = e.parameter.type;
        t.selectedIds = e.parameter.selectedIds || "";
      }
      return t.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    var template = HtmlService.createTemplateFromFile('template');
    template.logo = logoUrl; template.page = page; template.scriptUrl = getScriptUrl();
    return template.evaluate()
      .setTitle('ASTEERA ERP')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) { return HtmlService.createHtmlOutput("<h2>Launch Error</h2><p>" + err.toString() + "</p>"); }
}

/**
 * UPDATED EXPENSE LOGIC (10 Columns)
 */
function submitExpense(data) {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Expenses");
    var datePrefix = "EXP-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd");
    var existingRows = sheet.getDataRange().getValues();
    var maxSeq = 0;
    for (var i = 1; i < existingRows.length; i++) {
      var id = String(existingRows[i][0]);
      if (id.startsWith(datePrefix)) {
        var seq = parseInt(id.split("-")[2]) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    var newId = datePrefix + "-" + String(maxSeq + 1).padStart(3, '0');

    // Headers: Sl(0), Date(1), Category(2), For(3), Amount(4), Note(5), CreatedBy(6), Status(7), ActionBy(8), ActionDate(9)
    sheet.appendRow([
      newId, data.date, data.category, data.expenseFor, data.amount, 
      data.note, data.submittedBy, "Pending", "", ""
    ]);
    
    // RETURN UPDATED LIST
    return { success: true, updatedList: getExpenseList() };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getInventoryImageMap() {
  try {
    const ss = SpreadsheetApp.openById(INV_SS_ID);
    const sheet = ss.getSheetByName("InventoryItems");
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const imgIdx = headers.indexOf("Image");
    if (imgIdx === -1) return {};
    
    const map = {};
    for (let i = 1; i < data.length; i++) {
      const sku = String(data[i][0]).trim();
      if (sku) map[sku] = String(data[i][imgIdx] || "");
    }
    return map;
  } catch (e) {
    console.error("Error fetching image map: " + e.message);
    return {};
  }
}

function getExpenseList() {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Expenses");
    if (!sheet) {
      console.error("Sheet 'Expenses' not found");
      return [];
    }
    var data = sheet.getDataRange().getValues();
    var res = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue; // Skip empty rows
      res.push({
        id: String(data[i][0]).trim(), // Sl
        date: data[i][1] instanceof Date ? Utilities.formatDate(data[i][1], Session.getScriptTimeZone(), "dd-MMM-yy") : String(data[i][1] || "").trim(),
        category: String(data[i][2] || "").trim(), // Category
        expenseFor: String(data[i][3] || "").trim(), // For
        amount: data[i][4], // Amount
        note: String(data[i][5] || "").trim(), // Note
        submittedBy: String(data[i][6] || "").trim(), // Created By(Name) - Col G
        status: String(data[i][7] || "Pending").trim(), // Status - Col H
        approvedBy: String(data[i][8] || "-").trim() // Action by(Name) - Col I
      });
    }
    return res.reverse();
  } catch (e) { 
    console.error("getExpenseList error: " + e.toString());
    return []; 
  }
}


function updateExpense(data) {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Expenses");
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === data.id) {
        // Sl(0), Date(1), Category(2), For(3), Amount(4), Note(5)
        sheet.getRange(i + 1, 2).setValue(data.date);
        sheet.getRange(i + 1, 3).setValue(data.category);
        sheet.getRange(i + 1, 4).setValue(data.expenseFor);
        sheet.getRange(i + 1, 5).setValue(data.amount);
        sheet.getRange(i + 1, 6).setValue(data.note);
        return { success: true, updatedList: getExpenseList() };
      }
    }
    return { success: false, message: "Expense ID not found." };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteExpense(id) {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Expenses");
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        sheet.deleteRow(i + 1);
        return { success: true, updatedList: getExpenseList() };
      }
    }
    return { success: false, message: "Expense ID not found." };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateExpenseStatus(id, status, adminName) {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Expenses");
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        // Col 8: ActionBy, Col 9: ActionDate
        sheet.getRange(i + 1, 8).setValue(status);
        sheet.getRange(i + 1, 9).setValue(adminName);
        sheet.getRange(i + 1, 10).setValue(new Date());
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) { return { success: false }; }
}

/**
 * Normalizes any Google Drive image reference (share link, uc link,
 * or bare file ID) into the "lh3.googleusercontent.com/d/<ID>" form,
 * which is the format that reliably renders inside <img> tags.
 * Non-Drive URLs (e.g. other CDNs) are returned unchanged.
 */
function resolveDriveImageUrl_(raw) {
  var url = String(raw || "").trim();
  if (!url) return "";
  if (url.indexOf("lh3.googleusercontent.com") !== -1) return url;

  var m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return "https://lh3.googleusercontent.com/d/" + m[1];

  // Bare file ID pasted directly (no URL wrapper)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(url)) return "https://lh3.googleusercontent.com/d/" + url;

  return url; // already a direct image URL from elsewhere
}

function getBrandings() {
  try {
    var ss = SpreadsheetApp.openById(INV_SS_ID);
    var sheet = ss.getSheetByName("Brandings");
    if (!sheet) {
      return [{
        name: "Asteera",
        address: "1038, Monipur, Mirpur Model, Dhaka 1216\nMalibag office: 926, Malibag, Dhaka 1217\n+8801821155665 | support@asteera.com",
        logo: "https://lh3.googleusercontent.com/d/1sxBW7iWGbmNx40M0NonM8u8pa68KYhZg",
        phone: "01821155665"
      }];
    }
    var data = sheet.getDataRange().getValues();
    var brandings = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) {
        brandings.push({
          name: String(data[i][0]).trim(),
          address: String(data[i][1] || "").trim(),
          logo: resolveDriveImageUrl_(data[i][2]),
          phone: String(data[i][3] || "").trim()
        });
      }
    }
    return brandings;
  } catch (e) {
    console.error("Error fetching brandings: " + e.toString());
    return [];
  }
}

function initializeSheets() {
  var ss = SpreadsheetApp.openById(INV_SS_ID);
  
  // Brandings Init
  var brandSheet = ss.getSheetByName("Brandings");
  if (!brandSheet) {
    brandSheet = ss.insertSheet("Brandings");
    brandSheet.appendRow(["Page name", "address", "logo", "phone"]);
    brandSheet.appendRow(["Asteera", "1038, Monipur, Mirpur Model, Dhaka 1216\nMalibag office: 926, Malibag, Dhaka 1217\n+8801821155665 | support@asteera.com", "https://lh3.googleusercontent.com/d/1sxBW7iWGbmNx40M0NonM8u8pa68KYhZg", "01821155665"]);
    brandSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#efefef");
  }

  // SalesDetails Init
  var oss = SpreadsheetApp.openById(ORDER_SS_ID);
  var sdSheet = oss.getSheetByName("SalesDetails");
  var sdHeaders = ["Date", "Invoice Num", "Customer Name", "Phone", "Address", "SKU", "Size", "Product Name", "Qty", "Price", "Delivery", "Discount", "Total", "Sold Price", "Note", "Printed"];
  if (!sdSheet) {
    sdSheet = oss.insertSheet("SalesDetails");
    sdSheet.appendRow(sdHeaders);
    sdSheet.getRange(1, 1, 1, sdHeaders.length).setFontWeight("bold").setBackground("#efefef");
  } else {
    // Re-verify headers structure
    sdSheet.getRange(1, 1, 1, 16).setValues([sdHeaders]);
  }

  var expSheet = ss.getSheetByName("Expenses");
  var expHeaders = ["Sl", "Date", "Expense Category", "Expense For", "Expense Amount", "Note", "Created By(Name)", "Status", "Action by(Name)", "Action Date"];
  if (!expSheet) {
    expSheet = ss.insertSheet("Expenses");
    expSheet.appendRow(expHeaders);
    expSheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#efefef");
  } else {
    expSheet.getRange(1, 1, 1, 10).setValues([expHeaders]);
  }
  // ... other inits ...
  if (!ss.getSheetByName("Users")) { var u = ss.insertSheet("Users"); u.appendRow(["Email", "Phone", "Name", "Profile photo", "Role", "Password", "Status"]); u.appendRow(["admin@asteera.com", "01821155665", "Asteera Admin", "", "Admin", "admin123", "Active"]); }
  var r = ss.getSheetByName("RoleManagement");
  if (!r) {
    r = ss.insertSheet("RoleManagement");
    r.appendRow(["Admin", "Employee", "Moderator", "User"]);
    r.getRange(2, 1, 8, 4).setValues([
      ["dashboard", "dashboard", "dashboard", "dashboard"],
      ["inventory", "inventory", "sales", "profile"],
      ["suppliers", "sales", "profile", "expenses"],
      ["purchases", "profile", "expenses", ""],
      ["sales", "expenses", "orders", ""],
      ["orders", "", "", ""],
      ["profile", "", "", ""],
      ["expenses", "", "", ""]
    ]);
  } else {
    // Ensure "orders" exists in the Admin column (Column 1)
    var adminPerms = r.getRange(2, 1, r.getLastRow(), 1).getValues().flat().map(v => String(v).toLowerCase());
    if (adminPerms.indexOf("orders") === -1) {
      r.getRange(r.getLastRow() + 1, 1).setValue("orders");
    }
  }
  r.getRange("A2:Z50").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["dashboard", "inventory", "suppliers", "purchases", "sales", "orders", "profile", "expenses"]).setAllowInvalid(false).build());
}

function getPageHTML(pageName, userEmail) { try { var u = getUserFullData(userEmail); if (!u || u.status !== "Active") return "SESSION_EXPIRED"; var t = HtmlService.createTemplateFromFile(pageName); t.logo = "https://lh3.googleusercontent.com/d/1sxBW7iWGbmNx40M0NonM8u8pa68KYhZg"; t.page = pageName; t.scriptUrl = getScriptUrl(); t.userRole = u.role; t.userEmail = userEmail; t.userName = u.name; return t.evaluate().getContent(); } catch (e) { return "<h3>Failed</h3>"; } }
function getUserFullData(email) { if (!email) return null; var ss = SpreadsheetApp.openById(INV_SS_ID); var sheet = ss.getSheetByName("Users"); var data = sheet.getDataRange().getValues(); for (var i = 1; i < data.length; i++) { if (String(data[i][0]).toLowerCase() === email.toLowerCase()) return { name: data[i][2], role: data[i][4], status: data[i][6] }; } return null; }
function getPermissionsForRole(roleName) { try { var ss = SpreadsheetApp.openById(INV_SS_ID); var rs = ss.getSheetByName("RoleManagement"); if (!rs) return ["dashboard", "profile"]; var data = rs.getDataRange().getValues(); var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); }); var colIdx = headers.indexOf(roleName.toLowerCase()); if (colIdx === -1) return ["dashboard", "profile"]; var allowed = []; for (var i = 1; i < data.length; i++) { var val = String(data[i][colIdx]).trim().toLowerCase(); if (val) { if (val === "expences") val = "expenses"; allowed.push(val); } } return allowed; } catch (e) { return ["dashboard", "profile"]; } }
function getLatestUserSession(email) { var u = getUserFullData(email); if (!u) return null; return { email: email, role: u.role, permissions: getPermissionsForRole(u.role) }; }
function getDashboardData(startStr, endStr) {
  try {
    var invSS = SpreadsheetApp.openById(INV_SS_ID);
    var ordSS = SpreadsheetApp.openById(ORDER_SS_ID);
    
    var invSheet = invSS.getSheetByName("InventoryItems");
    var sdSheet = ordSS.getSheetByName("SalesDetails");
    var expSheet = invSS.getSheetByName("Expenses");
    var masterSheet = ordSS.getSheetByName("Dress Query/Order");

    var stats = {
      stockValue: 0,
      totalSalesValue: 0,
      totalPurchaseValue: 0,
      totalExpenses: 0,
      profitLoss: 0,
      lowStockCount: 0,
      pendingInvoices: 0,
      lowStockItems: []
    };

    var startDate = startStr ? new Date(startStr + "T00:00:00") : null;
    var endDate = endStr ? new Date(endStr + "T23:59:59") : null;

    // 1. Calculate Stock Value (Remaining Qty * P.Price) - Not affected by date filter
    if (invSheet) {
      var invData = invSheet.getDataRange().getValues();
      for (var i = 1; i < invData.length; i++) {
        var pPrice = parseFloat(invData[i][3]) || 0;
        var remaining = parseFloat(invData[i][7]) || 0;
        var status = String(invData[i][8] || "").toUpperCase();
        
        if (remaining > 0) stats.stockValue += (remaining * pPrice);
        
        if (invData[i][0] && status === "YES") {
          stats.lowStockCount++;
          stats.lowStockItems.push({ sku: invData[i][0], name: invData[i][2], qty: remaining });
        }
      }
    }

    // 2. Calculate Total Sales Value & COGS (Purchase Cost of Sold Items)
    if (sdSheet) {
      var sdData = sdSheet.getDataRange().getValues();
      // Headers: Date(0), ... SKU(5), ... SoldPrice(13), Status(14)
      
      // Get P.Price Map for COGS
      var pPriceMap = {};
      if (invSheet) {
        var invData = invSheet.getDataRange().getValues();
        for (var i = 1; i < invData.length; i++) { pPriceMap[String(invData[i][0])] = parseFloat(invData[i][3]) || 0; }
      }

      for (var i = 1; i < sdData.length; i++) {
        var rowDate = sdData[i][0] instanceof Date ? sdData[i][0] : new Date(sdData[i][0]);
        if (startDate && rowDate < startDate) continue;
        if (endDate && rowDate > endDate) continue;

        var soldPrice = parseFloat(sdData[i][13]) || 0;
        var sku = String(sdData[i][5]);
        var qty = parseFloat(sdData[i][8]) || 0;
        var status = String(sdData[i][14] || "").toLowerCase();
        
        // Exclude Returned items from math
        if (!status.includes("returned") && !status.includes("rejected")) {
          stats.totalSalesValue += soldPrice;
          stats.totalPurchaseValue += (pPriceMap[sku] || 0) * qty;
        }
      }
    }

    // 3. Calculate Total Expenses (Approved only)
    if (expSheet) {
      var expData = expSheet.getDataRange().getValues();
      // Date(1), Category(2), ... Amount(4), ... Status(7)
      for (var i = 1; i < expData.length; i++) {
        var rowDate = expData[i][1] instanceof Date ? expData[i][1] : new Date(expData[i][1]);
        if (startDate && rowDate < startDate) continue;
        if (endDate && rowDate > endDate) continue;

        if (String(expData[i][7]) === "Approved") {
          stats.totalExpenses += parseFloat(expData[i][4]) || 0;
        }
      }
    }

    // 4. Profit/Loss = Sale Value - Purchase Cost of Sold Items - Expenses
    stats.profitLoss = stats.totalSalesValue - stats.totalPurchaseValue - stats.totalExpenses;

    if (masterSheet) {
      var mData = masterSheet.getDataRange().getValues();
      var statusIdx = mData[0].indexOf("Order Status");
      if (statusIdx !== -1) {
        for (let i = 1; i < mData.length; i++) {
          if (mData[i][statusIdx] === "Ready to Bill") stats.pendingInvoices++;
        }
      }
    }

    return stats;
  } catch (e) {
    throw new Error("Dashboard Error: " + e.toString());
  }
}
function authenticateUser(id, pass) { try { var ss = SpreadsheetApp.openById(INV_SS_ID); var uSheet = ss.getSheetByName("Users"); var uData = uSheet.getDataRange().getValues(); for (var i = 1; i < uData.length; i++) { var email = String(uData[i][0]).toLowerCase(), phone = String(uData[i][1]); if ((id.toLowerCase() === email || id === phone) && String(pass) === String(uData[i][5])) { var role = String(uData[i][4]); if (String(uData[i][6]) !== "Active") return { success: false, message: "Account inactive." }; return { success: true, user: { email: uData[i][0], phone: uData[i][1], name: uData[i][2], photo: uData[i][3] || "", role: role, permissions: getPermissionsForRole(role) } }; } } return { success: false, message: "Invalid credentials." }; } catch (e) { return { success: false, message: e.toString() }; } }
function getScriptUrl() { return ScriptApp.getService().getUrl(); }
function updatePassword(e, o, n) { var ss = SpreadsheetApp.openById(INV_SS_ID); var s = ss.getSheetByName("Users"); var d = s.getDataRange().getValues(); for (var i = 1; i < d.length; i++) { if (String(d[i][0]).toLowerCase() === e.toLowerCase()) { if (String(d[i][5]) !== o) return { success: false, message: "Incorrect password." }; s.getRange(i + 1, 6).setValue(n); return { success: true }; } } return { success: false }; }
function updateProfile(e, n, p) { var ss = SpreadsheetApp.openById(INV_SS_ID); var s = ss.getSheetByName("Users"); var d = s.getDataRange().getValues(); for (var i = 1; i < d.length; i++) { if (String(d[i][0]).toLowerCase() === e.toLowerCase()) { s.getRange(i + 1, 3).setValue(n); s.getRange(i + 1, 4).setValue(p); return { success: true }; } } return { success: false }; }
function generateAndSavePDFs(ids, type) { var folders = DriveApp.getFolderById("16XUbLwA5f7p8CE_ec1wF2iEKAdCNGJIT").getFoldersByName(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy")); var folder = folders.hasNext() ? folders.next() : DriveApp.getFolderById("16XUbLwA5f7p8CE_ec1wF2iEKAdCNGJIT").createFolder(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy")); var pdfLinks = {}; ids.forEach(id => { var data = (type === 'sales') ? getInvoiceData(id) : poGetPODetails(id); if (data && data.header) { var htmlContent = (type === 'sales') ? `Invoice ${id}` : `PO ${id}`; var pdfFile = folder.createFile(Utilities.newBlob(htmlContent, 'text/html', id + ".html").getAs('application/pdf')).setName(id + ".pdf"); pdfLinks[id] = pdfFile.getUrl(); if (type === 'sales') markInvoiceAsPrinted(id, pdfFile.getUrl()); else markPOAsPrinted(id); } }); return pdfLinks; }

function markIdsAsPrintedBulk(ids, type) { if (!ids || ids.length === 0) return { success: false }; const timestamp = 'Printed on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yy 'at' hh:mm:ss a"); try { if (type === 'sales') { const ss = SpreadsheetApp.openById(ORDER_SS_ID); const sheet = ss.getSheetByName('SalesDetails'); if (!sheet) return { success: false }; const data = sheet.getDataRange().getValues(); const headers = data[0].map(h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')); const invIdx = headers.indexOf('invoicenum'); let printedIdx = headers.indexOf('printed'); if (printedIdx === -1 || printedIdx === headers.indexOf('note')) printedIdx = 15; const idSet = new Set(ids.map(id => String(id).trim())); for (let i = 1; i < data.length; i++) { if (idSet.has(String(data[i][invIdx]).trim())) { sheet.getRange(i + 1, printedIdx + 1).setValue(timestamp).setBackground('#d9ead3'); } } } else { const ss = SpreadsheetApp.openById(INV_SS_ID); const sheet = ss.getSheetByName('PurchaseOrders'); if (!sheet) return { success: false }; const data = sheet.getDataRange().getValues(); const idSet = new Set(ids.map(id => String(id).trim())); for (let i = 1; i < data.length; i++) { if (idSet.has(String(data[i][1]).trim())) { sheet.getRange(i + 1, 9).setValue(timestamp).setBackground('#d9ead3'); } } } return { success: true }; } catch (e) { return { success: false, message: e.toString() }; } }
