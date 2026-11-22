import Link from "next/link";
import { asc, desc, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import SheetGridClient, { type SheetColumn } from "@/components/SheetGridClient";
import { ORDER_STATUSES } from "@/lib/util";
import { saveSheetChanges } from "./actions";

export const dynamic = "force-dynamic";

export default async function SheetEditPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; ok?: string; error?: string }>;
}) {
  const { tab: rawTab, q, ok, error } = await searchParams;
  const tab = rawTab === "orders" || rawTab === "purchases" ? rawTab : "inventory";
  const term = q ? `%${q}%` : null;

  let columns: SheetColumn[] = [];
  let initialRows: Record<string, string | number>[] = [];

  if (tab === "inventory") {
    const items = await db.select().from(schema.items)
      .where(term ? or(like(schema.items.sku, term), like(schema.items.name, term), like(schema.items.type, term)) : undefined)
      .orderBy(asc(schema.items.sku)).limit(100);
    columns = [
      { key: "sku", label: "SKU", width: 110 },
      { key: "name", label: "Product Name", width: 200 },
      { key: "size", label: "Size", width: 75 },
      { key: "type", label: "Type", width: 100 },
      { key: "category", label: "Category", width: 100 },
      { key: "purchasePrice", label: "P.Price", type: "number", width: 90 },
      { key: "salePrice", label: "S.Price", type: "number", width: 90 },
      { key: "reorderLevel", label: "Reorder", type: "number", width: 75 },
    ];
    initialRows = items.map((i) => ({
      id: i.id, sku: i.sku, name: i.name, size: i.size, type: i.type, category: i.category,
      purchasePrice: i.purchasePrice, salePrice: i.salePrice, reorderLevel: i.reorderLevel,
    }));
  } else if (tab === "orders") {
    const orders = await db.select().from(schema.orders)
      .where(term ? or(like(schema.orders.invoiceNo, term), like(schema.orders.customerName, term), like(schema.orders.phone, term)) : undefined)
      .orderBy(desc(schema.orders.id)).limit(100);
    columns = [
      { key: "invoiceNo", label: "Invoice", width: 120 },
      { key: "date", label: "Date", type: "date", width: 125 },
      { key: "customerName", label: "Customer", width: 150 },
      { key: "phone", label: "Phone", width: 120 },
      { key: "address", label: "Address", width: 180 },
      { key: "pageName", label: "Brand", width: 100 },
      { key: "status", label: "Status", type: "select", options: ORDER_STATUSES.map((s) => ({ value: s, label: s })), width: 120 },
      { key: "deliveryCharge", label: "Delivery", type: "number", width: 85 },
      { key: "discount", label: "Discount", type: "number", width: 85 },
      { key: "total", label: "Total", type: "number", width: 95 },
      { key: "paid", label: "Paid", type: "number", width: 95 },
      { key: "courier", label: "Courier", width: 95 },
      { key: "trackingNo", label: "Tracking", width: 120 },
      { key: "note", label: "Note", width: 150 },
    ];
    initialRows = orders.map((o) => ({
      id: o.id, invoiceNo: o.invoiceNo, date: o.date, customerName: o.customerName, phone: o.phone,
      address: o.address, pageName: o.pageName, status: o.status, deliveryCharge: o.deliveryCharge,
      discount: o.discount, total: o.total, paid: o.paid, courier: o.courier, trackingNo: o.trackingNo, note: o.note,
    }));
  } else {
    const [pos, sups] = await Promise.all([
      db.select().from(schema.purchaseOrders)
        .where(term ? like(schema.purchaseOrders.poNo, term) : undefined)
        .orderBy(desc(schema.purchaseOrders.id)).limit(100),
      db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    ]);
    columns = [
      { key: "poNo", label: "PO No", width: 130 },
      { key: "date", label: "Date", type: "date", width: 130 },
      { key: "supplierId", label: "Supplier", type: "select", options: sups.map((s) => ({ value: String(s.id), label: `${s.name} (${s.code})` })), width: 180 },
      { key: "paid", label: "Paid", type: "number", width: 100 },
      { key: "note", label: "Note", width: 200 },
    ];
    initialRows = pos.map((p) => ({
      id: p.id, poNo: p.poNo, date: p.date, supplierId: String(p.supplierId), paid: p.paid, note: p.note,
    }));
  }

  return (
    <>
      <h2>Sheet Editor (Bulk Inline Edit)</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <div className="tabs">
        <Link href="/sheet-edit?tab=inventory" className={`tab ${tab === "inventory" ? "active" : ""}`}>Inventory / SKUs</Link>
        <Link href="/sheet-edit?tab=orders" className={`tab ${tab === "orders" ? "active" : ""}`}>Orders / Sales</Link>
        <Link href="/sheet-edit?tab=purchases" className={`tab ${tab === "purchases" ? "active" : ""}`}>Purchase Orders</Link>
      </div>

      <form className="toolbar">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" placeholder="Search (showing up to 100 rows)..." defaultValue={q} />
        <button className="btn secondary">Search</button>
      </form>

      <SheetGridClient key={`${tab}-${q ?? ""}`} tab={tab} columns={columns} initialRows={initialRows} saveAction={saveSheetChanges} />
    </>
  );
}
