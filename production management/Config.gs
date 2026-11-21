/**
 * ============================================================
 *  ASTEERA PRODUCTION MANAGEMENT — CONFIGURATION
 *  Single source of truth for spreadsheet ID, sheet gids,
 *  header rows, and column positions (all 1-based).
 *
 *  Sheets are resolved by gid (sheet ID), NOT by name, because
 *  several tabs use emojis / trailing periods that are fragile
 *  to type. See getSheet() in Utils.gs.
 * ============================================================
 */

const CONFIG = {
  SPREADSHEET_ID: "1Eoey62mS_l6MuYZHYmzAzPMcUUR9O1Zb-s4iL7UPkv0",

  // Global cost fallbacks (used when a per-SKU value is blank)
  DEFAULT_PRINT_RATE: 35,    // BDT per goj
  DEFAULT_SELAI_COST: 100,   // BDT per unit (sewing)

  LOW_STOCK_THRESHOLD: 50,   // goj — highlight Remaining at/below this

  // Canonical status labels. The sheet actually uses "Done" (printing)
  // and "Processing" (sewing) — matching is done by statusBucket() in
  // Utils.gs, which recognizes these plus synonyms. Do not compare
  // Work Status with these strings directly; use statusBucket()/isStageComplete().
  STATUS: {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    COMPLETED:   "Completed",
    ON_HOLD:     "On Hold"
  },

  PAYMENT: {
    PAID:    "Paid",
    PARTIAL: "Partially Paid",
    UNPAID:  "Unpaid"
  }
};

/** Sheet definitions keyed by a stable internal name.
 *  header = row holding column titles, data = first data row. */
const SHEETS = {
  DASHBOARD:      { gid: 1047628169, header: 2, data: 3 },
  DAILY_EXPENSE:  { gid: 1784807302, header: 2, data: 3 },
  PURCHASE:       { gid: 1582207401, header: 2, data: 3 },
  PRODUCTION:     { gid: 1622048330, header: 3, data: 4 },  // canonical 2-stage (306 rows)
  INVOICE_LIVE:   { gid: 1847174566, header: 2, data: 3 },  // 🧾 Invoice. (live-pull)
  MATERIAL_STOCK: { gid: 1886985777, header: 2, data: 3 },
  PAYMENT_LEDGER: { gid: 1316431033, header: 2, data: 3 },
  SUPPLIERS:      { gid: 785739668,  header: 1, data: 2 },   // headers in row 1
  SKU_FABRIC:     { gid: 619086742,  header: 2, data: 3 }
};

/* ---------- COLUMN MAPS (1-based) ---------- */

// Production Log — PRINTING block (cols 1–16)
const COL_PRINT = {
  ORDER_DATE: 1, ITEM_NAME: 2, FABRIC_NAME: 3, SKU: 4, QTY: 5,
  FABRIC_PER_UNIT: 6, TOTAL_FABRIC: 7, WORK_TYPE: 8, WORK_STATUS: 9,
  RECEIVED_QTY: 10, RECEIVED_DATE: 11, PRINT_PAYMENT: 12,
  SUPPLIER_NAME: 13, SUPPLIER_ID: 14, PAYMENT_DATE: 15, PAYMENT_STATUS: 16
};

// Production Log — SEWING block (cols 17–30)
const COL_SEW = {
  ORDER_DATE: 17, SKU: 18, QTY: 19, UNIT_COST: 20, WORK_TYPE: 21,
  WORK_STATUS: 22, TOTAL_COST: 23, RECEIVED_QTY: 24, RECEIVED_DATE: 25,
  PAYMENT_STATUS: 26, PAYMENT_DATE: 27, SUPPLIER_NAME: 28, SUPPLIER_ID: 29,
  PO_NO: 30
};

const COL_SKU_FABRIC = {
  SKU: 1, FABRIC_PER_UNIT: 2, PRODUCT_NAME: 3, SELAI_COST: 4, PRINT_RATE: 5
};

const COL_SUPPLIER = { NAME: 1, TYPE: 2, ID: 3 };

const COL_PURCHASE = {
  DATE: 1, FABRIC_NAME: 2, UNIT_TYPE: 3, QTY: 4, UNIT_PRICE: 5, PURCHASE_PRICE: 6
};

const COL_STOCK = {
  SL: 1, FABRIC_NAME: 2, UNIT_TYPE: 3, PURCHASE_VOL: 4, USED_VOL: 5, REMAINING: 6
};

const COL_LEDGER = {
  INVOICE: 1, SKU: 2, PRODUCT_NAME: 3, SUPPLIER_ID: 4, SUPPLIER_NAME: 5,
  INVOICE_DATE: 6, DUE_DATE: 7, UNIT_COST: 8, QTY: 9, TOTAL_DUE: 10,
  AMOUNT_PAID: 11, BALANCE: 12, PAYMENT_STATUS: 13
};

const COL_EXPENSE = {
  DATE: 1, CATEGORY: 2, PURPOSE: 3, AMOUNT: 4, PAYMENT_STATUS: 5, PAID_BY: 6, NOTES: 7
};
