/**
 * Finds a sheet by name, tolerating spacing/case differences
 * (e.g. "Sales Details", "salesdetails ", "SALESDETAILS").
 */
function findSheetByName_(ss, wanted) {
  const direct = ss.getSheetByName(wanted);
  if (direct) return direct;
  const target = wanted.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().replace(/[^a-z0-9]/g, "") === target) return sheets[i];
  }
  return null;
}

/**
 * Reads from Order Management -> SalesDetails
 */
function getSalesList() {
  try {
    const ss = SpreadsheetApp.openById(ORDER_SS_ID);
    const sheet = findSheetByName_(ss, "SalesDetails");
    if (!sheet) {
      // Fail loudly instead of returning an empty list — a silent [] here
      // makes the sales page look "empty" with no clue why.
      throw new Error("'SalesDetails' tab not found in spreadsheet \"" + ss.getName() +
        "\". Existing tabs: " + ss.getSheets().map(s => s.getName()).join(", "));
    }
    
    const sizeSymbols = getSizeSymbols();
    const imageMap = getInventoryImageMap();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    // LIVE PAID & PAGE LOOKUP: Map Invoice Num -> Current Paid Amount & Page Name from Master Sheet
    const orderSheet = ss.getSheetByName("Dress Query/Order");
    const liveMap = {};
    if (orderSheet) {
      const oData = orderSheet.getDataRange().getValues();
      const oHeaders = oData[0];
      const oInvIdx = oHeaders.indexOf("Order Invoice No.");
      const oPaidIdx = oHeaders.indexOf("Paid");
      const oPageIdx = oHeaders.indexOf("Page Name");
      if (oInvIdx !== -1) {
        for (let k = 1; k < oData.length; k++) {
          const inv = String(oData[k][oInvIdx]).trim();
          if (inv) {
            liveMap[inv] = {
              paid: parseFloat(oData[k][oPaidIdx]) || 0,
              pageName: oPageIdx !== -1 ? String(oData[k][oPageIdx] || "").trim() : ""
            };
          }
        }
      }
    }
    
    // ROBUST HEADER CLEANING
    const clean = (txt) => String(txt || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const headers = data[0].map(h => clean(h));
    const findIdx = (name) => headers.indexOf(clean(name));

    const invIdx = findIdx("invoicenum");
    const printedIdx = findIdx("printed");
    const addrIdx = findIdx("address");
    const deliveryIdx = findIdx("deliverycharge");
    const discountIdx = findIdx("discount");
    const noteIdx = findIdx("note") !== -1 ? findIdx("note") : findIdx("note1");
    const phoneIdx = findIdx("phonenumber");
    const nameIdx = findIdx("customername");

    const grouped = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const invNum = String(row[invIdx !== -1 ? invIdx : 1] || "").trim();
      if (!invNum) continue;

      if (!grouped[invNum]) {
        grouped[invNum] = {
          date: row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "dd-MMM-yyyy") : String(row[0]),
          invoiceNum: invNum,
          customerName: String(nameIdx !== -1 ? row[nameIdx] : row[2] || ""),
          phone: String(phoneIdx !== -1 ? row[phoneIdx] : row[3] || ""),
          address: String(addrIdx !== -1 ? row[addrIdx] : row[4] || ""),
          delivery: parseFloat(row[deliveryIdx !== -1 ? deliveryIdx : 10]) || 0,
          discount: parseFloat(row[discountIdx !== -1 ? discountIdx : 11]) || 0,
          isPrinted: printedIdx !== -1 ? String(row[printedIdx] || "").toLowerCase().includes("printed on") : false,
          note: noteIdx !== -1 ? String(row[noteIdx] || "") : "",
          paidAmount: liveMap[invNum] ? liveMap[invNum].paid : 0,
          pageName: liveMap[invNum] ? liveMap[invNum].pageName : "",
          returnCost: parseFloat(row[17]) || 0, // NEW: Extract Return Cost from Column R
          items: [],
          totalAmount: 0
        };
      }
      const sku = String(row[5] || "").trim();
      const rawSize = String(row[6] || "").trim();
      grouped[invNum].items.push({
        sku: sku,
        size: sizeSymbols[rawSize] || rawSize,
        name: String(row[7] || ""),
        qty: parseFloat(row[8]) || 0,
        price: parseFloat(row[9]) || 0,
        total: parseFloat(row[12]) || 0,
        soldPrice: parseFloat(row[13]) || 0,
        image: imageMap[sku] || "",
        returnInfo: String(row[16] || "") // NEW: Extract Return Info from Column Q
      });
      grouped[invNum].totalAmount += parseFloat(row[12]) || 0; 
    }
    return Object.values(grouped).reverse();
  } catch (e) { throw new Error("Sales List Error: " + e.message); }
}

function getSizeSymbols() {
  try {
    const ss = SpreadsheetApp.openById(INV_SS_ID);
    const sheet = ss.getSheetByName("Size and variation");
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < data.length; i++) {
      const sizeVal = String(data[i][0] || "").trim();
      const symbol = String(data[i][1] || "").trim();
      if (sizeVal && symbol) {
        map[sizeVal] = symbol;
      }
    }
    return map;
  } catch (e) { return {}; }
}

function getBulkPrintData(type, selectedIds = "") {
  try {
    const idFilter = selectedIds ? selectedIds.split(/[,\/]+/).map(id => id.trim()) : [];
    const brandings = getBrandings();

    if (type === 'sales') {
      const all = getSalesList();
      const filtered = idFilter.length > 0 
        ? all.filter(s => idFilter.includes(s.invoiceNum))
        : all.filter(s => !s.isPrinted);

      return {
        brandings: brandings,
        data: filtered.map(s => {
          return {
            header: {
              date: s.date, invoiceNum: s.invoiceNum, customerName: s.customerName,
              phone: s.phone, address: s.address, deliveryCharge: s.delivery,
              discount: s.discount, note: s.note, 
              pageName: s.pageName,
              subtotal: s.items.reduce((sum, item) => sum + item.total, 0),
              grandTotal: s.items.reduce((sum, item) => sum + item.soldPrice, 0) + (s.returnCost || 0),
              paidAmount: s.paidAmount,
              returnCost: s.returnCost // NEW: Pass Return Cost
            },
            items: s.items
          };
        })
      };
    } else {
      const all = poGetList();
      const pending = idFilter.length > 0
        ? all.filter(p => idFilter.includes(p.poId))
        : all.filter(p => !p.isPrinted);

      if (pending.length === 0) return { brandings: brandings, data: [] };

      const poSheet = getPOSheet(), pdSheet = getPDSheet(), supSheet = getSupplierSheet();
      const poData = poSheet.getDataRange().getValues(), pdData = pdSheet.getDataRange().getValues(), supData = supSheet.getDataRange().getValues();

      const pdByPo = {};
      for (let i = 1; i < pdData.length; i++) {
        const pId = String(pdData[i][1]).trim();
        if (!pdByPo[pId]) pdByPo[pId] = [];
        pdByPo[pId].push({ sku: String(pdData[i][4]), itemType: String(pdData[i][5]), itemName: String(pdData[i][6]), qty: parseFloat(pdData[i][7]) || 0, unitCost: parseFloat(pdData[i][8]) || 0 });
      }

      const supMap = {};
      for (let i = 1; i < supData.length; i++) { supMap[String(supData[i][1])] = String(supData[i][4]); }

      return {
        brandings: brandings,
        data: pending.map(p => {
          const hRow = poData.find(r => String(r[1]).trim() === p.poId.trim());
          const sId = hRow ? String(hRow[2]) : "";
          return {
            header: {
              date: hRow && hRow[0] instanceof Date ? Utilities.formatDate(hRow[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(hRow ? hRow[0] : ""),
              poId: p.poId, supplierId: sId, supplierName: hRow ? hRow[3] : "Unknown", supplierPhone: supMap[sId] || "N/A"
            },
            items: pdByPo[p.poId] || []
          };
        })
      };
    }
  } catch (e) { throw new Error("Bulk Data Error: " + e.message); }
}

function markInvoiceAsPrinted(invNum, pdfLink) {
  const ss = SpreadsheetApp.openById(ORDER_SS_ID);
  const sdSheet = ss.getSheetByName("SalesDetails");
  const timestamp = "Printed on " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yy 'at' hh:mm:ss a");
  
  if (sdSheet) {
    const data = sdSheet.getDataRange().getValues();
    const clean = (txt) => String(txt || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const headers = data[0].map(h => clean(h));
    
    let printedIdx = headers.indexOf("printed");
    const invIdx = headers.indexOf("invoicenum");
    
    // Safety check: Ensure we don't write to the 'Note' column (index 14)
    if (printedIdx === -1 || printedIdx === headers.indexOf("note")) {
      printedIdx = 15; // Fallback to Column P
    }
    
    if (invIdx !== -1) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][invIdx]).trim() === String(invNum).trim()) { 
          sdSheet.getRange(i + 1, printedIdx + 1).setValue(timestamp); 
          sdSheet.getRange(i + 1, printedIdx + 1).setBackground("#d9ead3");
        }
      }
    }
  }
  
  return true;
}

function getInvoiceData(invoiceNum) {
  const list = getSalesList();
  const found = list.find(s => String(s.invoiceNum) === String(invoiceNum));
  if (found) {
    const brandings = getBrandings();
    const imageMap = getInventoryImageMap();
    const itemsWithImages = found.items.map(item => {
      return {
        ...item,
        image: imageMap[item.sku] || ""
      };
    });

    return {
      brandings: brandings,
      header: {
        date: found.date, invoiceNum: found.invoiceNum, customerName: found.customerName,
        phone: found.phone, address: found.address, 
        deliveryCharge: found.delivery,
        discount: found.discount, 
        note: found.note,
        pageName: found.pageName,
        subtotal: found.items.reduce((sum, item) => sum + item.total, 0),
        grandTotal: found.items.reduce((sum, item) => sum + item.soldPrice, 0) + (found.returnCost || 0),
        paidAmount: found.paidAmount,
        returnCost: found.returnCost // NEW: Pass Return Cost
      },
      items: itemsWithImages
    };
  }
  return null;
}

/**
 * DIAGNOSTIC — run this in the Apps Script editor (Run > debugSales)
 * and read the Execution log. It pinpoints exactly where the sales
 * list pipeline breaks: wrong spreadsheet, missing tab, header
 * mismatch, or printed-flag logic.
 */
function debugSales() {
  const ss = SpreadsheetApp.openById(ORDER_SS_ID);
  Logger.log("Spreadsheet: " + ss.getName());
  Logger.log("Tabs: " + ss.getSheets().map(s => s.getName()).join(" | "));

  const sheet = findSheetByName_(ss, "SalesDetails");
  if (!sheet) { Logger.log("RESULT: SalesDetails tab NOT FOUND — that is the problem."); return; }

  const data = sheet.getDataRange().getValues();
  Logger.log("SalesDetails rows incl. header: " + data.length);
  Logger.log("Headers: " + JSON.stringify(data[0]));

  const all = getSalesList();
  Logger.log("getSalesList() -> " + all.length + " invoices, pending: " + all.filter(s => !s.isPrinted).length);
  if (all.length) {
    Logger.log("First invoice: " + JSON.stringify({ inv: all[0].invoiceNum, printed: all[0].isPrinted, date: all[0].date }));
  }
}
