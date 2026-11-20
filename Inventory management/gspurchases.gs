// getBrandings() lives in gstemplate.gs (single source of truth —
// this file used to have a duplicate copy that could silently shadow it).

function getPOSheet() { return SpreadsheetApp.openById(INV_SS_ID).getSheetByName("PurchaseOrders"); }
function getPDSheet() { return SpreadsheetApp.openById(INV_SS_ID).getSheetByName("PurchaseDetails"); }
function getSupplierSheet() { 
  const ss = SpreadsheetApp.openById(INV_SS_ID);
  let sheet = ss.getSheetByName("Supliers");
  if (!sheet) {
    sheet = ss.insertSheet("Supliers");
    sheet.appendRow(["Regtration Date", "Supplier ID", "Supplier Name", "Supplier Address", "Phone Number"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#efefef");
  }
  return sheet;
}

/**
 * Retrieves items from InventoryItems based on exact header serial:
 * SKU(0), Item Size(1), Item Name(2), P.Price(3), S.Price(4), QTY Purchased(5), QTY Sold(6), Remaining QTY(7), Reorder Required(8), Image(9)
 */
function poGetInventoryItems() {
  try {
    const ss = SpreadsheetApp.openById(INV_SS_ID);
    const sheet = ss.getSheetByName("InventoryItems");
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    
    const items = [];
    for(let i=1; i<data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      items.push({
        id: String(row[0]),
        size: String(row[1] || ""),
        name: String(row[2] || ""),
        pPrice: parseFloat(row[3]) || 0,
        sPrice: parseFloat(row[4]) || 0,
        purchased: parseFloat(row[5]) || 0,
        sold: parseFloat(row[6]) || 0,
        remaining: parseFloat(row[7]) || 0,
        status: String(row[8] || "No"),
        image: String(row[9] || "") // Fixed to Index 9
      });
    }
    return items;
  } catch (e) { return []; }
}

/**
 * Saves or UPDATES an inventory item following header serial.
 */
function invSaveItem(item, isEdit = false) {
  const ss = SpreadsheetApp.openById(INV_SS_ID);
  const sheet = ss.getSheetByName("InventoryItems");
  const data = sheet.getDataRange().getValues();
  
  if (isEdit) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(item.sku)) {
        // Update Size(2), Name(3), P.Price(4), S.Price(5)
        sheet.getRange(i + 1, 2, 1, 4).setValues([[item.size, item.name, item.pPrice || 0, item.sPrice || 0]]);
        return { success: true };
      }
    }
    return { success: false, message: "Item not found for editing." };
  } else {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === String(item.sku).toLowerCase()) {
        return { success: false, message: "Error: SKU '" + item.sku + "' already exists!" };
      }
    }
    // SKU, Size, Name, P.Price, S.Price, Purchased(0), Sold(0), Remaining(0), Reorder(No), Image("")
    sheet.appendRow([item.sku, item.size, item.name, item.pPrice || 0, item.sPrice || 0, 0, 0, 0, "No", ""]);
    return { success: true };
  }
}

/**
 * Fetches data for Purchase Order screens.
 */
function poGetPODetails(poId) {
  console.log("Fetching details for PO ID: '" + poId + "'");
  try {
    const poSheet = getPOSheet();
    const pdSheet = getPDSheet();
    const poData = poSheet.getDataRange().getValues();
    const pdData = pdSheet.getDataRange().getValues();
    const brandings = getBrandings();
    
    let header = null;
    const targetId = String(poId).trim();
    console.log("Normalized target ID: '" + targetId + "'");

    for (let i = 1; i < poData.length; i++) {
      const currentPoId = String(poData[i][1]).trim();
      if (currentPoId === targetId) {
        console.log("Match found at row " + (i + 1));
        const sId = String(poData[i][2]);
        let sPhone = "N/A";
        const supSheet = getSupplierSheet();
        const supData = supSheet.getDataRange().getValues();
        for(let j=1; j<supData.length; j++) {
          if(String(supData[j][1]) === sId) {
            sPhone = String(supData[j][4]);
            break;
          }
        }
        header = {
          date: poData[i][0] instanceof Date ? Utilities.formatDate(poData[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(poData[i][0]),
          poId: poData[i][1], supplierId: sId, supplierName: poData[i][3], supplierPhone: sPhone
        };
        break;
      }
    }
    
    if (!header) {
      console.warn("No header found for PO ID: " + targetId);
    }

    const items = [];
    for (let i = 1; i < pdData.length; i++) {
      if (String(pdData[i][1]).trim() === targetId) {
        items.push({
          sku: String(pdData[i][4]), itemType: String(pdData[i][5]), itemName: String(pdData[i][6]),
          qty: parseFloat(pdData[i][7]) || 0, unitCost: parseFloat(pdData[i][8]) || 0
        });
      }
    }
    console.log("Found " + items.length + " items for PO ID: " + targetId);
    return { header, items, brandings };
  } catch (e) { 
    console.error("Error in poGetPODetails: " + e.toString());
    return { header: null, items: [], brandings: [], error: e.toString() }; 
  }
}

function updateqtypurchased() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName("InventoryItems"); 
  const pdSheet = ss.getSheetByName("PurchaseDetails");
  if (!invSheet || !pdSheet) return;

  const invData = invSheet.getDataRange().getValues();
  const pdData = pdSheet.getDataRange().getValues();

  // Dynamic header discovery
  const getColIdx = (headers, name) => {
    const clean = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return headers.map(h => clean(h)).indexOf(clean(name));
  };

  const pdH = pdData[0];
  const pdSkuIdx = getColIdx(pdH, "SKU");
  const pdQtyIdx = getColIdx(pdH, "Qty");
  
  if (pdSkuIdx === -1 || pdQtyIdx === -1) return;

  const skuTotals = {};
  for(let i=1; i<pdData.length; i++) {
    const sku = String(pdData[i][pdSkuIdx]).trim().toUpperCase();
    const qty = parseFloat(pdData[i][pdQtyIdx]) || 0;
    if(sku) skuTotals[sku] = (skuTotals[sku] || 0) + qty;
  }

  const invH = invData[0];
  const pCol = getColIdx(invH, "QTY Purchased");
  if (pCol === -1) return;

  for(let i=1; i<invData.length; i++) {
    const sku = String(invData[i][0]).trim().toUpperCase();
    if (sku) invSheet.getRange(i+1, pCol + 1).setValue(skuTotals[sku] || 0);
  }
}

function updateqtysold() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName("InventoryItems");
  const ordId = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
  let ordSS;
  try {
    ordSS = SpreadsheetApp.openById(ordId);
  } catch (e) { return; }

  const sdSheet = ordSS.getSheetByName("SalesDetails");
  if (!invSheet || !sdSheet) return;

  const invData = invSheet.getDataRange().getValues();
  const sdData = sdSheet.getDataRange().getValues();
  
  const getColIdx = (headers, name) => {
    const clean = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return headers.map(h => clean(h)).indexOf(clean(name));
  };

  const sdH = sdData[0];
  const sdSkuIdx = getColIdx(sdH, "SKU");
  const sdQtyIdx = getColIdx(sdH, "Qty");

  if (sdSkuIdx === -1 || sdQtyIdx === -1) return;

  const soldMap = {};
  for (let i = 1; i < sdData.length; i++) {
    const sku = String(sdData[i][sdSkuIdx]).trim().toUpperCase();
    const qty = parseFloat(sdData[i][sdQtyIdx]) || 0;
    if (sku) soldMap[sku] = (soldMap[sku] || 0) + qty;
  }

  const invH = invData[0];
  const sCol = getColIdx(invH, "QTY Sold");
  if (sCol === -1) return;

  for (let i = 1; i < invData.length; i++) {
    const sku = String(invData[i][0]).trim().toUpperCase();
    if (sku) {
      invSheet.getRange(i + 1, sCol + 1).setValue(soldMap[sku] || 0);
    }
  }
}

function updateremainingqty() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("InventoryItems");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const getColIdx = (h, name) => h.map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, "")).indexOf(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const pIdx = getColIdx(headers, "QTY Purchased");
  const sIdx = getColIdx(headers, "QTY Sold");
  const rIdx = getColIdx(headers, "Remaining QTY");

  if (pIdx === -1 || sIdx === -1 || rIdx === -1) return;

  for(let i=1; i<data.length; i++) {
    const purchased = parseFloat(data[i][pIdx]) || 0;
    const sold = parseFloat(data[i][sIdx]) || 0;
    sheet.getRange(i+1, rIdx + 1).setValue(purchased - sold);
  }
}

function updatereorderrequired() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("InventoryItems");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const getColIdx = (h, name) => h.map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, "")).indexOf(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const rIdx = getColIdx(headers, "Remaining QTY");
  const reqIdx = getColIdx(headers, "Reorder Required");

  if (rIdx === -1 || reqIdx === -1) return;

  for(let i=1; i<data.length; i++) {
    const remaining = parseFloat(data[i][rIdx]) || 0;
    const level = 5; 
    sheet.getRange(i+1, reqIdx + 1).setValue(remaining <= level ? "Yes" : "No");
  }
}

// REST OF FILE UNCHANGED (poSaveNewPO, updatetotalpo, etc. remain the same)
function poSaveNewPO(header, items, isEdit = false) {
  try {
    const pdSheet = getPDSheet();
    const poSheet = getPOSheet();
    const targetPoId = String(header.poId).trim();

    // ALWAYS clear existing data for this PO ID to prevent duplicates
    const pdData = pdSheet.getDataRange().getValues();
    for (let i = pdData.length - 1; i >= 1; i--) { 
      if (String(pdData[i][1]).trim() === targetPoId) pdSheet.deleteRow(i + 1); 
    }
    const poData = poSheet.getDataRange().getValues();
    for (let i = poData.length - 1; i >= 1; i--) { 
      if (String(poData[i][1]).trim() === targetPoId) poSheet.deleteRow(i + 1); 
    }

    items.forEach(item => {
      pdSheet.appendRow([
        header.date, targetPoId, header.supplierId, header.supplierName,
        item.sku, item.itemType, item.itemName, 
        parseFloat(item.qty), parseFloat(item.unitCost), parseFloat(item.qty) * parseFloat(item.unitCost)
      ]);
    });
    updatetotalpo();
    updatepobalance();
    updateqtypurchased();
    updateqtysold();
    updateremainingqty();
    updatereorderrequired();
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updatetotalpo() {
  const pdSheet = getPDSheet();
  const poSheet = getPOSheet();
  const pdData = pdSheet.getDataRange().getValues();
  const poData = poSheet.getDataRange().getValues();
  const poTotals = {};
  const poDetails = {};
  for(let i=1; i<pdData.length; i++) {
    const poId = String(pdData[i][1]).trim();
    if (!poId) continue;
    const amount = parseFloat(pdData[i][9]) || 0;
    if(!poTotals[poId]) {
      poTotals[poId] = 0;
      poDetails[poId] = { date: pdData[i][0], supplierId: pdData[i][2], supplierName: pdData[i][3] };
    }
    poTotals[poId] += amount;
  }
  const existingPoIds = [];
  for(let i=1; i<poData.length; i++) {
    const poId = String(poData[i][1]).trim();
    if (!poId) continue;
    existingPoIds.push(poId);
    if(poTotals[poId] !== undefined) poSheet.getRange(i+1, 5).setValue(poTotals[poId]);
  }
  for(const poId in poTotals) {
    if(!existingPoIds.includes(poId)) {
      const d = poDetails[poId];
      poSheet.appendRow([d.date, poId, d.supplierId, d.supplierName, poTotals[poId], 0, poTotals[poId], "", ""]);
    }
  }
}

function updatepobalance() {
  const sheet = getPOSheet();
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    const total = parseFloat(data[i][4]) || 0;
    const paid = parseFloat(data[i][5]) || 0;
    sheet.getRange(i+1, 7).setValue(total - paid);
  }
}

/**
 * RE-IMPLEMENTED MISSING FUNCTIONS
 */

function poGetList() {
  try {
    const sheet = getPOSheet();
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const res = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      res.push({
        date: data[i][0] instanceof Date ? Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), "dd-MMM-yy") : String(data[i][0]),
        poId: String(data[i][1]),
        supplierId: String(data[i][2]),
        supplierName: String(data[i][3]),
        totalAmount: parseFloat(data[i][4]) || 0,
        totalPaid: parseFloat(data[i][5]) || 0,
        balance: parseFloat(data[i][6]) || 0,
        isPrinted: String(data[i][8] || "").toLowerCase().includes("printed on")
      });
    }
    return res.reverse();
  } catch (e) { return []; }
}

function poGetSuppliers() {
  try {
    const sheet = getSupplierSheet();
    const data = sheet.getDataRange().getValues();
    const res = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      res.push({
        regDate: data[i][0] instanceof Date ? Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), "dd-MMM-yy") : String(data[i][0]),
        id: String(data[i][1]),
        name: String(data[i][2]),
        address: String(data[i][3]),
        phone: String(data[i][4])
      });
    }
    return res;
  } catch (e) { return []; }
}

function poGenerateID() {
  try {
    const sheet = getPOSheet();
    const data = sheet.getDataRange().getValues();
    const ids = data.map(r => String(r[1]).trim());
    const datePrefix = "PO-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd");
    let seq = 1;
    while (ids.includes(datePrefix + "-" + String(seq).padStart(3, '0'))) {
      seq++;
    }
    return datePrefix + "-" + String(seq).padStart(3, '0');
  } catch (e) { return "PO-" + Date.now(); }
}

function poDeletePO(poId) {
  try {
    const poSheet = getPOSheet();
    const pdSheet = getPDSheet();
    const poData = poSheet.getDataRange().getValues();
    const pdData = pdSheet.getDataRange().getValues();
    
    for (let i = poData.length - 1; i >= 1; i--) {
      if (String(poData[i][1]).trim() === String(poId).trim()) {
        poSheet.deleteRow(i + 1);
      }
    }
    for (let i = pdData.length - 1; i >= 1; i--) {
      if (String(pdData[i][1]).trim() === String(poId).trim()) {
        pdSheet.deleteRow(i + 1);
      }
    }
    updateqtypurchased();
    updateremainingqty();
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function markPOAsPrinted(poId) {
  return markIdsAsPrintedBulk([poId], 'purchases');
}

function getSizeList() {
  try {
    const ss = SpreadsheetApp.openById(INV_SS_ID);
    const sheet = ss.getSheetByName("Size and variation");
    if (!sheet) return ["S", "M", "L", "XL", "XXL", "FREE"];
    const data = sheet.getDataRange().getValues();
    const list = [];
    for (let i = 1; i < data.length; i++) {
      const val = String(data[i][0] || "").trim();
      if (val) list.push(val);
    }
    return list;
  } catch (e) { return ["S", "M", "L", "XL", "XXL", "FREE"]; }
}
