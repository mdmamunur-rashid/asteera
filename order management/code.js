// =================================== CONFIGURATION ===================================
// IMPORTANT: This must be the EXACT title of your address question in the Google Form.
const ADDRESS_QUESTION_TITLE = 'Customer Address & Details';
const TARGET_SPREADSHEET_ID = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
const INVENTORY_SPREADSHEET_ID = "1xpbG6HlnNaMAoZVNzEnqbnn3UVC3MyZ24N6xpGDY3Jo"; // Web App Users
const MODERATOR_SPREADSHEET_ID = "1OTcUjVnSemK-2QBc5ivW2iTzcvSqwKYWEz2c49QM9hw"; // Moderator Users
// =====================================================================================


/**
 * Shared helper to find a user by email and return as a strict CSV row.
 */
function handleUserLookup(email) {
  if (!email) return "Unauthorized";
  
  // Try searching in these spreadsheets in order
  const spreadsheetIds = [MODERATOR_SPREADSHEET_ID, INVENTORY_SPREADSHEET_ID];
  
  for (const ssId of spreadsheetIds) {
    try {
      const ss = SpreadsheetApp.openById(ssId);
      const userSheet = ss.getSheetByName("Users");
      
      if (userSheet) {
        const userData = userSheet.getDataRange().getValues();
        const headers = userData[0];
        let lastCol = headers.length;
        for (let k = headers.length - 1; k >= 0; k--) {
          if (String(headers[k]).trim()) { lastCol = k + 1; break; }
        }

        for (let i = 1; i < userData.length; i++) {
          const sheetEmail = (userData[i][2] || "").toString().trim().toLowerCase();
          const primaryEmail = (userData[i][0] || "").toString().trim().toLowerCase();

          if (sheetEmail === email || primaryEmail === email) {
            return userData[i].slice(0, lastCol)
              .map(v => {
                let val = String(v || "").trim().replace(/"/g, '""').replace(/[\r\n]+/g, " ");
                return `"${val}"`;
              })
              .join(",");
          }
        }
      }
    } catch (err) {
      console.error(`Lookup error in SS ${ssId}: ` + err.toString());
    }
  }
  
  return "Unauthorized";
}

/**
 * Handle GET requests (URL parameters).
 */
function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("Error: No data provided. This function should not be run manually.").setMimeType(ContentService.MimeType.TEXT);
  }

  if (e.parameter.email) {
    const result = handleUserLookup(e.parameter.email.toString().trim().toLowerCase());
    return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("Unauthorized").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Webhook receiver for orders from the website or user lookup via POST.
 */
function doPost(e) {
  // Safety check for event object
  if (!e) {
    return ContentService.createTextOutput("Error: No data provided. This function should not be run manually.").setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    let email = null;
    let jsonData = null;
    const contents = (e.postData && e.postData.contents) ? e.postData.contents.trim() : "";

    // --- 1. DETECT EMAIL IN POST BODY (JSON or Raw Text) ---
    if (contents) {
      if (contents.startsWith("{")) {
        try {
          jsonData = JSON.parse(contents);
          // Only treat as login lookup if payload has email but NO order fields (phone/address)
          if (jsonData && jsonData.email && !jsonData.phone && !jsonData.address) {
            email = jsonData.email.toString().trim().toLowerCase();
          }
        } catch (err) { /* Not JSON */ }
      } else if (contents.includes("@") && !contents.includes("=")) {
        email = contents.toLowerCase();
      }
    }

    // --- 2. FALLBACK TO PARAMETERS (URL or Form-Encoded) ---
    if (!email && e.parameter && e.parameter.email) {
      email = e.parameter.email.toString().trim().toLowerCase();
    }

    // --- 3. IF EMAIL IS PRESENT (and no order fields), HANDLE LOGIN LOOKUP ---
    if (email) {
      const result = handleUserLookup(email);
      return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
    }

    // --- 4. HANDLE WEBSITE JSON ORDERS ---
    const data = jsonData || (contents ? JSON.parse(contents) : null);
    if (!data) {
      return ContentService.createTextOutput("Unauthorized").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // Basic validation
    if (!data.phone || !data.address) {
      throw new Error("Missing required fields: phone and address are mandatory.");
    }

    const skus = String(data.sku || "").split(/[,\/]+/).map(s => s.trim()).filter(s => s);
    const sizes = String(data.size || "").split(/[,\/]+/).map(s => s.trim());
    
    // Resolve sizes count
    let finalSizes = sizes;
    if (skus.length > 1 && sizes.length === 1) {
      finalSizes = Array(skus.length).fill(sizes[0]);
    }

    const processedData = {
      name: data.name || "Website Customer",
      sku: skus.join('/'),
      productNameList: getProductNamesFromInventory(skus),
      size: finalSizes.join('/'),
      quantity: data.quantity || String(skus.length || 1),
      phone: data.phone,
      websiteOrderNo: data.websiteOrderNo || data.orderNo || data.order_id || "",
      note: data.note || "",
      price: data.price || "0",
      formattedAddress: data.address,
      originalFormattedAddress: data.address, // For website orders, we use the provided address as-is
      district: data.district || "",
      thana: data.thana || "",
      initiateBy: data.initiateBy || "Website",
      pageName: data.pageName || data.storeName || "Asteera",
      cityId: data.cityId || "",
      zoneId: data.zoneId || ""
    };

    const result = writeProcessedDataToTargetSheet(null, -1, processedData);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      queryNo: result.appendedRowNumber - 1, // Row number - 1 is the Query No
      message: "Order received successfully."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error("Error in doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main trigger for initial form submissions.
 * It creates the Edit URL and then calls the main processing function.
 * @param {Object} e The event object passed by the onFormSubmit trigger.
 */
function onFormSubmit(e) {
  // GUARD CLAUSE: Stop if this function was triggered by an edit instead of a real submission.
  if (e && !e.namedValues) {
    console.log("onFormSubmit was incorrectly triggered by an edit. Aborting to prevent data overwrite.");
    return;
  }

  console.log("--- onFormSubmit TRIGGERED ---");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = e.range.getRow();

  // --- Get Edit Response URL for THIS specific submission ---
  let editResponseUrl = '';
  try {
    const formUrl = sheet.getFormUrl();
    if (formUrl) {
      const form = FormApp.openByUrl(formUrl);
      // row - 2 gives the 0-based index: row 2 = 1st response (index 0)
      const responseIndex = row - 2;
      const formResponses = form.getResponses();
      if (responseIndex >= 0 && responseIndex < formResponses.length) {
        editResponseUrl = formResponses[responseIndex].getEditResponseUrl();
      }
    }
  } catch (error) {
    console.log("Error getting Edit Response URL: " + error.toString());
  }

  // --- 1. Write the Edit Response Link (only happens on initial submission) ---
  const editUrlColumn = getColumnIndexByName(sheet,ADDRESS_QUESTION_TITLE) + 1;
  sheet.getRange(row, editUrlColumn).setValue(editResponseUrl);

  // Set headers if this is the first data row
  if (row === 2) {
    sheet.getRange(1, editUrlColumn).setValue("Edit Response Link");
    sheet.getRange(1, editUrlColumn + 1).setValue("Name");
    sheet.getRange(1, editUrlColumn + 2).setValue("SKU");
    sheet.getRange(1, editUrlColumn + 3).setValue("Size");
    sheet.getRange(1, editUrlColumn + 4).setValue("Quantity");
    sheet.getRange(1, editUrlColumn + 5).setValue("Phone Number");
    sheet.getRange(1, editUrlColumn + 6).setValue("Note");
    sheet.getRange(1, editUrlColumn + 7).setValue("Price");
    sheet.getRange(1, editUrlColumn + 8).setValue("Original Formatted Address"); // New Header
    sheet.getRange(1, editUrlColumn + 9).setValue("Formatted Address");
  }

  // --- 2. Process the data for the new row ---
  const processedData = processRowData(sheet, row);

  // --- 3. Write data to target sheet ---
  const { targetSheet, appendedRowNumber } = writeProcessedDataToTargetSheet(sheet, row, processedData);
}

/**
 * Main trigger for edits made directly in the spreadsheet.
 * @param {Object} e The event object passed by the onEdit trigger.
 */
function onEdit(e) {
  console.log("--- onEdit TRIGGERED ---");
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const editedRow = range.getRow();

  if (editedRow <= 1) return;

  const addressColIdx = getColumnIndexByName(sheet, ADDRESS_QUESTION_TITLE);

  if (range.getColumn() === addressColIdx) {
    const processedData = processRowData(sheet, editedRow);
    const { targetSheet, appendedRowNumber } = writeProcessedDataToTargetSheet(sheet, editedRow, processedData);
  }
}

/**
 * A helper function to find a column's index (1-based) by its header name.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to search in.
 * @param {string} headerName The name of the header to find.
 * @returns {number} The 1-based column index, or 0 if not found.
 */
function getColumnIndexByName(sheet, headerName) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return headers.indexOf(headerName) + 1;
}

/**
 * This is the core logic function. It reads the address from a given row,
 * parses all the required data, and returns the results as an object.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet object.
 * @param {number} row The row number to process.
 * @returns {Object} An object containing all extracted data.
 */
function processRowData(sheet, row) {
  // --- Find Address column location ---
  const addressColIdx = getColumnIndexByName(sheet, ADDRESS_QUESTION_TITLE);
  if (addressColIdx === 0) {
    console.log(`Column "${ADDRESS_QUESTION_TITLE}" not found. Aborting processing for row ${row}.`);
    return {
      name: '', sku: '', size: '', quantity: '', phone: '', note: '', price: '',
      originalFormattedAddress: '', formattedAddress: '', district: '', thana: '',
      cityId: '', zoneId: '', initiateBy: '', pageName: ''
    };
  }

  // --- Common data extraction ---
  // Retrieve data from the source sheet's processed row
  const sourceDataRange = sheet.getRange(row, 1, 1, sheet.getLastColumn());
  const sourceValues = sourceDataRange.getValues()[0];
  const sourceHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const getSourceValue = (headerName) => {
    const colIdx = sourceHeaders.indexOf(headerName);
    return colIdx !== -1 ? sourceValues[colIdx] : '';
  };

  let address = getSourceValue(ADDRESS_QUESTION_TITLE); // Get address using helper
  // Remove "Address:" prefix if present, case-insensitive, from the entire block first
  address = address.toString().replace(/^(?:Address|Addr)\s*[:\-\s]*/i, '').trim();
  console.log(`Processing row ${row}. Original Address:\n${address}`);
  const addressLinesOriginal = address ? address.split('\n') : []; // CAPTURE ORIGINAL LINES HERE

  const initiateBy = getSourceValue("Initiate By"); // From source sheet if exists
  const pageName = getSourceValue("Page Name");     // From source sheet if exists

  // --- Translate Address from Bengali ('bn') to English ('en') ---
  let translatedAddress = address;
  if (address && address.trim() !== '') {
    try {
      translatedAddress = LanguageApp.translate(address, 'bn', 'en');
      console.log(`Translated Address:\n${translatedAddress}`);
    } catch (error) {
      console.log("Error during translation: " + error.toString());
      translatedAddress = address;
    }
  }

  const lines = translatedAddress ? translatedAddress.split('\n') : [];

  // --- Create a consistently cleaned version of lines array ---
  // This removes any 'Address:' or 'Addr:' prefixes from each individual line.
  const cleanedLines = lines.map(originalLine => originalLine.replace(/^(?:Address|Addr)\s*[:\-\s]*/i, '').trim());

  // --- Initialize variables ---
  const foundSkus = [];
  const foundSizes = [];
  const foundQuantities = [];
  const foundPhones = [];
  const foundNotes = [];
  let price = '';
  let priceLineIndex = -1;
  let name = '';
  let nameLineIndex = -1;
  let nameFromPrefix = '';
  let nameLineIndexFromPrefix = -1;
  let lastSkuOrSizeLineIndex = -1;
  let skuLineFound = false;
  let sizeLineFound = false;
  let extractedDistrict = '';
  let extractedThana = '';
  let extractedCityId = ''; // New variable for Pathao City ID
  let extractedZoneId = ''; // New variable for Pathao Zone ID

  // --- Get Pathao Location Data (Cities/Zones) ---
  // Using local function from PathaoIntegration.gs
  const pathaoLocations = typeof getOrFetchPathaoLocations === 'function' ? getOrFetchPathaoLocations() : null;
  const pathaoCities = pathaoLocations ? pathaoLocations.cities : [];
  const pathaoZones = pathaoLocations ? pathaoLocations.zones : [];

  // Regexes for identifying line types (used in First Pass and Formatted Address)
  // Removed '^' anchor from these for more flexible matching
  const namePrefixRegex = /name[\s:_-]*/i;
  const notePrefixRegex = /(?:n[-:]|noted[:\s]*|note[:\s]*)/i;
  const phoneRegex = /(01[1-9]\d{8})\b/g;
  const skuPrefixRegex = /(?:sku|sk)[\s:_-]/i;
  const sizePrefixRegex = /(?:size|s)[\s:_-]/i;
  const priceKeywordRegex = /^(?:price|amount|total|bill|payment)[\s:_-]*/i;
  const priceEndRegex = /([-\s\/]|taka|tk|\/-)$/i;
  // New: General regex to find numbers potentially associated with currency/price keywords
  const generalPriceRegex = /(?:tk|taka|bdt|price|amount|total|bill|\/-)[\s:_-]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d+)?)\b/i;


  // For the final address filtering
  const pureDataKeywordFilter = /^(?:name|sku|sk[\s:_-]|size|s[\s:_-]|qty|note|n[\s:_-]|noted)[\s:_-]*/i;
  const isOnlyPhoneLinePatternFilter = /^\s*(?:phone|contact|mobile|mob)?[\\s:_-]*((01[1-9]\d{8})\b)[\\s.,]*$/i;
  const phoneBlockPatternRemover = /(?:phone|contact|mobile|mob)[\s:_-]*.*?(01[1-9]\d{8})\b/gi;


  // --- Track lines to omit completely from both formatted addresses ---
  const linesToOmitCompletely = new Set();


  // --- 1. First Pass: Extract data and indices ---
  if (cleanedLines.length > 0) {
    cleanedLines.forEach((line, index) => { // Iterate cleanedLines, 'line' is already clean
      const lowerLine = line.toLowerCase();

      // SKU
      if (skuPrefixRegex.test(lowerLine)) {
        const match = line.match(/(?:sku|sk)[\s:_-]*([\d,\/]+)/i);
        if (match && match[1]) {
          foundSkus.push(...match[1].split(/[,\/]+/).map(s => s.trim()));
        }
        lastSkuOrSizeLineIndex = index;
        skuLineFound = true;
        linesToOmitCompletely.add(index);
      }
      // Size
      if (sizePrefixRegex.test(lowerLine)) {
        const match = line.match(/(?:size|s)[\s:_-]*([\d,\/]+)/i);
        if (match && match[1]) {
          foundSizes.push(...match[1].split(/[,\/]+/).map(s => s.trim()));
        }
        lastSkuOrSizeLineIndex = index;
        sizeLineFound = true;
        linesToOmitCompletely.add(index);
      }
      // Quantity
      if (lowerLine.includes('qty')) {
        const numbers = line.match(/\d+/g);
        if (numbers) foundQuantities.push(...numbers);
        linesToOmitCompletely.add(index);
      }
      // Name
      if (namePrefixRegex.test(line)) {
        nameFromPrefix = line.replace(namePrefixRegex, '').trim();
        nameLineIndexFromPrefix = index;
      }
      // Note
      if (notePrefixRegex.test(line.trim())) {
        const noteContent = line.replace(notePrefixRegex, '').trim();
        if (noteContent) foundNotes.push(noteContent);
        linesToOmitCompletely.add(index);
      }
      // Phone Number (extracts phone numbers)
      const phoneMatches = line.match(phoneRegex);
      if (phoneMatches) foundPhones.push(...phoneMatches);

      // If the line is *only* a phone number (with optional prefix), omit it completely
      if(isOnlyPhoneLinePatternFilter.test(line)) {
          linesToOmitCompletely.add(index);
      }

      // --- Extract District and Thana with IDs ---
      // Try to find Thana first, then its parent District
      if (!extractedZoneId && pathaoZones.length > 0) {
        for (const zone of pathaoZones) {
          // Check for full word match to prevent "Dhaka" matching "Dhakal"
          const zoneRegex = new RegExp(`\\b${zone.name.toLowerCase()}\\b`);
          if (zoneRegex.test(lowerLine)) {
            extractedThana = zone.name;
            extractedZoneId = zone.id;
            // Now find its parent city (district)
            const parentCity = pathaoCities.find(city => city.id === zone.city_id);
            if (parentCity) {
              extractedDistrict = parentCity.name;
              extractedCityId = parentCity.id;
            }
            break;
          }
        }
      }

      // If Thana-based district not found, try to find District directly
      if (!extractedCityId && pathaoCities.length > 0) {
        for (const city of pathaoCities) {
          const cityRegex = new RegExp(`\\b${city.name.toLowerCase()}\\b`);
          if (cityRegex.test(lowerLine)) {
            extractedDistrict = city.name;
            extractedCityId = city.id;
            break;
          }
        }
      }
    });
  }

  // --- Fallback for SKU and Size ---
  if (!skuLineFound && cleanedLines.length > 0) {
    const numbersInLine = cleanedLines[0].match(/\d+/g);
    if (numbersInLine) {
      console.log("SKU not found by prefix, falling back to first line.");
      foundSkus.push(...numbersInLine);
      linesToOmitCompletely.add(0);
    }
  }
  if (!sizeLineFound && cleanedLines.length > 1) {
    const numbersInLine = cleanedLines[1].match(/\d+/g);
    if (numbersInLine) {
      console.log("Size not found by prefix, falling back to second line.");
      foundSizes.push(...numbersInLine);
      linesToOmitCompletely.add(1);
    }
  }

  // --- 2. Second Pass: Resolve Name, Price ---
  // Resolve Name
  if (nameFromPrefix) {
    name = nameFromPrefix;
    nameLineIndex = nameLineIndexFromPrefix;
    linesToOmitCompletely.add(nameLineIndex);
  } else if (lastSkuOrSizeLineIndex !== -1 && lastSkuOrSizeLineIndex < cleanedLines.length - 1) {
    nameLineIndex = lastSkuOrSizeLineIndex + 1;
    name = cleanedLines[nameLineIndex].trim(); // Use cleanedLines
    linesToOmitCompletely.add(nameLineIndex);
  }

  // Resolve Price (Enhanced Logic)
  for (let i = 0; i < cleanedLines.length; i++) {
    // Skip lines already identified as specific data (e.g., phone, SKU, etc.)
    if (linesToOmitCompletely.has(i)) {
      continue;
    }
    
    const lowerLine = cleanedLines[i].toLowerCase();
    let match;

    // Highest priority: Explicit price keyword at beginning
    if (priceKeywordRegex.test(lowerLine)) {
      const numbers = cleanedLines[i].match(/\d+(\.\d+)?/g);
      if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = i; break; }
    }

    // Second priority: General price patterns (currency, amount, total)
    match = cleanedLines[i].match(generalPriceRegex);
    if (match && match[2]) {
      price = match[2].replace(/,/g, '');
      priceLineIndex = i;
      break;
    }
    
    // Third priority: End of line with taka/tk
    if (priceEndRegex.test(lowerLine)) {
        const numbers = cleanedLines[i].match(/\d+(\.\d+)?/g);
        if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = i; break; }
    }
  }
  if (price === '' && cleanedLines.length > 0) {
    const lastLine = cleanedLines[cleanedLines.length - 1].trim();
    const numbers = lastLine.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = cleanedLines.length - 1; }
  }
  // Ensure price is a clean number string
  price = price ? price.toString().replace(/[^0-9.]/g, '') : '';
  if (priceLineIndex !== -1) linesToOmitCompletely.add(priceLineIndex);


  // --- 3. Data Extraction Complete ---
  // --- 4. Create and Return Original Formatted Address ---
  const originalFormattedAddressLines = [];
  if (addressLinesOriginal.length > 0) {
    addressLinesOriginal.forEach((originalLine, index) => {
      if (!linesToOmitCompletely.has(index)) { // If line is not marked for complete omission
        // Also strip any phone blocks from the original address lines
        let cleanLine = originalLine.replace(phoneBlockPatternRemover, '');
        cleanLine = cleanLine.replace(/^[.,\s-_]*/, '').trim();
        if (cleanLine) {
          originalFormattedAddressLines.push(cleanLine);
        }
      }
    });
  }
  const originalFormattedAddress = originalFormattedAddressLines.join('\n');

  // --- 5. Create and Return Formatted Address (Translated & Cleaned) ---
  const formattedAddressLines = [];
  if (cleanedLines.length > 0) {
    cleanedLines.forEach((cleanedLine, index) => { // Use cleanedLines here
      if (!linesToOmitCompletely.has(index)) { // Only process lines not already marked for full omission
        let cleanLine = cleanedLine.replace(phoneBlockPatternRemover, '');
        cleanLine = cleanLine.replace(/^[.,\s-_]*/, '').trim();
        if (cleanLine) {
          formattedAddressLines.push(cleanLine);
        }
      }
    });
  }
  const finalFormattedAddress = formattedAddressLines.join('\n');

  console.log('Row processing complete.');

  // Deduplicate only phones
  const uniquePhones = [...new Set(foundPhones)];

  // Logic: Ensure size count matches SKU count
  let finalSizes = foundSizes;
  if (foundSkus.length > 1 && foundSizes.length === 1) {
    finalSizes = Array(foundSkus.length).fill(foundSizes[0]);
  }

  // Return all extracted data
  return {
    name: name,
    sku: foundSkus.join('/'),
    productNameList: getProductNamesFromInventory(foundSkus),
    size: finalSizes.join('/'),
    quantity: foundQuantities.length > 0 ? foundQuantities.join('/') : (foundSkus.length > 0 ? foundSkus.length.toString() : ''),
    phone: uniquePhones.join(','),
    note: foundNotes.join('\n'),
    price: price,
    originalFormattedAddress: originalFormattedAddress,
    formattedAddress: finalFormattedAddress,
    district: extractedDistrict,
    thana: extractedThana,
    initiateBy: initiateBy,
    pageName: pageName,
    cityId: extractedCityId,
    zoneId: extractedZoneId
  };
}
/**
 * Writes the processed data from the source sheet to the designated target spreadsheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet The sheet object from which the data was processed.
 * @param {number} row The row number in the source sheet that was processed.
 * @param {Object} processedData An object containing all extracted and processed data from the row.
 */
function writeProcessedDataToTargetSheet(sourceSheet, row, processedData) { // Accept processedData
  console.log("--- writeProcessedDataToTargetSheet TRIGGERED ---");
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(30000); // Wait up to 30s for concurrent submissions to finish
    lockAcquired = true;
    const targetSpreadsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const targetSheet = targetSpreadsheet.getSheetByName("Dress Query/Order"); // Assuming gid: "0" means the first sheet

    const targetHeaders = [
      "Query No", "Website Order No", "Initiate By", "Page Name", "Order Date",
      "Product Name List", "Product SKU", "Product QTY", "Size", "Product Price", 
      "Delivery Charge", "Paid", "Discount", "COD", "Note 1", 
      "Payment Status", "Customer Name", "Phone", "Customer Address", "District", 
      "Order Status", "Delivery Method", "Order Invoice No.", "Courier Tracking No", 
      "Bill Date"
    ];

    // Ensure target sheet has headers
    if (targetSheet.getLastRow() === 0) {
      targetSheet.appendRow(targetHeaders);
    }

    // --- Prepare data for the target sheet ---
    const newRowData = new Array(targetHeaders.length).fill(''); // Initialize with blanks

    const mapValue = (header, value) => {
      const colIdx = targetHeaders.indexOf(header);
      if (colIdx !== -1) {
        newRowData[colIdx] = value;
      } else {
        console.warn(`Target header "${header}" not found. Skipping.`);
      }
    };

    // Mapping the values from processedData
    const lastRowInTarget = targetSheet.getLastRow();
    mapValue("Query No", lastRowInTarget);
    mapValue("Website Order No", processedData.websiteOrderNo || "");
    mapValue("Initiate By", processedData.initiateBy || (sourceSheet ? "Form" : "Website"));
    mapValue("Page Name", processedData.pageName || "Asteera");
    
    const today = new Date();
    const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd-MMM-yyyy");
    mapValue("Order Date", formattedDate); 
    mapValue("Product Name List", processedData.productNameList);
    mapValue("Product SKU", processedData.sku);
    mapValue("Product QTY", processedData.quantity);
    mapValue("Product Price", processedData.price);
    mapValue("Delivery Charge", "");
    mapValue("Paid", "");
    mapValue("Discount", "");
    mapValue("COD", "");
    mapValue("Size", processedData.size);
    mapValue("Note 1", processedData.note);
    mapValue("Payment Status", "");
    mapValue("Customer Name", processedData.name);
    mapValue("Phone", processedData.phone);
    mapValue("Customer Address", processedData.formattedAddress);
    mapValue("District", processedData.district);
    mapValue("Order Status", "");
    mapValue("Delivery Method", "");
    mapValue("Order Invoice No.", "");
    mapValue("Courier Tracking No", "");
    mapValue("Bill Date", "");

    targetSheet.appendRow(newRowData);
    SpreadsheetApp.flush(); // Force write to commit before releasing lock
    const appendedRowNumber = targetSheet.getLastRow();
    if (lockAcquired) { lock.releaseLock(); lockAcquired = false; }

    // --- OPTIONAL: Write back to source sheet if provided ---
    if (sourceSheet && row > 1) {
      const addrColIdx = getColumnIndexByName(sourceSheet, ADDRESS_QUESTION_TITLE);
      if (addrColIdx > 0) {
        sourceSheet.getRange(row, addrColIdx + 2).setValue(processedData.name);
        sourceSheet.getRange(row, addrColIdx + 3).setValue(processedData.sku);
        sourceSheet.getRange(row, addrColIdx + 4).setValue(processedData.size);
        sourceSheet.getRange(row, addrColIdx + 5).setValue(processedData.quantity);
        sourceSheet.getRange(row, addrColIdx + 6).setValue(processedData.phone);
        sourceSheet.getRange(row, addrColIdx + 7).setValue(processedData.note);
        sourceSheet.getRange(row, addrColIdx + 8).setValue(processedData.price);
      }
    }

    console.log(`Data written to target sheet row ${appendedRowNumber}.`);
    return { targetSheet: targetSheet, appendedRowNumber: appendedRowNumber };
  } catch (error) {
    if (lockAcquired) lock.releaseLock();
    console.error("Error writing data to target sheet: " + error.toString());
    throw new Error("Failed to write processed data to target sheet: " + error.toString());
  }
}
  
  /**
   * Looks up product names from the inventory sheet using SKUs.
   * @param {string[]} skus An array of SKU strings.
   * @returns {string} A comma-separated string of product names.
   */
  function getProductNamesFromInventory(skus) {
    if (!skus || skus.length === 0) return "";
    try {
      const invSS = SpreadsheetApp.openById(INVENTORY_SPREADSHEET_ID);
      const invSheet = invSS.getSheetByName("InventoryItems");
      if (!invSheet) {
        console.error("InventoryItems sheet not found");
        return "";
      }
      
      const data = invSheet.getDataRange().getValues();
      const nameMap = {};
      // Column A is SKU (index 0), Column C is Item Name (index 2)
      for (let i = 1; i < data.length; i++) { 
        const sku = String(data[i][0]).trim();
        if (sku) nameMap[sku] = String(data[i][2]); 
      }
      
      return skus.map(sku => {
        const trimmedSku = String(sku).trim();
        return nameMap[trimmedSku] || ("Unknown SKU: " + trimmedSku);
      }).join("/ ");
    } catch (e) {
      console.error("Error in getProductNamesFromInventory: " + e.message);
      return "";
    }
  }
  