/**
 * ============================================================
 *  MODULE 5 — DASHBOARD
 *
 *  Replaces the #ERROR! formulas with script-computed, live
 *  metrics. Cells are located by their LABEL text (not fixed
 *  coordinates), so the layout can shift without breaking.
 *
 *  NOTE: the canonical Production Log (gid 1622048330) has only
 *  Printing + Sewing. There is no embroidery data, so all
 *  "Embroidered / Emb. Complete / Embroidery" metrics are 0.
 * ============================================================
 */

function refreshDashboard() {
  const sh = getSheet(SHEETS.DASHBOARD);
  const lastRow = Math.max(sh.getLastRow(), 1);
  const lastCol = Math.max(sh.getLastColumn(), 10);
  const grid = sh.getRange(1, 1, lastRow, lastCol).getValues();

  const m = computeDashboardMetrics();

  // ---- Top metric cards (value sits directly below the label) ----
  setBelowLabel(sh, grid, "Total SKUs / Batches", m.totalBatches);
  setBelowLabel(sh, grid, "Total Sent to Print",  m.totalSentToPrint);
  setBelowLabel(sh, grid, "Total Embroidered",    m.totalEmbroidered);
  setBelowLabel(sh, grid, "Total Sewn",           m.totalSewn);
  setBelowLabel(sh, grid, "Total Outstanding",    m.totalOutstanding);
  setBelowLabel(sh, grid, "Print Complete",       m.printComplete);
  setBelowLabel(sh, grid, "Emb. Complete",        m.embComplete);
  setBelowLabel(sh, grid, "Sewing Complete",      m.sewingComplete);
  setBelowLabel(sh, grid, "Invoices Unpaid",      m.invoicesUnpaid);
  setBelowLabel(sh, grid, "Total Paid",           m.totalPaid);

  // ---- Stage-by-stage breakdown ----
  writeStageRow(sh, grid, "printing",   m.stage.printing);
  writeStageRow(sh, grid, "embroidery", m.stage.embroidery);
  writeStageRow(sh, grid, "sewing",     m.stage.sewing);

  // ---- Pending balances by supplier ----
  writeSupplierTable(sh, grid, m.suppliers);

  SpreadsheetApp.getActiveSpreadsheet().toast("Dashboard updated.", "📊 Done", 4);
}

/** Aggregate every dashboard number from the engine sheets. */
function computeDashboardMetrics() {
  const prod = getDataRows(SHEETS.PRODUCTION);
  const ledger = getDataRows(SHEETS.PAYMENT_LEDGER);
  const suppliers = getDataRows(SHEETS.SUPPLIERS);

  let totalBatches = 0, totalSentToPrint = 0, totalSewn = 0;
  let printComplete = 0, sewingComplete = 0;
  const pStage = { ns: 0, ip: 0, cp: 0, oh: 0, total: 0 };
  const sStage = { ns: 0, ip: 0, cp: 0, oh: 0, total: 0 };

  function bump(stage, status) {
    stage.total++;
    const b = statusBucket(status);
    if (b === "notStarted") stage.ns++;
    else if (b === "inProgress") stage.ip++;
    else if (b === "completed") stage.cp++;
    else if (b === "onHold") stage.oh++;
  }

  prod.forEach(r => {
    const pSku = String(r[COL_PRINT.SKU - 1]).trim();
    if (pSku) {
      totalBatches++;
      totalSentToPrint += toNum(r[COL_PRINT.QTY - 1]);              // ordered (sent to print)
      const st = r[COL_PRINT.WORK_STATUS - 1];
      bump(pStage, st);
      if (isStageComplete(st)) printComplete += toNum(r[COL_PRINT.RECEIVED_QTY - 1]); // actually received
    }
    const sSku = String(r[COL_SEW.SKU - 1]).trim();
    if (sSku) {
      totalSewn += toNum(r[COL_SEW.RECEIVED_QTY - 1]);              // actually sewn (received)
      const st = r[COL_SEW.WORK_STATUS - 1];
      bump(sStage, st);
      if (isStageComplete(st)) sewingComplete += toNum(r[COL_SEW.RECEIVED_QTY - 1]);
    }
  });

  // Ledger aggregation
  let totalDueAll = 0, totalPaidAll = 0, invoicesUnpaid = 0;
  const bySup = {};
  ledger.forEach(r => {
    const inv = String(r[COL_LEDGER.INVOICE - 1]).trim();
    const sku = String(r[COL_LEDGER.SKU - 1]).trim();
    if (!inv && !sku) return;
    const supId = String(r[COL_LEDGER.SUPPLIER_ID - 1]).trim();
    const due = toNum(r[COL_LEDGER.TOTAL_DUE - 1]);
    const paid = toNum(r[COL_LEDGER.AMOUNT_PAID - 1]);
    const status = norm(r[COL_LEDGER.PAYMENT_STATUS - 1]);
    totalDueAll += due;
    totalPaidAll += paid;
    if (status === norm(CONFIG.PAYMENT.UNPAID)) invoicesUnpaid++;
    if (supId) {
      const g = bySup[supId] || (bySup[supId] = { unpaid: 0, partial: 0, due: 0, paid: 0 });
      g.due += due;
      g.paid += paid;
      if (status === norm(CONFIG.PAYMENT.UNPAID)) g.unpaid++;
      else if (status === norm(CONFIG.PAYMENT.PARTIAL)) g.partial++;
    }
  });

  // Supplier table rows, in master-list order (so 0-due suppliers still show)
  const supplierRows = suppliers.map(r => {
    const id = String(r[COL_SUPPLIER.ID - 1]).trim();
    const name = String(r[COL_SUPPLIER.NAME - 1]).trim();
    if (!id) return null;
    const g = bySup[id] || { unpaid: 0, partial: 0, due: 0, paid: 0 };
    return [id, name, g.unpaid, g.partial, g.due, g.paid, g.due - g.paid];
  }).filter(Boolean);

  const pct = (s) => s.total ? Math.round(s.cp / s.total * 100) : 0;

  return {
    totalBatches: totalBatches,
    totalSentToPrint: totalSentToPrint,
    totalEmbroidered: 0,
    totalSewn: totalSewn,
    totalOutstanding: totalDueAll - totalPaidAll,
    printComplete: printComplete,
    embComplete: 0,
    sewingComplete: sewingComplete,
    invoicesUnpaid: invoicesUnpaid,
    totalPaid: totalPaidAll,
    stage: {
      printing:   [pStage.ns, pStage.ip, pStage.cp, pStage.oh, pct(pStage)],
      embroidery: [0, 0, 0, 0, 0],
      sewing:     [sStage.ns, sStage.ip, sStage.cp, sStage.oh, pct(sStage)]
    },
    suppliers: supplierRows
  };
}

/* ---------------- cell-finding helpers ---------------- */

/** First cell (top-down, left-right) matching needle. exact=substring vs equals. */
function findCell(grid, needle, exact) {
  const n = norm(needle);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = norm(grid[r][c]);
      if (!cell) continue;
      if (exact ? cell === n : cell.indexOf(n) !== -1) return { row: r + 1, col: c + 1 };
    }
  }
  return null;
}

/** First column in a given 0-based row index whose cell contains needle. */
function findInRow(grid, rowIdx0, needle) {
  const n = norm(needle);
  const row = grid[rowIdx0] || [];
  for (let c = 0; c < row.length; c++) {
    if (norm(row[c]).indexOf(n) !== -1) return c + 1;
  }
  return null;
}

function setBelowLabel(sh, grid, needle, value) {
  const pos = findCell(grid, needle, false);
  if (pos) sh.getRange(pos.row + 1, pos.col).setValue(value);
}

/** Write a stage's [ns, ip, cp, oh, %done] across its breakdown row. */
function writeStageRow(sh, grid, stageNeedle, counts) {
  const stageHeader = findCell(grid, "Stage", true);
  if (!stageHeader) return;
  const hr0 = stageHeader.row - 1; // 0-based header row

  const cNs = findInRow(grid, hr0, "Not Started");
  const cIp = findInRow(grid, hr0, "In Progress");
  const cCp = findInRow(grid, hr0, "Completed");
  const cOh = findInRow(grid, hr0, "On Hold");
  const cPd = findInRow(grid, hr0, "% Done");

  // find the stage's row by scanning the Stage column below the header
  let stageRow = -1;
  for (let r = stageHeader.row; r < grid.length; r++) {
    if (norm(grid[r][stageHeader.col - 1]).indexOf(stageNeedle) !== -1) { stageRow = r + 1; break; }
  }
  if (stageRow === -1) return;

  if (cNs) sh.getRange(stageRow, cNs).setValue(counts[0]);
  if (cIp) sh.getRange(stageRow, cIp).setValue(counts[1]);
  if (cCp) sh.getRange(stageRow, cCp).setValue(counts[2]);
  if (cOh) sh.getRange(stageRow, cOh).setValue(counts[3]);
  if (cPd) sh.getRange(stageRow, cPd).setValue(counts[4]).setNumberFormat('0"%"');
}

/** Rewrite the supplier balance table below its "Supplier ID" header. */
function writeSupplierTable(sh, grid, supplierRows) {
  const hdr = findCell(grid, "Supplier ID", true);
  if (!hdr) return;
  const startRow = hdr.row + 1;
  const startCol = hdr.col;

  // Clear existing rows but never clobber the "Go to Invoice" tip line
  let clearCount = supplierRows.length + 3;
  for (let r = 0; r < clearCount; r++) {
    const cell = norm((grid[startRow - 1 + r] || [])[startCol - 1]);
    if (cell.indexOf("go to") !== -1 || cell.indexOf("invoice") !== -1) { clearCount = r; break; }
  }
  if (clearCount > 0) sh.getRange(startRow, startCol, clearCount, 7).clearContent();

  if (supplierRows.length) {
    sh.getRange(startRow, startCol, supplierRows.length, 7).setValues(supplierRows);
  }
}
