"use client";
import { useState } from "react";
import Link from "next/link";
import { ORDER_STATUSES } from "@/lib/util";

export type PhoneMatchItem = {
  id: number;
  invoiceNo: string;
  date: string;
  customerName: string;
  phone: string;
  total: number;
  status: string;
  courier: string;
};

export type SaleRow = {
  id: number;
  invoiceNo: string;
  date: string;
  customerName: string;
  phone: string;
  address: string;
  status: string;
  paymentMode: string;
  total: number;
  paid: number;
  courier: string;
  trackingNo: string;
  printedAt: string | null;
  orderCountLabel: string;
  sameDayDup: boolean;
  phoneMatches: PhoneMatchItem[];
};

export default function SalesTableClient({
  rows,
  bulkAction,
  inlineStatusAction,
  markPrintedAction,
  returnTo = "/sales",
}: {
  rows: SaleRow[];
  bulkAction: (f: FormData) => Promise<void>;
  inlineStatusAction: (f: FormData) => Promise<void>;
  markPrintedAction: (f: FormData) => Promise<void>;
  returnTo?: string;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [dupListFor, setDupListFor] = useState<{ phone: string; items: PhoneMatchItem[] } | null>(null);
  const allChecked = rows.length > 0 && selected.length === rows.length;
  const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);

  function toggleAll() {
    setSelected(allChecked ? [] : rows.map((r) => r.id));
  }
  function toggleOne(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <>
      <form action={bulkAction} className="toolbar">
        <input type="hidden" name="returnTo" value={returnTo} />
        {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <select name="bulkAction" defaultValue="">
          <option value="">Bulk Action ({selected.length} selected)...</option>
          <option value="print">Bulk Print Selected</option>
          <option value="steadfast">Steadfast Bulk Order</option>
          <option value="pathao">Pathao Bulk Order</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>Set Status: {s}</option>)}
        </select>
        <button className="btn secondary" disabled={selected.length === 0}>Apply</button>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th>Order / Invoice</th>
              <th>Customer</th>
              <th>Payment</th>
              <th>Print Status</th>
              <th>Courier</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const due = Math.max(0, o.total - o.paid);
              const hasMatches = o.phoneMatches.length > 1;
              return (
                <tr key={o.id} style={{ background: o.sameDayDup ? "#fef2f2" : undefined }}>
                  <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} /></td>
                  <td>
                    <Link href={`/sales/${o.id}`}><b>{o.invoiceNo}</b></Link><br />
                    <small style={{ color: "var(--muted)" }}>{o.date}</small>{" "}
                    {hasMatches ? (
                      <button
                        type="button"
                        className="badge info"
                        style={{ border: "none", cursor: "pointer" }}
                        title="Click to view all orders with this phone number"
                        onClick={() => setDupListFor({ phone: o.phone, items: o.phoneMatches })}
                      >
                        {o.orderCountLabel}
                      </button>
                    ) : (
                      <span className="badge info">{o.orderCountLabel}</span>
                    )}
                    {o.sameDayDup && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="badge bad"
                          style={{ border: "none", cursor: "pointer" }}
                          title="Click to view duplicate phone order list"
                          onClick={() => setDupListFor({ phone: o.phone, items: o.phoneMatches })}
                        >
                          Same-day duplicate
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    <b>{o.customerName}</b><br />
                    {o.phone && (
                      hasMatches ? (
                        <button
                          type="button"
                          className="link"
                          style={{ padding: 0, color: o.sameDayDup ? "#dc2626" : undefined, fontWeight: 600 }}
                          onClick={() => setDupListFor({ phone: o.phone, items: o.phoneMatches })}
                        >
                          {o.phone}
                        </button>
                      ) : (
                        <a href={`tel:${o.phone}`}>{o.phone}</a>
                      )
                    )}
                    {o.address && <><br /><small style={{ color: "var(--muted)" }}>{o.address}</small></>}
                  </td>
                  <td>
                    <b>৳ {fmt(o.total)}</b><br />
                    <small>Paid: ৳ {fmt(o.paid)} · Due: ৳ {fmt(due)}</small><br />
                    <span className={`badge ${due === 0 ? "ok" : "warn"}`}>{due === 0 ? "Paid" : o.paymentMode}</span>
                  </td>
                  <td>
                    {o.printedAt ? (
                      <span className="badge ok" title={`Printed at ${o.printedAt}`}>Printed</span>
                    ) : (
                      <form action={markPrintedAction} style={{ margin: 0 }}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="toBulkPrint" value="1" />
                        <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }}>Print</button>
                      </form>
                    )}
                  </td>
                  <td>{o.courier ? <><b>{o.courier}</b><br /><small>{o.trackingNo}</small></> : "—"}</td>
                  <td>
                    <form action={inlineStatusAction} style={{ margin: 0 }}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <select name="status" defaultValue={o.status} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                        {ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </form>
                  </td>
                  <td>
                    <Link href={`/sales/${o.id}`} className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }}>
                      View / Invoice
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p>No orders match this filter.</p>}
      </div>

      {dupListFor && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 210,
            display: "flex", justifyContent: "center", alignItems: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDupListFor(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 10, maxWidth: 640, width: "100%", padding: 16, boxShadow: "0 18px 40px rgba(0,0,0,.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 10 }}>
              <div>
                <b style={{ color: "var(--teal)" }}>Orders for Phone: {dupListFor.phone}</b>
                <br />
                <small style={{ color: "var(--muted)" }}>Matched by last 10 digits ({dupListFor.items.length} orders)</small>
              </div>
              <button type="button" className="btn secondary" onClick={() => setDupListFor(null)}>✕</button>
            </div>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Amount</th>
                  <th>Delivery Status</th>
                  <th>Date / Invoice</th>
                </tr>
              </thead>
              <tbody>
                {dupListFor.items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.customerName}</td>
                    <td>{m.phone}</td>
                    <td><b>৳ {fmt(m.total)}</b></td>
                    <td>
                      <span className={`badge ${m.status === "Delivered" ? "ok" : m.status === "Returned" || m.status === "Cancelled" ? "bad" : "info"}`}>
                        {m.status}
                      </span>
                      {m.courier ? <small style={{ color: "var(--muted)", marginLeft: 4 }}>({m.courier})</small> : null}
                    </td>
                    <td>
                      <Link href={`/sales/${m.id}`} onClick={() => setDupListFor(null)}><b>{m.invoiceNo}</b></Link>
                      <br /><small style={{ color: "var(--muted)" }}>{m.date}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
