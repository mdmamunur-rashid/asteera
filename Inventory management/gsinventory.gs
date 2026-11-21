
/**
 * Creates a custom menu when the sheet is opened.
 */

function getInventorySheet() {
  const ss = SpreadsheetApp.openById("1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo");
  return ss.getSheetByName("InventoryItems");
}

function getDimensionsSheet() {
  const ss = SpreadsheetApp.openById("1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo");
  return ss.getSheetByName("Dimensions");
}

function itemGetDropdownData() {
  const dimSheet = getDimensionsSheet();
  const lastRow = dimSheet.getLastRow();
  if (lastRow <= 1) return { types: [], categories: [], subcategories: [] };

  const data = dimSheet.getRange(2, 1, lastRow - 1, dimSheet.getLastColumn()).getValues();
  
  // Columns based on prompt: Item Type, Item Category, Item Subcategory are not specifically indexed in prompt 
  // but usually they are separate columns in Dimensions.
  // Prompt says: 
  // Column names on “Dimensions” sheet ...
  // State, City, PMT Mode, PMT Status, Shipping Status, Item Type, Item Category, Item Subcategory
  
  // Map indices (0-based) from prompt list:
  // 0: State, 1: City, 2: PMT Mode, 3: PMT Status, 4: Shipping Status, 5: Item Type, 6: Item Category, 7: Item Subcategory
  
  const types = [...new Set(data.map(r => r[5]).filter(String))];
  const categories = [...new Set(data.map(r => r[6]).filter(String))];
  const subcategories = [...new Set(data.map(r => r[7]).filter(String))];

  return { types, categories, subcategories };
}

function itemSaveType(type) {
  const sheet = getDimensionsSheet();
  const lastRow = sheet.getLastRow();
  // Column 6 (index 5 + 1) is Item Type
  sheet.getRange(lastRow + 1, 6).setValue(type);
}

function itemSaveCategory(category) {
  const sheet = getDimensionsSheet();
  const lastRow = sheet.getLastRow();
  // Column 7 (index 6 + 1) is Item Category
  sheet.getRange(lastRow + 1, 7).setValue(category);
}

function itemSaveSubCategory(sub) {
  const sheet = getDimensionsSheet();
  const lastRow = sheet.getLastRow();
  // Column 8 (index 7 + 1) is Item Subcategory
  sheet.getRange(lastRow + 1, 8).setValue(sub);
}

function itemGenerateID() {
  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  const ids = data.map(r => r[0]); // Item ID is 1st column
  
  let newId;
  do {
    const random = Math.floor(10000 + Math.random() * 90000);
    newId = "P" + random;
  } while (ids.includes(newId));
  
  return newId;
}

function itemSaveInventoryItem(item) {
  const sheet = getInventorySheet();
  // Columns: SKU, Item Type, Item Name, QTY Purchased, QTY Sold, Remaining QTY, Reorder Level, Reorder Required
  
  sheet.appendRow([
    item.sku,
    item.type,
    item.name,
    0, // QTY Purchased
    0, // QTY Sold
    0, // Remaining QTY
    item.reorderLevel,
    "No" // Reorder Required (default)
  ]);
}

function itemGetInventoryList(page, criteria, searchText) {
  // TRIGGER RECOUNT: Always ensure stock is fresh before loading the page
  // This solves permission issues from simple triggers
  if (typeof updateqtysold === 'function') updateqtysold();
  if (typeof updateremainingqty === 'function') updateremainingqty();

  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { data: [], total: 0, page: 1, totalPages: 0 };
  const headers = data.shift(); // Remove headers
  
  let filteredData = data;
  
  if (searchText && criteria !== 'All') {
    searchText = searchText.toLowerCase();
    let colIndex = -1;
    
    switch(criteria) {
      case 'SKU': colIndex = 0; break;
      case 'Item Type': colIndex = 1; break;
      case 'Item Name': colIndex = 2; break;
      case 'Reorder Required': colIndex = 7; break;
    }
    
    if (colIndex !== -1) {
      filteredData = data.filter(r => String(r[colIndex]).toLowerCase().includes(searchText));
    }
  } else if (searchText && criteria === 'All') {
      searchText = searchText.toLowerCase();
      filteredData = data.filter(row => row.some(cell => String(cell).toLowerCase().includes(searchText)));
  }
  
  const itemsPerPage = 25;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedData = filteredData.slice(start, end);
  
  return {
    data: paginatedData,
    total: filteredData.length,
    page: page,
    totalPages: Math.ceil(filteredData.length / itemsPerPage)
  };
}

function itemDeleteItem(sku) {
  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == sku) {
      const remainingQty = data[i][5]; // Column 6 is Remaining QTY (index 5)
      if (remainingQty > 0) {
        return { success: false, message: "Item with stock in hand can't be deleted" };
      }
      
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "Item not found" };
}
