/**
 * DIAGNOSTIC TOOL: Check Steadfast API Connection
 * Run this function in the Apps Script editor to see the actual response from Steadfast.
 */
function debugSteadfastConnection() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('STEADFAST_API_KEY');
  const secretKey = props.getProperty('STEADFAST_SECRET_KEY');
  
  if (!apiKey || !secretKey) {
    console.error("Error: Steadfast API keys are missing from Script Properties.");
    return;
  }
  
  console.log("Testing connection with API Key: " + apiKey.substring(0, 5) + "...");
  
  const url = "https://portal.packzy.com/api/v1/get_balance";
  const options = {
    method: 'get',
    headers: {
      'Api-Key': apiKey,
      'Secret-Key': secretKey,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const content = response.getContentText();
    
    console.log("HTTP Status Code: " + code);
    console.log("Raw Response Content: " + content);
    
    if (code === 200) {
      const data = JSON.parse(content);
      if (data.status === 200) {
        console.log("Success! Current Balance: " + data.current_balance);
      } else {
        console.warn("API returned error status: " + data.status + " - " + data.message);
      }
    } else {
      console.error("Server returned an error. Check if your API keys are correct and active.");
    }
  } catch (e) {
    console.error("Execution Error: " + e.message);
  }
}
