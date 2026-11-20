/**
 * ============================================================
 *  MODULE 3 — PAYMENT LEDGER
 *
 *  Balance = Total Due - Amount Paid
 *  Status  = Unpaid (paid<=0) / Paid (balance<=0) / Partially Paid
 * ============================================================
 */

function recalcPaymentLedger() {
  const sh = getSheet(SHEETS.PAYMENT_LEDGER);
  const def = SHEETS.PAYMENT_LEDGER;
  const lastRow = sh.getLastRow();
  if (lastRow < def.data) return;

  const numRows = lastRow - def.data + 1;
  const range = sh.getRange(def.data, 1, numRows, 13);
  const vals = range.getValues();

  vals.forEach(row => {
    const hasRow = String(row[COL_LEDGER.INVOICE - 1]).trim()
                || String(row[COL_LEDGER.SKU - 1]).trim();
    if (!hasRow) return;

    const due  = toNum(row[COL_LEDGER.TOTAL_DUE - 1]);
    const paid = toNum(row[COL_LEDGER.AMOUNT_PAID - 1]);
    const balance = due - paid;
    row[COL_LEDGER.BALANCE - 1] = balance;

    let status;
    if (paid <= 0)        status = CONFIG.PAYMENT.UNPAID;
    else if (balance <= 0) status = CONFIG.PAYMENT.PAID;
    else                   status = CONFIG.PAYMENT.PARTIAL;
    row[COL_LEDGER.PAYMENT_STATUS - 1] = status;
  });

  range.setValues(vals);
}
