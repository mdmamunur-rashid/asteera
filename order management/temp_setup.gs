/**
 * TEMPORARY SETUP FUNCTION
 * Run this function ONCE in the Apps Script editor to update your Steadfast API keys.
 * After running, you can delete this function or this file.
 */
function tempSetupSteadfastKeys() {
  const apiKey = "uzs38z5oxsjzyat8iukc85bef3a8debn";
  const secretKey = "gprbustgwu42kowin09tczwi";
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('STEADFAST_API_KEY', apiKey);
  props.setProperty('STEADFAST_SECRET_KEY', secretKey);
  
  console.log("Steadfast API keys have been updated successfully.");
}
