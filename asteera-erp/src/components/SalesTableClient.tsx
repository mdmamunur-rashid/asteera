"use client";
import { useState } from "react";
import Link from "next/link";
import { ORDER_STATUSES } from "@/lib/util";

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
  orderCountLabel: string;
  sameDayDup: boolean;
};

export default function SalesTableClient({
  rows,
  bulkAction,
  inlineStatusAction,
}: {
  rows: SaleRow[];
  bulkAction: (f: FormData) => Promise<void>;
  inlineStatusAction: (f: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
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
              <th>Courier</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const due = Math.max(0, o.total - o.paid);
              return (
                <tr key={o.id} style={{ background: o.sameDayDup ? "#fef2f2" : undefined }}>
                  <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} /></td>
                  <td>
                    <Link href={`/sales/${o.id}`}><b>{o.invoiceNo}</b></Link><br />
                    <small style={{ color: "var(--muted)" }}>{o.date}</small>{" "}
                    <span className="badge info">{o.orderCountLabel}</span>
                    {o.sameDayDup && <>{" "}<span className="badge bad">Same-day duplicate</span></>}
                  </td>
                  <td>
                    <b>{o.customerName}</b><br />
                    {o.phone && <a href={`tel:${o.phone}`}>{o.phone}</a>}
                    {o.address && <><br /><small style={{ color: "var(--muted)" }}>{o.address}</small></>}
                  </td>
                  <td>
                    <b>৳ {fmt(o.total)}</b><br />
                    <small>Paid: ৳ {fmt(o.paid)} · Due: ৳ {fmt(due)}</small><br />
                    <span className={`badge ${due === 0 ? "ok" : "warn"}`}>{due === 0 ? "Paid" : o.paymentMode}</span>
                  </td>
                  <td>{o.courier ? <><b>{o.courier}</b><br /><small>{o.trackingNo}</small></> : "—"}</td>
                  <td>
                    <form action={inlineStatusAction} style={{ margin: 0 }}>
                      <input type="hidden" name="id" value={o.id} />
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
    </>
  );
}
