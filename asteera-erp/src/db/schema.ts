import {
  mysqlTable, int, varchar, text, mediumtext, decimal, timestamp, date, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

const money = (name: string) => decimal(name, { precision: 12, scale: 2, mode: "number" }).notNull().default(0);
const qty = (name: string) => decimal(name, { precision: 12, scale: 3, mode: "number" }).notNull().default(0);

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 160 }),
  phone: varchar("phone", { length: 30 }),
  passwordHash: varchar("password_hash", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("staff"), // admin | staff | moderator | user
  photoUrl: varchar("photo_url", { length: 500 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("Active"), // Active | Inactive
  permissions: text("permissions"), // JSON array of allowed module keys
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_phone_uq").on(t.phone)]);

export const brandings = mysqlTable("brandings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  address: text("address"),
  logoUrl: varchar("logo_url", { length: 500 }).notNull().default(""),
  phone: varchar("phone", { length: 40 }).notNull().default(""),
  isDefault: int("is_default").notNull().default(0),
}, (t) => [uniqueIndex("brandings_name_uq").on(t.name)]);

export const settings = mysqlTable("settings", {
  k: varchar("k", { length: 80 }).primaryKey(),
  v: text("v").notNull(),
});

export const orderReturns = mysqlTable("order_returns", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull(),
  invoiceNo: varchar("invoice_no", { length: 30 }).notNull(),
  returnType: varchar("return_type", { length: 20 }).notNull().default("Partial"),
  itemsJson: text("items_json").notNull(),
  returnCost: money("return_cost"),
  note: varchar("note", { length: 300 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ret_order_idx").on(t.orderId)]);

/** Replaces the "InventoryItems" sheet. Stock is computed, never stored. */
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 60 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  size: varchar("size", { length: 30 }).notNull().default(""),
  type: varchar("type", { length: 80 }).notNull().default(""),
  category: varchar("category", { length: 80 }).notNull().default(""),
  purchasePrice: money("purchase_price"),
  salePrice: money("sale_price"),
  reorderLevel: int("reorder_level").notNull().default(5),
  imageUrl: mediumtext("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("items_sku_uq").on(t.sku)]);

/** Replaces the "Supliers" sheet. type: Fabric | Printing | Sewing | Other */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("Other"),
  address: varchar("address", { length: 300 }).notNull().default(""),
  phone: varchar("phone", { length: 30 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("suppliers_code_uq").on(t.code)]);

/** "PurchaseOrders" + "PurchaseDetails" */
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  poNo: varchar("po_no", { length: 30 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  supplierId: int("supplier_id").notNull(),
  paid: money("paid"),
  note: varchar("note", { length: 300 }).notNull().default(""),
  printedAt: timestamp("printed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("po_no_uq").on(t.poNo), index("po_supplier_idx").on(t.supplierId)]);

export const purchaseLines = mysqlTable("purchase_lines", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("po_id").notNull(),
  itemId: int("item_id").notNull(),
  qty: qty("qty"),
  unitCost: money("unit_cost"),
}, (t) => [index("pl_po_idx").on(t.poId), index("pl_item_idx").on(t.itemId)]);

/**
 * "Dress Query/Order" + "SalesDetails" merged: one order = one invoice.
 * status: New | Ready to Bill | Billed | In Courier | Delivered | Returned | Hold | Cancelled
 * Stock counts every order whose status is not Cancelled / Returned / New.
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNo: varchar("invoice_no", { length: 30 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  customerName: varchar("customer_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull().default(""),
  address: varchar("address", { length: 400 }).notNull().default(""),
  pageName: varchar("page_name", { length: 120 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("Billed"),
  paymentMode: varchar("payment_mode", { length: 20 }).notNull().default("COD"), // COD | Paid
  deliveryCharge: money("delivery_charge"),
  discount: money("discount"),
  returnCost: money("return_cost"),
  total: money("total"),
  paid: money("paid"),
  courier: varchar("courier", { length: 30 }).notNull().default(""),
  trackingNo: varchar("tracking_no", { length: 80 }).notNull().default(""),
  note: varchar("note", { length: 400 }).notNull().default(""),
  dupAccepted: int("dup_accepted").notNull().default(0),
  printedAt: timestamp("printed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("orders_invoice_uq").on(t.invoiceNo), index("orders_status_idx").on(t.status)]);

export const orderLines = mysqlTable("order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull(),
  itemId: int("item_id").notNull(),
  qty: qty("qty"),
  price: money("price"),
}, (t) => [index("ol_order_idx").on(t.orderId), index("ol_item_idx").on(t.itemId)]);

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  purpose: varchar("purpose", { length: 300 }).notNull().default(""),
  amount: money("amount"),
  paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("Paid"),
  paidBy: varchar("paid_by", { length: 80 }).notNull().default(""),
  notes: varchar("notes", { length: 300 }).notNull().default(""),
}, (t) => [index("exp_date_idx").on(t.date)]);

/** Production module */
export const fabrics = mysqlTable("fabrics", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("goj"),
}, (t) => [uniqueIndex("fabrics_name_uq").on(t.name)]);

export const fabricPurchases = mysqlTable("fabric_purchases", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  fabricId: int("fabric_id").notNull(),
  qty: qty("qty"),
  unitPrice: money("unit_price"),
}, (t) => [index("fp_fabric_idx").on(t.fabricId)]);

/** Print stage then sewing stage per batch. *Status: Not Started | In Progress | Done | On Hold */
export const productionBatches = mysqlTable("production_batches", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  sku: varchar("sku", { length: 60 }).notNull(),
  itemName: varchar("item_name", { length: 200 }).notNull().default(""),
  fabricId: int("fabric_id"),
  qty: qty("qty"),
  fabricPerUnit: qty("fabric_per_unit"),
  printSupplierId: int("print_supplier_id"),
  printRate: money("print_rate"),
  printStatus: varchar("print_status", { length: 20 }).notNull().default("Not Started"),
  printReceivedQty: qty("print_received_qty"),
  printReceivedDate: date("print_received_date", { mode: "string" }),
  sewSupplierId: int("sew_supplier_id"),
  sewUnitCost: money("sew_unit_cost"),
  sewStatus: varchar("sew_status", { length: 20 }).notNull().default("Not Started"),
  sewReceivedQty: qty("sew_received_qty"),
  sewReceivedDate: date("sew_received_date", { mode: "string" }),
}, (t) => [index("pb_sku_idx").on(t.sku)]);

/** "Payment Ledger": amounts owed to suppliers, auto-created from production stages. */
export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  ref: varchar("ref", { length: 40 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }),
  supplierId: int("supplier_id").notNull(),
  sku: varchar("sku", { length: 60 }).notNull().default(""),
  description: varchar("description", { length: 200 }).notNull().default(""),
  qty: qty("qty"),
  unitCost: money("unit_cost"),
  totalDue: money("total_due"),
  amountPaid: money("amount_paid"),
}, (t) => [uniqueIndex("ledger_ref_uq").on(t.ref), index("ledger_supplier_idx").on(t.supplierId)]);
