# Asteera Production Management — Apps Script Automation

Bound to spreadsheet `1Eoey62mS_l6MuYZHYmzAzPMcUUR9O1Zb-s4iL7UPkv0`.

## Files (paste each into the bound Apps Script project)
| File | Purpose |
|---|---|
| `Config.gs` | Spreadsheet ID, sheet gids, header/data rows, column maps |
| `Utils.gs` | Sheet resolution by gid, lookups (SKU, suppliers, rates) |
| `Production.gs` | **Module 2** — derive costs, fabric, supplier fill, dates |
| `MaterialStock.gs` | **Module 1** — purchase/used/remaining + low-stock highlight |
| `PaymentLedger.gs` | **Module 3** — balance + payment status |
| `LedgerSync.gs` | **Module 4** — auto-create ledger rows on stage completion |
| `Dashboard.gs` | **Module 5** — live metrics, stage breakdown, supplier table |
| `Menu.gs` | Custom menu + `recalcAll` |
| `Triggers.gs` | `onEdit` live recalculation |

## Install
1. Open the sheet → **Extensions → Apps Script**.
2. Create one file per `.gs` above and paste the contents.
3. Save, reload the sheet → an **⚙️ Asteera Automation** menu appears.
4. Run **Recalculate Everything** once (authorize when prompted).

## What it automates now (engine-first)
- **Production Log (printing)**: Order Date (today), Work Type ("Print"),
  Work Status (default "Processing"), **Item Name & Fabric Name indexed
  from the previous row with the same SKU**, Fabric/Unit (SKU Fabric Need
  col B), Total Fabric (qty × unit), Print Payment (Total Fabric × print
  rate), supplier name from id, Received Date on completion.
- **Production Log (sewing)**: Order Date, Work Type ("Sewing"), Work
  Status default, Sewn Unit Cost (Selai col D), Sewn Total Cost (qty × unit),
  supplier name from id, Received Date on completion.
- **Material Stock**: Purchase Vol, Used Vol, Remaining + red low-stock flag.
- **Payment Ledger**: Balance + Payment Status.
- **Production → Ledger sync**: when a stage is marked *Completed*, an
  idempotent ledger row is created — `PRD-P-<row>` owing the printing
  supplier (Print Payment) and `PRD-S-<row>` owing the sewing supplier
  (Sewn Total Cost). Re-runs update in place; Amount Paid is preserved.
- **Dashboard**: live top-line metrics (batches, sent to print, sewn,
  outstanding, paid, unpaid count, print/sew complete), stage-by-stage
  breakdown with % done, and the pending-balances-by-supplier table.
  Cells are matched by label, so the layout can move without breaking.
  **Embroidery metrics are 0** — the canonical 2-stage log has no
  embroidery (that exists only in the unused 3-stage `📋 Production Log.`).

## Assumptions (correct here if wrong)
- **Print rate** = per-SKU `Print Cost` in *SKU Fabric Need* if set, else the
  first non-zero value found, else **35 tk/goj** (`CONFIG.DEFAULT_PRINT_RATE`).
- **Selai (sewing) cost** = per-SKU `Selai cost` if set, else first non-zero,
  else **100 tk/unit** (`CONFIG.DEFAULT_SELAI_COST`).
- **Fabric is consumed at printing only**; Used Vol sums the printing block's
  Total Fabric, matched to Material Stock by **Fabric Name** (manual entry).
- **Low-stock threshold** = 50 goj (`CONFIG.LOW_STOCK_THRESHOLD`).
- Auto-derived cells are only filled when blank or recomputed; manual keys
  (SKU, Fabric Name, Qty, Work Status, Received QTY) are never overwritten.
- **Work Status vocabulary**: the sheet uses **"Done"** (printing) and
  **"Processing"** (sewing). `statusBucket()` maps these (plus synonyms like
  Completed / In Progress / On Hold / Pending) to canonical buckets, so a
  stage counts as finished when its status means "done". Completion drives
  ledger creation, Received-Date stamping, and Dashboard "% Done".

## Deferred to next phases (need your input)
- **🧾 Invoice. live-pull** generation + PDF/email.
- **Dashboard** aggregation (fix `#ERROR!`, live metrics).
- **Daily Expense** rollups + monthly archive.
- **Notifications** (reuse Automas SMS or email).
