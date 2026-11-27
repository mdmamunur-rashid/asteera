"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DupOrder } from "@/components/DuplicatesModalClient";
import { ORDER_STATUSES } from "@/lib/util";

export type SkuCatalogEntry = {
  sku: string;
  name: string;
  size: string;
  salePrice: number;
};

export type OrderSheetRow = {
  id: number;
  queryNo: string;
  websiteOrderNo: string;
  initiateBy: string;
  pageName: string;
  date: string;
  productNameList: string;
  productSku: string;
  productQty: string;
  size: string;
  total: number;
  deliveryCharge: number;
  paid: number;
  discount: number;
  cod: number;
  note: string;
  paymentMode: string;
  customerName: string;
  phone: string;
  address: string;
  district: string;
  status: string;
  courier: string;
  invoiceNo: string;
  trackingNo: string;
  billDate: string;
  courierPaid: number;
  dupAccepted: number;
};

type ColDef = {
  key: keyof OrderSheetRow;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  width: number;
  stickyLeft?: number;
};

const COLUMNS: ColDef[] = [
  { key: "queryNo", label: "Query No", width: 82, stickyLeft: 36 },
  { key: "websiteOrderNo", label: "Website Order No", width: 120, stickyLeft: 118 },
  { key: "initiateBy", label: "Initiate By", width: 100 },
  { key: "pageName", label: "Page Name", width: 100 },
  { key: "date", label: "Order Date", type: "date", width: 125 },
  { key: "productNameList", label: "Product Name List", width: 185 },
  { key: "productSku", label: "Product SKU", width: 110 },
  { key: "productQty", label: "Product QTY", width: 90 },
  { key: "size", label: "Size", width: 85 },
  { key: "total", label: "Product Price", type: "number", width: 100 },
  { key: "deliveryCharge", label: "Delivery Charge", type: "number", width: 105 },
  { key: "paid", label: "Paid", type: "number", width: 85 },
  { key: "discount", label: "Discount", type: "number", width: 85 },
  { key: "cod", label: "COD", type: "number", width: 90 },
  { key: "note", label: "Note 1", width: 150 },
  { key: "paymentMode", label: "Payment Status", type: "select", options: ["COD", "Paid"], width: 110 },
  { key: "customerName", label: "Customer Name", width: 145 },
  { key: "phone", label: "Phone", width: 165 },
  { key: "address", label: "Customer Address", width: 200 },
  { key: "district", label: "District", width: 105 },
  { key: "status", label: "Order Status", type: "select", options: ORDER_STATUSES, width: 120 },
  { key: "courier", label: "Delivery Method", type: "select", options: ["", "Pathao", "Steadfast", "RedX", "Other"], width: 115 },
  { key: "invoiceNo", label: "Order Invoice No.", width: 130 },
  { key: "trackingNo", label: "Courier Tracking No", width: 135 },
  { key: "billDate", label: "Bill Date", type: "date", width: 125 },
  { key: "courierPaid", label: "Courier Paid", type: "number", width: 95 },
];

function last10Digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function detectDistrict(address: string): string {
  const lower = address.toLowerCase();
  if (lower.includes("dhaka") || lower.includes("mirpur") || lower.includes("uttara") || lower.includes("dhanmondi") || lower.includes("gulshan") || lower.includes("banani") || lower.includes("mohammadpur") || lower.includes("badda") || lower.includes("moghbazar") || lower.includes("khilkhet") || lower.includes("bashundhara")) {
    return "Dhaka";
  }
  return "";
}

export default function OrderSheetClient({
  initialRows,
  skuCatalog,
  dupOrdersByPhone10,
  saveAction,
  bulkAction,
  acceptAction,
  deleteAction,
}: {
  initialRows: OrderSheetRow[];
  skuCatalog: SkuCatalogEntry[];
  dupOrdersByPhone10: Record<string, DupOrder[]>;
  saveAction: (f: FormData) => Promise<void>;
  bulkAction: (f: FormData) => Promise<void>;
  acceptAction: (f: FormData) => Promise<void>;
  deleteAction: (f: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState<OrderSheetRow[]>(initialRows);
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dupPopupPhone10, setDupPopupPhone10] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const skuMap = useMemo(() => {
    const m = new Map<string, SkuCatalogEntry>();
    for (const item of skuCatalog) m.set(item.sku.trim().toLowerCase(), item);
    return m;
  }, [skuCatalog]);

  const phoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const p10 = last10Digits(r.phone);
      if (p10.length < 10 || r.status === "Cancelled") continue;
      counts.set(p10, (counts.get(p10) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    if (activeFilters.length === 0) return rows;
    return rows.filter((r) =>
      activeFilters.every(([k, v]) => {
        const cellVal = String(r[k as keyof OrderSheetRow] ?? "").toLowerCase();
        return cellVal.includes(v.trim().toLowerCase());
      })
    );
  }, [rows, filters]);

  const allFilteredChecked = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.includes(r.id));

  function toggleAll() {
    if (allFilteredChecked) {
      const vis = new Set(filteredRows.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !vis.has(id)));
    } else {
      const next = new Set(selectedIds);
      for (const r of filteredRows) next.add(r.id);
      setSelectedIds(Array.from(next));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateCell(id: number, key: keyof OrderSheetRow, rawValue: string | number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next: OrderSheetRow = { ...r, [key]: rawValue };

        // Address / District -> auto-fill District & Delivery Charge (70 Dhaka, 130 outside)
        if (key === "address" && !next.district) {
          const detected = detectDistrict(String(rawValue));
          if (detected) {
            next.district = detected;
            next.deliveryCharge = 70;
          }
        }
        if (key === "district") {
          const d = String(rawValue).toLowerCase();
          if (d) next.deliveryCharge = d.includes("dhaka") ? 70 : 130;
        }

        // SKU / QTY -> auto-fill Product Name List, Size, Subtotal, Discount, COD (codeOrder.gs parity)
        if (key === "productSku" || key === "productQty") {
          const skus = String(next.productSku).split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
          const qtys = String(next.productQty || "1").split(/[,/]+/).map((q) => Math.max(0, Number(q.trim()) || 1));
          const names: string[] = [];
          const sizes: string[] = [];
          let subtotal = 0;
          skus.forEach((s, idx) => {
            const item = skuMap.get(s.toLowerCase());
            const q = qtys[idx] ?? qtys[0] ?? 1;
            if (item) {
              names.push(item.name);
              if (item.size) sizes.push(item.size);
              subtotal += item.salePrice * q;
            } else {
              names.push(`Unknown SKU: ${s}`);
            }
          });
          if (skus.length > 0) {
            next.productNameList = names.join(" / ");
            if (!next.size && sizes.length > 0) next.size = sizes.join(" / ");
            if (subtotal > 0) {
              const deliv = Number(next.deliveryCharge) || 0;
              if (key === "productSku" || key === "productQty" || Number(next.total) === 0) {
                next.total = subtotal + deliv;
              }
              next.discount = Math.max(0, subtotal + deliv - (Number(next.total) || 0));
            }
          } else {
            next.productNameList = "";
          }
        }

        // Pricing fields -> recalculate Discount & COD
        if (key === "total" || key === "deliveryCharge" || key === "paid" || key === "discount" || key === "address" || key === "district" || key === "productSku" || key === "productQty") {
          if (key === "discount") {
            const skus = String(next.productSku).split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
            const qtys = String(next.productQty || "1").split(/[,/]+/).map((q) => Math.max(0, Number(q.trim()) || 1));
            let subtotal = 0;
            skus.forEach((s, idx) => {
              const item = skuMap.get(s.toLowerCase());
              if (item) subtotal += item.salePrice * (qtys[idx] ?? qtys[0] ?? 1);
            });
            if (subtotal > 0) {
              next.total = Math.max(0, subtotal + (Number(next.deliveryCharge) || 0) - (Number(next.discount) || 0));
            }
          }
          next.cod = Math.max(0, (Number(next.total) || 0) - (Number(next.paid) || 0));
        }

        // Status -> Billed auto-fills Bill Date
        if (key === "status" && rawValue === "Billed" && !next.billDate) {
          next.billDate = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
        }

        return next;
      })
    );
    setDirtyIds((prev) => new Set(prev).add(id));
  }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rIdx: number, cIdx: number) {
    let nr = rIdx, nc = cIdx;
    if (e.shiftKey && e.key === "ArrowRight") nc = cIdx + 1;
    else if (e.shiftKey && e.key === "ArrowLeft") nc = cIdx - 1;
    else if (e.shiftKey && e.key === "ArrowDown") nr = rIdx + 1;
    else if (e.shiftKey && e.key === "ArrowUp") nr = rIdx - 1;
    else if (e.key === "Enter" && !e.shiftKey) nr = rIdx + 1;
    else return;

    if (nr < 0 || nr >= filteredRows.length || nc < 0 || nc >= COLUMNS.length) return;
    e.preventDefault();
    const target = tableRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-cell="${nr}-${nc}"]`);
    if (target) {
      target.focus();
      if ("select" in target && typeof target.select === "function") target.select();
    }
  }

  function exportCsv() {
    const headers = COLUMNS.map((c) => c.label);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.map(esc).join(","),
      ...filteredRows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-sheet-${new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const changedRows = rows.filter((r) => dirtyIds.has(r.id));
  const hasFilters = Object.values(filters).some((v) => v.trim() !== "");
  const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
  const popupOrders = dupPopupPhone10 ? (dupOrdersByPhone10[dupPopupPhone10] ?? []) : [];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <form action={saveAction} style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: 0 }}>
            <input type="hidden" name="tab" value="orders" />
            <input type="hidden" name="changes" value={JSON.stringify(changedRows)} />
            <button className="btn" disabled={changedRows.length === 0}>
              Save All Changes ({changedRows.length} modified)
            </button>
          </form>

          <form action={bulkAction} style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0 }}>
            <input type="hidden" name="returnTo" value="/sheet-edit?tab=orders" />
            {selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
            <select name="bulkAction" defaultValue="">
              <option value="">Bulk Actions ({selectedIds.length} selected)...</option>
              <option value="print">Bulk Print Selected</option>
              <option value="steadfast">Steadfast Bulk Order</option>
              <option value="pathao">Pathao Bulk Order</option>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>Set Status: {s}</option>)}
            </select>
            <button className="btn secondary" disabled={selectedIds.length === 0}>Apply</button>
          </form>

          <button type="button" className="btn secondary" onClick={exportCsv}>Export All</button>
          {hasFilters && (
            <button type="button" className="btn danger" onClick={() => setFilters({})}>
              Clear Filters ({filteredRows.length}/{rows.length})
            </button>
          )}
        </div>

        <span className="badge info">
          Hold <b>Shift + Arrow keys (↑ ↓ ← →)</b> to move cells · <b>Enter</b> moves down
        </span>
      </div>

      <div className="card" style={{ padding: 0, maxHeight: "74vh", overflow: "auto", position: "relative" }}>
        <table ref={tableRef} style={{ fontSize: 12, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 5, background: "#f1f5f9", minWidth: 36, textAlign: "center", borderBottom: "1px solid var(--line)" }}>
                <input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={String(c.key)}
                  style={{
                    position: "sticky",
                    top: 0,
                    left: c.stickyLeft,
                    zIndex: c.stickyLeft !== undefined ? 5 : 3,
                    background: "#f1f5f9",
                    minWidth: c.width,
                    borderBottom: "1px solid var(--line)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ position: "sticky", top: 33, left: 0, zIndex: 5, background: "#f8fafc", borderBottom: "2px solid var(--line)" }} />
              {COLUMNS.map((c) => (
                <th
                  key={`f-${String(c.key)}`}
                  style={{
                    position: "sticky",
                    top: 33,
                    left: c.stickyLeft,
                    zIndex: c.stickyLeft !== undefined ? 5 : 3,
                    background: "#f8fafc",
                    padding: 3,
                    borderBottom: "2px solid var(--line)",
                  }}
                >
                  {c.type === "select" ? (
                    <select
                      value={filters[String(c.key)] ?? ""}
                      onChange={(e) => setFilters((p) => ({ ...p, [String(c.key)]: e.target.value }))}
                      style={{ width: "100%", padding: "2px 4px", fontSize: 11 }}
                    >
                      <option value="">All</option>
                      {c.options?.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={filters[String(c.key)] ?? ""}
                      onChange={(e) => setFilters((p) => ({ ...p, [String(c.key)]: e.target.value }))}
                      placeholder="Filter..."
                      style={{ width: "100%", padding: "2px 5px", fontSize: 11 }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, idx) => {
              const dirty = dirtyIds.has(r.id);
              const p10 = last10Digits(r.phone);
              const dupCount = p10.length === 10 ? Math.max(phoneCounts.get(p10) ?? 0, (dupOrdersByPhone10[p10]?.length ?? 0)) : 0;
              const isDup = dupCount > 1 && r.status !== "Cancelled";
              const rowBg = dirty ? "#fffbeb" : "#fff";
              return (
                <tr key={r.id} style={{ background: rowBg }}>
                  <td style={{ position: "sticky", left: 0, zIndex: 2, background: rowBg, textAlign: "center", padding: 3, borderBottom: "1px solid #f1f5f9" }}>
                    <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleOne(r.id)} />
                  </td>
                  {COLUMNS.map((c, cIdx) => {
                    const stickyStyle = c.stickyLeft !== undefined
                      ? { position: "sticky" as const, left: c.stickyLeft, zIndex: 2, background: rowBg }
                      : {};
                    const isPhoneCol = c.key === "phone";
                    return (
                      <td
                        key={String(c.key)}
                        style={{
                          padding: 3,
                          borderBottom: "1px solid #f1f5f9",
                          ...stickyStyle,
                          ...(isPhoneCol && isDup ? { background: "#fee2e2" } : {}),
                        }}
                      >
                        {c.type === "select" ? (
                          <select
                            data-cell={`${idx}-${cIdx}`}
                            value={String(r[c.key] ?? "")}
                            onChange={(e) => updateCell(r.id, c.key, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, cIdx)}
                            style={{ width: "100%", padding: "4px 5px", fontSize: 12 }}
                          >
                            {c.options?.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                          </select>
                        ) : isPhoneCol ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              data-cell={`${idx}-${cIdx}`}
                              value={String(r.phone ?? "")}
                              onChange={(e) => updateCell(r.id, "phone", e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, idx, cIdx)}
                              style={{
                                width: "100%",
                                padding: "4px 5px",
                                fontSize: 12,
                                color: isDup ? "#b91c1c" : undefined,
                                fontWeight: isDup ? 700 : undefined,
                                borderColor: isDup ? "#dc2626" : dirty ? "var(--primary)" : "#e5e7eb",
                              }}
                            />
                            {isDup && (
                              <button
                                type="button"
                                className="badge bad"
                                style={{ border: "none", cursor: "pointer", flexShrink: 0, fontSize: 10.5 }}
                                title="Click to compare duplicate orders with delivery status"
                                onClick={() => setDupPopupPhone10(p10)}
                              >
                                {dupCount}
                              </button>
                            )}
                          </div>
                        ) : (
                          <input
                            data-cell={`${idx}-${cIdx}`}
                            type={c.type ?? "text"}
                            step={c.type === "number" ? "any" : undefined}
                            readOnly={c.key === "cod"}
                            value={String(r[c.key] ?? "")}
                            onChange={(e) => updateCell(r.id, c.key, c.type === "number" ? Number(e.target.value) : e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, cIdx)}
                            style={{
                              width: "100%",
                              padding: "4px 5px",
                              fontSize: 12,
                              background: c.key === "cod" ? "#f8fafc" : undefined,
                              fontWeight: c.key === "cod" ? 700 : undefined,
                              borderColor: dirty ? "var(--primary)" : "#e5e7eb",
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dupPopupPhone10 && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.65)", zIndex: 220,
            overflowY: "auto", padding: 24, display: "flex", justifyContent: "center", alignItems: "flex-start",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDupPopupPhone10(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, maxWidth: 1050, width: "100%", padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--teal)" }}>Duplicate Orders Comparison — Phone ({dupPopupPhone10})</h3>
                <small style={{ color: "var(--muted)" }}>
                  {popupOrders.length} matching order(s) with delivery status. Review side-by-side to Edit, Delete, or Accept Duplication.
                </small>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {popupOrders.length > 1 && (
                  <form action={acceptAction} style={{ margin: 0 }}>
                    <input type="hidden" name="returnTo" value="/sheet-edit?tab=orders" />
                    {popupOrders.map((o) => <input key={o.id} type="hidden" name="ids" value={o.id} />)}
                    <button className="btn secondary">Accept Duplication</button>
                  </form>
                )}
                <button type="button" className="btn secondary" onClick={() => setDupPopupPhone10(null)}>Close ✕</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 12 }}>
              {popupOrders.map((o) => (
                <div key={o.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#fafafa", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Link href={`/sales/${o.id}`}><b>#{o.invoiceNo}</b></Link>
                      <span>
                        <span className={`badge ${o.status === "Delivered" ? "ok" : o.status === "Returned" || o.status === "Cancelled" ? "bad" : "info"}`}>
                          {o.status}
                        </span>{" "}
                        {o.dupAccepted === 1 && <span className="badge ok">Accepted</span>}
                      </span>
                    </div>
                    <div><b>Date:</b> {o.date} {o.pageName ? `· ${o.pageName}` : ""}</div>
                    <div><b>Customer:</b> {o.customerName}</div>
                    <div><b>Phone:</b> {o.phone}</div>
                    <div><b>Address:</b> {o.address || "—"}</div>
                    <div><b>Courier:</b> {o.courier ? `${o.courier} (${o.trackingNo || "—"})` : "—"}</div>
                    <div><b>Total:</b> ৳ {fmt(o.total)} · <b>Paid:</b> ৳ {fmt(o.paid)} · <b>COD:</b> ৳ {fmt(Math.max(0, o.total - o.paid))}</div>
                    {o.items.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {o.items.map((it, i) => <li key={i}>{it.sku} — {it.name} {it.size} × {fmt(it.qty)} (৳ {fmt(it.price)})</li>)}
                      </ul>
                    )}
                    {o.note && <div style={{ marginTop: 4 }}><b>Note:</b> {o.note}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link href={`/sales/${o.id}`} className="btn secondary" style={{ padding: "5px 12px", fontSize: 12 }}>Edit</Link>
                    <form action={deleteAction} style={{ margin: 0 }}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="returnTo" value="/sheet-edit?tab=orders" />
                      <button className="btn danger" style={{ padding: "5px 12px", fontSize: 12 }}>Delete</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
