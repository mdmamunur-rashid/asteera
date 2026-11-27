import Link from "next/link";
import { asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DupOrder } from "@/components/DuplicatesModalClient";
import OrderSheetClient, { type OrderSheetRow, type SkuCatalogEntry } from "@/components/OrderSheetClient";
import SheetGridClient, { type SheetColumn } from "@/components/SheetGridClient";
import { last10 } from "@/lib/util";
import { acceptDuplicate, bulkOrderAction, deleteOrder } from "../sales/actions";
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

  if (tab === "orders") {
    const [orders, allItems] = await Promise.all([
      db.select().from(schema.orders).orderBy(desc(schema.orders.id)).limit(500),
      db.select({ sku: schema.items.sku, name: schema.items.name, size: schema.items.size, salePrice: schema.items.salePrice })
        .from(schema.items).orderBy(asc(schema.items.sku)),
    ]);

    const orderIds = orders.map((o) => o.id);
    const lines = orderIds.length > 0
      ? await db.select({
          orderId: schema.orderLines.orderId,
          sku: schema.items.sku,
          name: schema.items.name,
          size: schema.items.size,
          qty: schema.orderLines.qty,
          price: schema.orderLines.price,
        })
          .from(schema.orderLines)
          .innerJoin(schema.items, eq(schema.items.id, schema.orderLines.itemId))
          .where(inArray(schema.orderLines.orderId, orderIds))
      : [];

    const linesByOrder = new Map<number, typeof lines>();
    for (const l of lines) {
      const arr = linesByOrder.get(l.orderId) ?? [];
      arr.push(l);
      linesByOrder.set(l.orderId, arr);
    }

    const initialRows: OrderSheetRow[] = orders.map((o, idx) => {
      const oLines = linesByOrder.get(o.id) ?? [];
      const fallbackSkus = oLines.map((l) => l.sku).join(", ");
      const fallbackNames = oLines.map((l) => l.name).join(" / ");
      const fallbackQtys = oLines.map((l) => String(l.qty)).join(", ");
      const fallbackSizes = oLines.map((l) => l.size).filter(Boolean).join(" / ");
      return {
        id: o.id,
        queryNo: o.queryNo || String(orders.length - idx),
        websiteOrderNo: o.websiteOrderNo,
        initiateBy: o.initiateBy,
        pageName: o.pageName,
        date: o.date,
        productNameList: o.productNameList || fallbackNames,
        productSku: o.productSku || fallbackSkus,
        productQty: o.productQty || fallbackQtys,
        size: o.size || fallbackSizes,
        total: o.total,
        deliveryCharge: o.deliveryCharge,
        paid: o.paid,
        discount: o.discount,
        cod: Math.max(0, o.total - o.paid),
        note: o.note,
        paymentMode: o.paymentMode,
        customerName: o.customerName,
        phone: o.phone,
        address: o.address,
        district: o.district,
        status: o.status,
        courier: o.courier,
        invoiceNo: o.invoiceNo,
        trackingNo: o.trackingNo,
        billDate: o.billDate,
        courierPaid: o.courierPaid,
        dupAccepted: o.dupAccepted,
      };
    });

    const dupOrdersByPhone10: Record<string, DupOrder[]> = {};
    for (const o of orders) {
      const p10 = last10(o.phone);
      if (p10.length < 10 || o.status === "Cancelled") continue;
      const oLines = linesByOrder.get(o.id) ?? [];
      (dupOrdersByPhone10[p10] ??= []).push({
        id: o.id,
        invoiceNo: o.invoiceNo,
        date: o.date,
        customerName: o.customerName,
        phone: o.phone,
        address: o.address,
        pageName: o.pageName,
        status: o.status,
        paymentMode: o.paymentMode,
        total: o.total,
        paid: o.paid,
        courier: o.courier,
        trackingNo: o.trackingNo,
        note: o.note,
        dupAccepted: o.dupAccepted,
        items: oLines.map((l) => ({ sku: l.sku, name: l.name, size: l.size, qty: l.qty, price: l.price })),
      });
    }

    const skuCatalog: SkuCatalogEntry[] = allItems.map((i) => ({
      sku: i.sku, name: i.name, size: i.size, salePrice: i.salePrice,
    }));

    return (
      <>
        <h2>Order Sheet</h2>
        {error && <div className="err">{error}</div>}
        {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
        <OrderSheetClient
          initialRows={initialRows}
          skuCatalog={skuCatalog}
          dupOrdersByPhone10={dupOrdersByPhone10}
          saveAction={saveSheetChanges}
          bulkAction={bulkOrderAction}
          acceptAction={acceptDuplicate}
          deleteAction={deleteOrder}
        />
      </>
    );
  }

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
      { key: "imageUrl", label: "Image URL", width: 200 },
    ];
    initialRows = items.map((i) => ({
      id: i.id, sku: i.sku, name: i.name, size: i.size, type: i.type, category: i.category,
      purchasePrice: i.purchasePrice, salePrice: i.salePrice, reorderLevel: i.reorderLevel, imageUrl: i.imageUrl ?? "",
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
        <Link href="/sheet-edit?tab=orders" className="tab">Orders / Sales</Link>
        <Link href="/sheet-edit?tab=purchases" className={`tab ${tab === "purchases" ? "active" : ""}`}>Purchase Orders</Link>
      </div>

      <form className="toolbar">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" placeholder="Search (showing up to 100 rows)..." defaultValue={q} />
        <button className="btn secondary">Search</button>
      </form>

      <SheetGridClient tab={tab} columns={columns} initialRows={initialRows} saveAction={saveSheetChanges} />
    </>
  );
}
