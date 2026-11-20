/**
 * ============================================================
 *  SHARED HELPERS
 * ============================================================
 */

/**
 * The spreadsheet this script is bound to.
 * getActiveSpreadsheet() works inside a SIMPLE onEdit trigger (no auth
 * required); openById() does NOT and would throw. Fall back to openById
 * only for standalone/manual contexts where there is no active sheet.
 */
function getActiveSS_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** Resolve a sheet by its stable gid (rename-proof). */
function getSheet(def) {
  const ss = getActiveSS_();
  const sheets = ss.getSheets();
  for (const sh of sheets) {
    if (sh.getSheetId() === def.gid) return sh;
  }
  throw new Error("Sheet with gid " + def.gid + " not found.");
}

/** Read all data rows (below header) as a 2D array. */
function getDataRows(def) {
  const sh = getSheet(def);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < def.data) return [];
  return sh.getRange(def.data, 1, lastRow - def.data + 1, lastCol).getValues();
}

/** Parse a numeric value from anything (strips ৳, commas, etc.). */
function toNum(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Normalize text for comparison. */
function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

/**
 * Map a raw Work Status to a canonical bucket. Recognizes the
 * sheet's real vocabulary ("Done", "Processing") plus synonyms.
 * Returns: 'notStarted' | 'inProgress' | 'completed' | 'onHold'.
 * A blank status (on a real batch row) counts as 'notStarted'.
 */
function statusBucket(raw) {
  const s = norm(raw);
  if (!s) return "notStarted";
  if (s.indexOf("done") !== -1 || s.indexOf("complete") !== -1 ||
      s.indexOf("deliver") !== -1 || s.indexOf("finish") !== -1) return "completed";
  if (s.indexOf("hold") !== -1) return "onHold";
  if (s.indexOf("not start") !== -1 || s.indexOf("pending") !== -1 ||
      s.indexOf("yet") !== -1 || s === "na" || s === "n/a") return "notStarted";
  return "inProgress"; // processing / in progress / wip / running / etc.
}

/** True when a Work Status means the stage is finished. */
function isStageComplete(raw) {
  return statusBucket(raw) === "completed";
}

/** Build SKU -> {fabricPerUnit, productName, selaiCost, printRate} from SKU Fabric Need. */
function getSkuFabricMap() {
  const rows = getDataRows(SHEETS.SKU_FABRIC);
  const map = {};
  rows.forEach(r => {
    const sku = String(r[COL_SKU_FABRIC.SKU - 1]).trim();
    if (!sku) return;
    map[sku] = {
      fabricPerUnit: toNum(r[COL_SKU_FABRIC.FABRIC_PER_UNIT - 1]),
      productName:   String(r[COL_SKU_FABRIC.PRODUCT_NAME - 1] || "").trim(),
      selaiCost:     toNum(r[COL_SKU_FABRIC.SELAI_COST - 1]),
      printRate:     toNum(r[COL_SKU_FABRIC.PRINT_RATE - 1])
    };
  });
  return map;
}

/** Global fallbacks: first non-zero selai / print rate found in SKU Fabric Need. */
function getGlobalRates() {
  const rows = getDataRows(SHEETS.SKU_FABRIC);
  let selai = 0, print = 0;
  rows.forEach(r => {
    if (!selai) selai = toNum(r[COL_SKU_FABRIC.SELAI_COST - 1]);
    if (!print) print = toNum(r[COL_SKU_FABRIC.PRINT_RATE - 1]);
  });
  return {
    selai: selai || CONFIG.DEFAULT_SELAI_COST,
    print: print || CONFIG.DEFAULT_PRINT_RATE
  };
}

/** Supplier maps: byId[id] = {name,type}; byName[lowername] = {id,type}. */
function getSupplierMaps() {
  const rows = getDataRows(SHEETS.SUPPLIERS);
  const byId = {}, byName = {};
  rows.forEach(r => {
    const name = String(r[COL_SUPPLIER.NAME - 1] || "").trim();
    const type = String(r[COL_SUPPLIER.TYPE - 1] || "").trim();
    const id   = String(r[COL_SUPPLIER.ID - 1] || "").trim();
    if (id)   byId[id] = { name, type };
    if (name) byName[name.toLowerCase()] = { id, type };
  });
  return { byId, byName };
}

/** Cross-fill supplier name<->id on a row (idCol/nameCol are 1-based). */
function resolveSupplier(row, idCol, nameCol, byId, byName) {
  const id   = String(row[idCol - 1] || "").trim();
  const name = String(row[nameCol - 1] || "").trim();
  if (id && byId[id]) {
    row[nameCol - 1] = byId[id].name;            // ID wins if both present
  } else if (name && byName[name.toLowerCase()]) {
    row[idCol - 1] = byName[name.toLowerCase()].id;
  }
}
