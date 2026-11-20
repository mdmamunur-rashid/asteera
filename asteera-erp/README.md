# Asteera ERP (Next.js + MySQL)

Web rewrite of the Google Apps Script ERP in `../` (Inventory, Order and Production management).
Google Sheets is replaced by a MySQL database (cPanel MySQL works).

## Modules (phase 1)
| Module | Replaces |
|---|---|
| Inventory (stock computed live from purchases and orders) | `InventoryItems`, `updateqtypurchased/sold/remaining`, reorder flag |
| Suppliers | `Supliers` sheet |
| Purchase orders (+ payments, print) | `PurchaseOrders` / `PurchaseDetails` |
| Sales / Orders and invoices (status flow, payments, print) | `Dress Query/Order`, `SalesDetails`, invoice pages |
| Expenses | `expenses.html` |
| Production batches (print and sewing stages) | Production Log, `Production.gs` |
| Fabric stock | `MaterialStock.gs` |
| Supplier ledger (auto-created when a stage is Done) | `LedgerSync.gs`, `PaymentLedger.gs` |
| Dashboard | `Dashboard.gs` / `dashboard.html` |

**Not yet ported (phase 2):** Pathao / Steadfast courier APIs and webhooks, SMS, returns workflow, bulk print, data import from the sheets.

## Setup
1. In cPanel > **Manage My Databases**, create a MySQL database and user and grant all privileges.
2. In phpMyAdmin, import `drizzle/0000_init.sql`.
3. `cp .env.example .env` and fill in `DATABASE_URL` and `AUTH_SECRET` (`openssl rand -hex 32`).
4. `npm install`
5. `npm run create-admin -- "Your Name" you@example.com 'a-long-password'`
6. `npm run dev` (local) or `npm run build && npm start`.

## Deploy on cPanel
cPanel > **Setup Node.js App**: choose Node 20+, application root = this folder, startup file `server.js` that runs `next start`
(or use the `.next/standalone` output). Set the environment variables from `.env.example` in the UI.

## Security notes
- Secrets are read from environment variables only; none are committed. Rotate the SMS key that was hard-coded in the old `gsorders.gs`.
- Passwords are bcrypt-hashed; sessions are signed HttpOnly cookies (7 days).
