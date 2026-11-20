// =================================== CONFIGURATION ===================================
// IMPORTANT: This must be the EXACT title of your address question in the Google Form.
const ADDRESS_QUESTION_TITLE = 'Customer Address & Details';
const TARGET_SPREADSHEET_ID = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
// =====================================================================================


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

  // --- Get Edit Response URL robustly ---
  let editResponseUrl = '';
  try {
    const formUrl = sheet.getFormUrl();
    if (formUrl) {
      const form = FormApp.openByUrl(formUrl);
      const formResponses = form.getResponses();
      const latestResponse = formResponses[formResponses.length - 1];
      editResponseUrl = latestResponse.getEditResponseUrl();
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

  // --- NEW: Trigger location update and dropdown setup in the target sheet ---
  // Ensure we get the correct headers from the target sheet
  const targetHeaders = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
  const addressColName = "Customer Address"; // Name of the address column in the target sheet

  // PathaoLib.getColumnIndexByName returns 0-based index, but findAndSetLocationIds takes headers directly
  // It uses its own internal getColumnIndexByName which matches its headers.
  
  // Get the address value from the target sheet's new row
  const addressColIdxTarget = PathaoLib.getColumnIndexByName(targetHeaders, addressColName);
  const updatedAddressValue = targetSheet.getRange(appendedRowNumber, addressColIdxTarget + 1).getValue();

  // Call PathaoLib's findAndSetLocationIds to apply formatting and dropdowns
  PathaoLib.findAndSetLocationIds(targetSheet, appendedRowNumber, updatedAddressValue, targetHeaders);
  // --- END NEW ---
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

    // --- NEW: Trigger location update and dropdown setup in the target sheet ---
    // Ensure we get the correct headers from the target sheet
    const targetHeaders = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
    const addressColName = "Customer Address"; // Name of the address column in the target sheet

    const addressColIdxTarget = PathaoLib.getColumnIndexByName(targetHeaders, addressColName);
    const updatedAddressValue = targetSheet.getRange(appendedRowNumber, addressColIdxTarget + 1).getValue();

    // Call PathaoLib's findAndSetLocationIds to apply formatting and dropdowns
    PathaoLib.findAndSetLocationIds(targetSheet, appendedRowNumber, updatedAddressValue, targetHeaders);
    // --- END NEW ---
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
    // Return empty object or throw error as per desired error handling
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
  // Remove "Address:" prefix if present, case-insensitive
  address = address.toString().replace(/^(?:Address|Addr)\s*[:\-\s]*/i, '').trim(); // Updated regex
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
  // Ensure getOrFetchPathaoLocations() is accessible, assuming it's in a linked script file
  // This function is globally accessible if both .gs files are in the same Apps Script project.
  const pathaoLocations = typeof getOrFetchPathaoLocations === 'function' ? getOrFetchPathaoLocations() : null;
  const pathaoCities = pathaoLocations ? pathaoLocations.cities : [];
  const pathaoZones = pathaoLocations ? pathaoLocations.zones : [];

  // Regexes for identifying line types (used in First Pass and Formatted Address)
  const namePrefixRegex = /name[\s:_-]*/i; // Removed ^
  const notePrefixRegex = /(?:n[-:]|noted[:\s]*|note[:\s]*)/i; // Removed ^
  const phoneRegex = /(01[1-9]\d{8})\b/g;
  const skuPrefixRegex = /(?:sku|sk)[\s:_-]/i; // Removed ^
  const sizePrefixRegex = /(?:size|s)[\s:_-]/i; // Removed ^
  const priceKeywordRegex = /price[\s:_-]*/i; // Removed ^
  const priceEndRegex = /([-\s\/]|taka|tk)$/i; // For price line identification
  // New: General regex to find numbers potentially associated with currency/price keywords
  const generalPriceRegex = /(?:tk|taka|bdt|price|amount|total)[\s:_-]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d+)?)\b/i;


  // For the final address filtering
  const pureDataKeywordFilter = /^(?:name|sku|sk[\s:_-]|size|s[\s:_-]|qty|note|n[\s:_-]|noted)[\s:_-]*/i;
  const isOnlyPhoneLinePatternFilter = /^\s*(?:phone|contact|mobile|mob)?[\\s:_-]*((01[1-9]\d{8})\b)[\\s.,]*$/i;
  const phoneBlockPatternRemover = /(?:phone|contact|mobile|mob)[\s:_-]*.*?(01[1-9]\d{8})\b/gi;


  // --- Track lines to omit completely from both formatted addresses ---
  const linesToOmitCompletely = new Set();


  // --- 1. First Pass: Extract data and indices ---
  if (lines.length > 0) {
    lines.forEach((originalLine, index) => {
      let line = originalLine.replace(/^(?:Address|Addr)\s*[:\-\s]*/i, '').trim(); // Remove Address prefix from individual lines
      const lowerLine = line.toLowerCase();

      // SKU
      if (skuPrefixRegex.test(lowerLine)) {
        const match = line.match(/(?:sku|sk)[\s:_-]*([\d,\/]+)/i); // Capture numbers, commas and slashes after prefix
        if (match && match[1]) {
          foundSkus.push(...match[1].split(/[,\/]+/).map(s => s.trim())); // Split by comma or slash, trim, push
        }
        lastSkuOrSizeLineIndex = index;
        skuLineFound = true;
        linesToOmitCompletely.add(index);
      }
      // Size
      if (sizePrefixRegex.test(lowerLine)) {
        const match = line.match(/(?:size|s)[\s:_-]*([\d,\/]+)/i); // Capture numbers, commas and slashes after prefix
        if (match && match[1]) {
          foundSizes.push(...match[1].split(/[,\/]+/).map(s => s.trim())); // Split by comma or slash, trim, push
        }
        lastSkuOrSizeLineIndex = index;
        sizeLineFound = true;
        linesToOmitCompletely.add(index);
      }
      // Quantity
      if (lowerLine.includes('qty')) { // No prefix for qty so full line check
        const numbers = line.match(/\d+/g);
        if (numbers) foundQuantities.push(...numbers);
        linesToOmitCompletely.add(index); // Qty lines are pure data, omit
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
        linesToOmitCompletely.add(index); // Note lines are pure data, omit
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
            break; // Found thana, move on
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
            break; // Found district, move on
          }
        }
      }
    });
  }

  // --- Fallback for SKU and Size ---
  if (!skuLineFound && lines.length > 0) {
    const numbersInLine = lines[0].match(/\d+/g);
    if (numbersInLine) {
      console.log("SKU not found by prefix, falling back to first line.");
      foundSkus.push(...numbersInLine);
      linesToOmitCompletely.add(0); // Mark first line for omission
    }
  }
  if (!sizeLineFound && lines.length > 1) {
    const numbersInLine = lines[1].match(/\d+/g);
    if (numbersInLine) {
      console.log("Size not found by prefix, falling back to second line.");
      foundSizes.push(...numbersInLine);
      linesToOmitCompletely.add(1); // Mark second line for omission
    }
  }

  // --- 2. Second Pass: Resolve Name, Price ---
  // Resolve Name
  if (nameFromPrefix) {
    name = nameFromPrefix;
    nameLineIndex = nameLineIndexFromPrefix;
    linesToOmitCompletely.add(nameLineIndex); // Add name line to omit list
  } else if (lastSkuOrSizeLineIndex !== -1 && lastSkuOrSizeLineIndex < lines.length - 1) {
    nameLineIndex = lastSkuOrSizeLineIndex + 1;
    name = lines[nameLineIndex].trim();
    linesToOmitCompletely.add(nameLineIndex); // Add fallback name line to omit list
  }

  // Resolve Price (Enhanced Logic)
  for (let i = 0; i < lines.length; i++) {
    // Skip lines already identified as specific data (e.g., phone, SKU, etc.)
    if (linesToOmitCompletely.has(i)) {
      continue;
    }
    
    const lowerLine = lines[i].toLowerCase();
    let match;

    // Highest priority: Explicit price keyword at beginning
    if (priceKeywordRegex.test(lowerLine)) {
      const numbers = lines[i].match(/\d+(\.\d+)?/g); // Capture decimals
      if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = i; break; }
    }

    // Second priority: General price patterns (currency, amount, total)
    match = lines[i].match(generalPriceRegex);
    if (match && match[2]) { // match[2] captures the number
      price = match[2].replace(/,/g, ''); // Remove commas from number
      priceLineIndex = i;
      break;
    }
    
    // Third priority: End of line with taka/tk
    if (priceEndRegex.test(lowerLine)) {
        const numbers = lines[i].match(/\d+(\.\d+)?/g); // Capture decimals
        if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = i; break; }
    }
  }
  if (price === '' && lines.length > 0) { // Lowest priority: Last line check for any number
    const lastLine = lines[lines.length - 1].trim();
    const numbers = lastLine.match(/\d+(\.\d+)?/g); // Capture decimals
    if (numbers && numbers.length > 0) { price = numbers[0]; priceLineIndex = lines.length - 1; }
  }
  // Ensure price is a clean number string
  price = price ? price.toString().replace(/[^0-9.]/g, '') : '';
  if (priceLineIndex !== -1) linesToOmitCompletely.add(priceLineIndex);


  // --- 3. Data Extraction Complete ---
  // --- 4. Create and Return Original Formatted Address ---
  const originalFormattedAddressLines = [];
  if (addressLinesOriginal.length > 0) {
    originalFormattedAddressLines.forEach((originalLine, index) => {
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
  if (lines.length > 0) {
    lines.forEach((translatedLine, index) => {
      if (!linesToOmitCompletely.has(index)) { // Only process lines not already marked for full omission
        let cleanLine = translatedLine.replace(phoneBlockPatternRemover, '');
        cleanLine = cleanLine.replace(/^[.,\s-_]*/, '').trim();
        if (cleanLine) {
          formattedAddressLines.push(cleanLine);
        }
      }
    });
  }
  const finalFormattedAddress = formattedAddressLines.join('\n');

  console.log('Row processing complete.');

  // Return all extracted data
  return {
    name: name,
    sku: foundSkus.join('/'),
    size: (foundSkus.length > 1 && foundSizes.length === 1) ? Array(foundSkus.length).fill(foundSizes[0]).join('/') : foundSizes.join('/'),
    quantity: foundQuantities.length > 0 ? foundQuantities.join('/') : (foundSkus.length > 0 ? foundSkus.length.toString() : ''),
    phone: foundPhones.join(','),
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
  try {
    const targetSpreadsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const targetSheet = targetSpreadsheet.getSheetByName("Dress Query/Order"); // Assuming gid: "0" means the first sheet

    const targetHeaders = [
      "Query No", "Website Order No", "Initiate By", "Page Name", "Order Date",
      "Product List", "Product SKU", "Product QTY", "Product Price", "COD",
      "Size", "Note 1", "Payment Status", "Customer Name", "Phone",
      "Customer Address", "District", "District ID", "Thana", "Thana ID", "Order Status", "Delivery Method",
      "Order Invoice No.", "Courier Tracking No", "Bill Date", "StoreName",
      "Delivery Waiting Time"
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
    mapValue("Query No", targetSheet.getLastRow()-1);
    mapValue("Website Order No", "");
    mapValue("Initiate By", processedData.initiateBy);
    mapValue("Page Name", processedData.pageName);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mmmm = today.toLocaleString('en-US', { month: 'long' }); // Full month name
    const yyyy = today.getFullYear();
    mapValue("Order Date", `${dd}-${mmmm}-${yyyy}`); // Formatted current date for order date
    mapValue("Product List", "");
    mapValue("Product SKU", processedData.sku);
    mapValue("Product QTY", processedData.quantity);
    mapValue("Product Price", processedData.price);
    mapValue("COD", ""); // Blank for now, will get from processedData later
    mapValue("Size", processedData.size);
    mapValue("Note 1", processedData.note);
    mapValue("Payment Status", ""); // Blank for now, will get from processedData later
    mapValue("Customer Name", processedData.name);
    mapValue("Phone", processedData.phone);
    mapValue("Customer Address", processedData.formattedAddress);
    mapValue("District", processedData.district);
    mapValue("District ID", processedData.cityId);
    mapValue("Thana", processedData.thana);
    mapValue("Thana ID", processedData.zoneId);
    mapValue("Order Status", "");
    mapValue("Delivery Method", "");
    mapValue("Order Invoice No.", ""); // Explicitly set to blank
    mapValue("Courier Tracking No", "");
    mapValue("Bill Date", ""); // Explicitly set to blank
    mapValue("StoreName", "");
    mapValue("Delivery Waiting Time", "");

    targetSheet.appendRow(newRowData);
    const appendedRowNumber = targetSheet.getLastRow();
    console.log(`Data written to target sheet.`);
    return { targetSheet: targetSheet, appendedRowNumber: appendedRowNumber }; // Return these values
  } catch (error) {
    console.error("Error writing data to target sheet: " + error.toString());
    // In case of error, return null or throw to indicate failure
    throw new Error("Failed to write processed data to target sheet: " + error.toString());
  }
}