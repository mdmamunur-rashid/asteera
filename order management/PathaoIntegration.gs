/**
 * Pathao Courier Integration for Google Sheets.
 * This script integrates with the Pathao Courier Merchant API to create new orders
 * based on data in a designated Google Sheet.
 */

// =================================== CONFIGURATION ===================================
// Target Google Sheet where order data is stored (This is the new sheet created by code.js)
const TARGET_SPREADSHEET_ID_ORDERS = "1Ad1xyjH96HKUMt5BijlBgpqKuzcd8JZf0NBdm0OhA7A";
const TARGET_SHEET_NAME_ORDERS = "Dress Query/Order"; 
// Column names in the TARGET_SHEET_NAME_ORDERS
const ORDER_STATUS_COL_NAME = "Order Status";
const ORDER_INVOICE_NO_COL_NAME = "Order Invoice No.";
const CUSTOMER_NAME_COL_NAME = "Customer Name";
const PHONE_COL_NAME = "Phone";
const CUSTOMER_ADDRESS_COL_NAME = "Customer Address";
const PRODUCT_SKU_COL_NAME = "Product SKU";
const PRODUCT_QTY_COL_NAME = "Product QTY";
const PRODUCT_PRICE_COL_NAME = "Product Price"; // Renamed from PRICE to Price
const NOTE_COL_NAME = "Note 1";
const COURIER_TRACKING_NO_COL_NAME = "Courier Tracking No";
const COD_COL_NAME = "COD"; // New constant for COD column
const PAYMENT_STATUS_COL_NAME = "Payment Status"; // New constant for Payment Status column
const DISTRICT_COL_NAME = "District";       // New
const BILL_DATE_COL_NAME = "Bill Date";     // New
const DELIVERY_METHOD_COL_NAME = "Delivery Method"; // Restored
const PATHAO_ADDRESSES_SHEET_NAME = "pathao addresses"; // Added missing constant

// Order Status values
const ORDER_STATUS_BILLED = "Billed";
const ORDER_STATUS_PATHAO_CREATED = "In Courier";
const ORDER_STATUS_PATHAO_FAILED = "Hold";
const ORDER_STATUS_IN_COURIER = "In Courier"; // New status
const AREA_ID_COL_NAME = "Area ID";         // New
const AREA_COL_NAME = "Area";               // New


// Payment Status values
const PAYMENT_STATUS_COD = "COD"; // New constant for COD status
const PAYMENT_STATUS_PAID = "Paid"; // New constant for Paid status

// Pathao specific order details (defaults, can be configured via sidebar)
const PATHAO_DELIVERY_TYPE = 48; // 48 for Normal Delivery
const PATHAO_ITEM_TYPE = 2;     // 2 for Parcel
const PATHAO_ITEM_WEIGHT = 0.5; // Default item weight in KG

// New Properties for owner-managed credentials
const PATHAO_CLIENT_ID_PROPERTY = 'PATHAO_CLIENT_ID';
const PATHAO_CLIENT_SECRET_PROPERTY = 'PATHAO_CLIENT_SECRET';
const PATHAO_USERNAME_PROPERTY = 'PATHAO_USERNAME';
const PATHAO_PASSWORD_PROPERTY = 'PATHAO_PASSWORD';
const PATHAO_BASE_URL_PROPERTY = 'PATHAO_BASE_URL';
const PATHAO_STORE_ID_PROPERTY = 'PATHAO_STORE_ID';
const ADMIN_PASSWORD_HASH_PROPERTY = 'ADMIN_PASSWORD_HASH';
const SCRIPT_OWNER_EMAIL_PROPERTY = 'SCRIPT_OWNER_EMAIL'; // To store owner's email

// =====================================================================================


/**
 * Creates a custom menu in the Google Sheet UI when the spreadsheet is opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Asteera Orders')
      .addItem('📦 Generate Bills (Instant)', 'generateInvoices')
      .addSeparator()
      .addItem('🚀 Generate All Courier Orders', 'generateAllCourierOrders')
      .addItem('🚚 Generate Pathao Orders', 'generatePathaoOrders')
      .addItem('🐎 Generate Steadfast Orders', 'generateSteadfastOrders')
      .addSeparator()
      .addItem('⚙️ Configure Pathao API', 'showConfigSidebar')
      .addItem('⚙️ Configure Steadfast API', 'showSteadfastConfigSidebar')
      .addSeparator()
      .addItem('🧹 Clean Up Old Triggers', 'cleanupOldTriggers')
      .addSeparator()
      .addItem('📖 Show Integration Guide', 'showIntegrationGuide');

  const props = PropertiesService.getScriptProperties();
  const ownerEmail = props.getProperty(SCRIPT_OWNER_EMAIL_PROPERTY);
  const adminPasswordHash = props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY);

  // Add owner-specific menu items
  if (Session.getEffectiveUser().getEmail() === ownerEmail) { 
    if (!adminPasswordHash) {
      menu.addItem('Set Admin Password (Owner Only)', 'setInitialAdminPassword');
    }
  }
  menu.addToUi();
}

/**
 * Triggers both Pathao and Steadfast generation logic.
 */
function generateAllCourierOrders() {
  console.log("Starting Bulk Courier Order Generation...");
  generatePathaoOrders();
  generateSteadfastOrders();
}

/**
 * Ensures that all required columns exist in the sheet, adding any that are missing.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to check.
 * @param {string[]} requiredColumns An array of required column header names.
 */
function ensureColumnsExist(sheet, requiredColumns) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const existingColumns = new Set(headers);
  let lastColumn = sheet.getLastColumn();

  requiredColumns.forEach(columnName => {
    if (!existingColumns.has(columnName)) {
      console.log(`Column "${columnName}" not found. Adding it to the sheet.`);
      lastColumn++;
      sheet.getRange(1, lastColumn).setValue(columnName);
    }
  });
}





/**
 * Main function to generate Pathao orders for rows with "Billed" status.
 */
function generatePathaoOrders() {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    console.log("ERP Context: UI not available.");
  }
  
  let accessToken;

  // Get configuration from PropertiesService
  const config = getStoredConfig();
  if (!config.clientId || !config.clientSecret || !config.username || !config.password || !config.baseUrl || !config.pathaoStoreId) {
    if (ui) ui.alert('Configuration Error', 'Pathao API credentials or Store ID are incomplete. Please ensure the script owner has set them via `setInitialAdminPassword()` function and filled out all fields in the sidebar.', ui.ButtonSet.OK);
    return { success: false, message: "Pathao credentials missing." };
  }
  
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
  const sheet = ss.getSheetByName(TARGET_SHEET_NAME_ORDERS);

  if (!sheet) {
    if (ui) ui.alert('Sheet Error', `Sheet "${TARGET_SHEET_NAME_ORDERS}" not found in the target spreadsheet.`, ui.ButtonSet.OK);
    return { success: false, message: "Sheet not found." };
  }

  // --- Ensure all required columns exist ---
    const requiredColumns = [
      ORDER_STATUS_COL_NAME, ORDER_INVOICE_NO_COL_NAME, CUSTOMER_NAME_COL_NAME,
      PHONE_COL_NAME, CUSTOMER_ADDRESS_COL_NAME, PRODUCT_SKU_COL_NAME,
      PRODUCT_QTY_COL_NAME, PRODUCT_PRICE_COL_NAME, NOTE_COL_NAME,
      COURIER_TRACKING_NO_COL_NAME, PAYMENT_STATUS_COL_NAME, COD_COL_NAME,
      DISTRICT_COL_NAME, BILL_DATE_COL_NAME, DELIVERY_METHOD_COL_NAME
    ];
    ensureColumnsExist(sheet, requiredColumns);
    // --- End of column check ---
  
    try {
      accessToken = getAccessToken(config); // Pass config to getAccessToken
      if (!accessToken) {
        ui.alert('Pathao API Error', 'Could not obtain Pathao access token. Please check credentials.', ui.ButtonSet.OK);
        return;
      }
    } catch (e) {
      ui.alert('Pathao API Error', 'Error obtaining Pathao access token: ' + e.message, ui.ButtonSet.OK);
      return;
    }
  
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; // Re-fetch headers after ensuring columns
  
    // Get column indices
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
    const paymentStatusColIdx = getColumnIndexByName(headers, PAYMENT_STATUS_COL_NAME);
    const codColIdx = getColumnIndexByName(headers, COD_COL_NAME);
    const billDateColIdx = getColumnIndexByName(headers, BILL_DATE_COL_NAME);
    const deliveryMethodColIdx = getColumnIndexByName(headers, DELIVERY_METHOD_COL_NAME);
    const pageNameColIdx = getColumnIndexByName(headers, "Page Name");
  
    let ordersCreatedCount = 0;
    let skippedNonPathaoCount = 0;
    let errorCount = 0;
    const rowsToUpdate = [];
  
    for (let i = 1; i < values.length; i++) { // Start from 1 to skip headers
      const rowData = values[i];
      const orderStatus = rowData[orderStatusColIdx];
      const courierTrackingNo = rowData[courierTrackingNoColIdx];
      const deliveryMethod = String(rowData[deliveryMethodColIdx] || "").trim().toLowerCase();
  
      // Check Order Status and Tracking No
      if (orderStatus === ORDER_STATUS_BILLED && (!courierTrackingNo || courierTrackingNo.toString().trim() === '')) {
        
        // NEW FILTER: Only process if Delivery Method is "Pathao"
        if (deliveryMethod !== "pathao") {
          skippedNonPathaoCount++;
          continue;
        }
  
        // This order needs to be created in Pathao
  
          const recipientAddress = rowData[customerAddressColIdx];
          let orderInvoiceNo = rowData[orderInvoiceNoColIdx];
          const recipientName = rowData[customerNameColIdx];
          let recipientPhone = rowData[phoneColIdx].toString().replace(/[^0-9]/g, ''); 
          if (recipientPhone.length === 10 && !recipientPhone.startsWith('0')) recipientPhone = '0' + recipientPhone;
          if (recipientPhone.length > 11) {
            recipientPhone = recipientPhone.substring(recipientPhone.length - 11);
          }
    
          const productSku = rowData[productSkuColIdx];
          const productQty = rowData[productQtyColIdx];
          const productPrice = rowData[productPriceColIdx];
          const note = rowData[noteColIdx];
          const codValue = rowData[codColIdx];
          const pageName = pageNameColIdx !== -1 ? rowData[pageNameColIdx] : "Asteera";
    
          // Construct item_description
          const itemDescription = `SKU: ${productSku}, Qty: ${productQty}, Price: ${productPrice}, Note: ${note || 'N/A'}`;
          
          let amountToCollect = 0;
          let paymentStatus = PAYMENT_STATUS_PAID;
    
          if (codValue && !isNaN(parseFloat(codValue)) && parseFloat(codValue) > 0) {
            amountToCollect = Math.round(parseFloat(codValue));
            paymentStatus = PAYMENT_STATUS_COD;
          }
    
          const orderPayload = {
            store_id: parseInt(config.pathaoStoreId, 10),
            merchant_order_id: orderInvoiceNo.toString(),
            recipient_name: recipientName.toString(),
            recipient_phone: recipientPhone,
            recipient_address: recipientAddress.toString(),
            delivery_type: 48,
            item_type: 2,
            special_instruction: note ? note.toString() : '',
            item_quantity: parseInt(productQty, 10),
            item_weight: "0.5",
            item_description: itemDescription,
            amount_to_collect: amountToCollect
          };
    
      
      // Basic validation
      if (!orderPayload.store_id) { // Check if store_id is set
        ui.alert('Configuration Error', `Pathao Store ID is not configured. Please ensure the script owner has set it via \`setInitialAdminPassword()\` function. Skipping Order Invoice No: ${orderInvoiceNo}`, ui.ButtonSet.OK);
        continue;
      }
      
      if (!orderPayload.recipient_name || !orderPayload.recipient_phone || !orderPayload.recipient_address || !orderPayload.item_quantity) {
        console.error(`Missing required fields for Order Invoice No: ${orderInvoiceNo}. Skipping.`);
        rowsToUpdate.push({ row: i + 1, status: ORDER_STATUS_PATHAO_FAILED, trackingNo: 'Missing data', paymentStatus: '' });
        continue;
      }


      try {
        console.log(`Attempting to create Pathao order for Invoice No: ${orderInvoiceNo}`);
        const pathaoResponse = createPathaoOrder(orderPayload, accessToken, config.baseUrl); // Pass baseUrl to createPathaoOrder

        if (pathaoResponse && pathaoResponse.consignment_id) {
          rowsToUpdate.push({ row: i + 1, status: ORDER_STATUS_IN_COURIER, trackingNo: pathaoResponse.consignment_id, paymentStatus: paymentStatus, invoiceNo: orderInvoiceNo }); // Changed status
          ordersCreatedCount++;
          console.log(`Successfully created Pathao order ${pathaoResponse.consignment_id} for Invoice No: ${orderInvoiceNo}`);
          
          // --- TRIGGER SMS NOTIFICATION ---
          if (typeof sendAsteeraSMS === 'function') {
            const callCenter = getBrandingPhone(pageName);
            const smsMessage = `Dear ${recipientName.toString().toUpperCase()}!\nYour order has been shift to pathao courier.\nAmount: ${amountToCollect}\nCall Center: ${callCenter}\nThanks\n${pageName}`;
            sendAsteeraSMS(recipientPhone, smsMessage);
          }
        } else {
          const errorMessage = pathaoResponse && pathaoResponse.message ? pathaoResponse.message : 'Unknown API error';
          rowsToUpdate.push({ row: i + 1, status: ORDER_STATUS_PATHAO_FAILED, trackingNo: `Error: ${errorMessage}`, paymentStatus: '', invoiceNo: orderInvoiceNo });
          console.error(`Failed to create Pathao order for Invoice No: ${orderInvoiceNo}. Response: ${JSON.stringify(pathaoResponse)}`);
        }
        
        // ADDED DELAY TO PREVENT RATE LIMITING
        Utilities.sleep(500); 

      } catch (apiError) {
        rowsToUpdate.push({ row: i + 1, status: ORDER_STATUS_PATHAO_FAILED, trackingNo: `API Error: ${apiError.message}`, paymentStatus: '', invoiceNo: orderInvoiceNo });
        console.error(`Exception during Pathao order creation for Invoice No: ${orderInvoiceNo}: ${apiError.message}`);
      }
    }
  }

  // Update the sheet with results
  sheet.getRange(1, 1).activate(); // De-select any active cells to prevent issues
  for (const update of rowsToUpdate) {
    sheet.getRange(update.row, orderStatusColIdx + 1).setValue(update.status);
    sheet.getRange(update.row, courierTrackingNoColIdx + 1).setValue(update.trackingNo);
    if (update.invoiceNo) {
      sheet.getRange(update.row, orderInvoiceNoColIdx + 1).setValue(update.invoiceNo);
    }
    if (update.paymentStatus) { // Only update if paymentStatus was determined
      sheet.getRange(update.row, paymentStatusColIdx + 1).setValue(update.paymentStatus);
    }
  }

  // Update Status Summary if any orders were successfully created
  if (ordersCreatedCount > 0) {
    if (typeof updateStatusSummary === 'function') {
      updateStatusSummary();
    }
  }

  if (ordersCreatedCount > 0 || skippedNonPathaoCount > 0) {
    let msg = `Processing Finished:\n\n`;
    msg += `✅ Pathao Orders Created: ${ordersCreatedCount}\n`;
    msg += `⏩ Non-Pathao Orders Skipped: ${skippedNonPathaoCount}\n`;
    if (errorCount > 0) msg += `❌ Failed: ${errorCount}\n`;

    if (ui) ui.alert('Pathao Integration Summary', msg, ui.ButtonSet.OK);
    return { success: true, message: `Created: ${ordersCreatedCount}, Skipped: ${skippedNonPathaoCount}` };
  } else {
    if (ui) ui.alert('Pathao Orders Generated', 'No new "Billed" orders found to generate in Pathao.', ui.ButtonSet.OK);
    return { success: false, message: "No orders created." };
  }
}

/**
 * Gets a valid Pathao API access token, refreshing if necessary.
 * Stores tokens in PropertiesService for persistence.
 * @param {Object} config The Pathao API configuration from PropertiesService.
 * @returns {string|null} The access token, or null if unable to obtain.
 */
function getAccessToken(config) { // Accept config parameter
  const props = PropertiesService.getScriptProperties();
  const storedAccessToken = props.getProperty('PATHAO_ACCESS_TOKEN');
  const storedRefreshToken = props.getProperty('PATHAO_REFRESH_TOKEN');
  const tokenExpiryTime = props.getProperty('PATHAO_TOKEN_EXPIRY'); // Unix timestamp

  // Check if existing token is still valid
  if (storedAccessToken && tokenExpiryTime && Date.now() < parseInt(tokenExpiryTime, 10)) {
    console.log('Using stored valid access token.');
    return storedAccessToken;
  }

  console.log('Access token expired or not found. Attempting to get new token.');

  let payload;
  let url = `${config.baseUrl}/aladdin/api/v1/issue-token`; // Use config.baseUrl

  if (storedRefreshToken) {
    console.log('Attempting to refresh token...');
    payload = {
      client_id: config.clientId, // Use config.clientId
      client_secret: config.clientSecret, // Use config.clientSecret
      grant_type: 'refresh_token',
      refresh_token: storedRefreshToken
    };
  } else {
    console.log('No refresh token found. Attempting initial token grant with username/password...');
    payload = {
      client_id: config.clientId, // Use config.clientId
      client_secret: config.clientSecret, // Use config.clientSecret
      grant_type: 'password',
      username: config.username, // Use config.username
      password: config.password // Use config.password
    };
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const responseJson = JSON.parse(responseText);

    if (responseCode === 200 && responseJson.access_token) {
      const expiresInMillis = responseJson.expires_in * 1000; // Convert seconds to milliseconds
      const newExpiryTime = Date.now() + expiresInMillis - (5 * 60 * 1000); // 5 mins buffer

      props.setProperty('PATHAO_ACCESS_TOKEN', responseJson.access_token);
      props.setProperty('PATHAO_REFRESH_TOKEN', responseJson.refresh_token);
      props.setProperty('PATHAO_TOKEN_EXPIRY', newExpiryTime.toString());

      console.log('Successfully obtained and stored new access token.');
      return responseJson.access_token;
    } else {
      console.error(`Failed to get access token. Status: ${responseCode}, Response: ${responseText}`);
      throw new Error(`Pathao API token error: ${responseJson.message || 'Unknown error'}`);
    }
  } catch (e) {
    console.error('Error in getAccessToken: ' + e.message);
    throw e;
  }
}

/**
 * Internal helper to get a valid Pathao API access token for functions not directly passed config.
 * Relies on config being set in PropertiesService.
 * @returns {string|null} The access token, or null if unable to obtain.
 * @private
 */
function _getAuthTokenForPathaoIntegration() {
  const config = getStoredConfig();
  if (!config.clientId || !config.clientSecret || !config.username || !config.password || !config.baseUrl) {
    console.error('Pathao API configuration is incomplete. Cannot get access token.');
    return null;
  }
  return getAccessToken(config);
}


/**
 * Calls the Pathao API to create a new order.
 * @param {Object} orderPayload The data for the Pathao order.
 * @param {string} accessToken The Pathao API access token.
 * @param {string} baseUrl The base URL for the Pathao API.
 * @returns {Object|null} The Pathao API response data on success, or null/error object on failure.
 */
function createPathaoOrder(orderPayload, accessToken, baseUrl) { // Accept baseUrl parameter
  const url = `${baseUrl}/aladdin/api/v1/orders`; // Use passed baseUrl
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    payload: JSON.stringify(orderPayload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const responseJson = JSON.parse(responseText);

    if (responseCode === 200 && responseJson.data && responseJson.data.consignment_id) {
      console.log(`Pathao order created successfully: ${responseJson.data.consignment_id}`);
      return responseJson.data;
    } else {
      console.error(`Pathao order creation failed. Status: ${responseCode}, Response: ${responseText}`);
      return { success: false, message: responseJson.message || 'API error', details: responseJson };
    }
  } catch (e) {
    console.error('Error in createPathaoOrder: ' + e.message);
    throw e;
  }
}

/**
 * Helper to find column index by name.
 */
function getColumnIndexByName(headers, headerName) {
  const cleanTarget = headerName.toLowerCase().trim().replace(/\s+/g, ' ');
  const lowerHeaders = headers.map(h => h.toString().toLowerCase().trim().replace(/\s+/g, ' '));
  return lowerHeaders.indexOf(cleanTarget);
}

/**
 * Retrieves the stored Pathao API configuration from PropertiesService.
 * @returns {Object} An object containing the configuration values.
 */
function getStoredConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    clientId: props.getProperty(PATHAO_CLIENT_ID_PROPERTY),
    clientSecret: props.getProperty(PATHAO_CLIENT_SECRET_PROPERTY),
    username: props.getProperty(PATHAO_USERNAME_PROPERTY),
    password: props.getProperty(PATHAO_PASSWORD_PROPERTY),
    baseUrl: props.getProperty(PATHAO_BASE_URL_PROPERTY),
    pathaoStoreId: props.getProperty(PATHAO_STORE_ID_PROPERTY)
  };
}

/**
 * Saves the Pathao API configuration to PropertiesService.
 * Validates the admin password before saving.
 * @param {Object} config The configuration object from the sidebar.
 * @returns {boolean} True if successfully saved, false otherwise.
 */
function saveConfig(config) {
  const props = PropertiesService.getScriptProperties();
  
  // Basic validation of admin password (simple hash check if it was set)
  const storedHash = props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY);
  if (storedHash) {
    // Note: Simple string matching for now since Google Apps Script's 
    // Utilities.computeDigest is for SHA-256 etc but requires a specific implementation for full security.
    // For this context, we'll assume a direct match or a simple hash check.
    const inputHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, config.adminPassword));
    if (inputHash !== storedHash) {
      throw new Error("Invalid Admin Password.");
    }
  }

  // Clear existing tokens to force refresh with new credentials
  props.deleteProperty('PATHAO_ACCESS_TOKEN');
  props.deleteProperty('PATHAO_REFRESH_TOKEN');
  props.deleteProperty('PATHAO_TOKEN_EXPIRY');

  props.setProperty(PATHAO_CLIENT_ID_PROPERTY, config.clientId);
  props.setProperty(PATHAO_CLIENT_SECRET_PROPERTY, config.clientSecret);
  props.setProperty(PATHAO_USERNAME_PROPERTY, config.username);
  props.setProperty(PATHAO_PASSWORD_PROPERTY, config.password);
  props.setProperty(PATHAO_BASE_URL_PROPERTY, config.baseUrl);
  props.setProperty(PATHAO_STORE_ID_PROPERTY, config.pathaoStoreId);

  // --- NEW: Save to invisible Spreadsheet Metadata for ERP sharing ---
  try {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
    const prefix = "ASTEERA_CONFIG_";
    const data = {
      CLIENT_ID: config.clientId,
      CLIENT_SECRET: config.clientSecret,
      USERNAME: config.username,
      PASSWORD: config.password,
      BASE_URL: config.baseUrl,
      STORE_ID: config.pathaoStoreId
    };
    
    // Clear old metadata first
    ss.getDeveloperMetadata().forEach(m => {
      if (m.getKey().startsWith(prefix)) m.remove();
    });
    
    // Add new metadata
    Object.keys(data).forEach(key => {
      ss.addDeveloperMetadata(prefix + key, data[key], SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
    });

    // Cleanup: Remove the temporary hidden sheet if it was created previously
    const oldSheet = ss.getSheetByName("API_Config");
    if (oldSheet) ss.deleteSheet(oldSheet);

  } catch (e) {
    console.error("Error sharing config via metadata: " + e.message);
  }
  // ------------------------------------------------

  return true;
}

/**
 * Displays the Pathao API configuration sidebar.
 */
function showConfigSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('PathaoConfig')
      .setTitle('Pathao API Configuration')
      .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Fetches the latest Pathao location data (cities and zones) and caches it.
 * Also writes the data to the "pathao addresses" sheet.
 */
function fetchPathaoLocations() {
  const config = getStoredConfig();
  const accessToken = getAccessToken(config);
  if (!accessToken) throw new Error("Could not obtain access token.");

  const props = PropertiesService.getScriptProperties();
  const cityUrl = `${config.baseUrl}/aladdin/api/v1/city-list`;
  const options = {
    method: 'get',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    muteHttpExceptions: true
  };

  const cityResponse = UrlFetchApp.fetch(cityUrl, options);
  const cities = JSON.parse(cityResponse.getContentText()).data.data;

  const allZones = [];
  for (const city of cities) {
    const zoneUrl = `${config.baseUrl}/aladdin/api/v1/cities/${city.city_id}/zone-list`;
    const zoneResponse = UrlFetchApp.fetch(zoneUrl, options);
    const zones = JSON.parse(zoneResponse.getContentText()).data.data;
    zones.forEach(z => z.city_id = city.city_id); // Ensure city_id is attached
    allZones.push(...zones);
    Utilities.sleep(300); // Respect rate limits
  }

  const locationData = {
    cities: cities.map(c => ({ id: c.city_id, name: c.city_name })),
    zones: allZones.map(z => ({ id: z.zone_id, name: z.zone_name, city_id: z.city_id })),
    timestamp: Date.now()
  };

  props.setProperty('PATHAO_LOCATIONS_CACHE', JSON.stringify(locationData));
  
  // Update the visual sheet
  let ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID_ORDERS);
  let sheet = ss.getSheetByName(PATHAO_ADDRESSES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PATHAO_ADDRESSES_SHEET_NAME);
  }
  sheet.clear();
  sheet.appendRow(['Type', 'ID', 'Name', 'Parent ID']);
  cities.forEach(c => sheet.appendRow(['City', c.city_id, c.city_name, '']));
  allZones.forEach(z => sheet.appendRow(['Zone', z.zone_id, z.zone_name, z.city_id]));

    return locationData;
  }
  
  /**
   * Gets cached location data or fetches it if not available.
   * @returns {Object} The location data containing cities and zones.
   */
  function getOrFetchPathaoLocations() {
    const props = PropertiesService.getScriptProperties();
    const cache = props.getProperty('PATHAO_LOCATIONS_CACHE');
    if (cache) {
      try {
        return JSON.parse(cache);
      } catch (e) {
        console.error("Error parsing location cache: " + e.toString());
      }
    }
    return fetchPathaoLocations();
  }
  