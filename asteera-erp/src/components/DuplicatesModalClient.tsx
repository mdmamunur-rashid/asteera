"use client";
import { useState } from "react";
import Link from "next/link";

export type DupOrderItem = { sku: string; name: string; size: string; qty: number; price: number };
export type DupOrder = {
  id: number;
  invoiceNo: string;
  date: string;
  customerName: string;
  phone: string;
  address: string;
  pageName: string;
  status: string;
  paymentMode: string;
  total: number;
  paid: number;
  courier: string;
  trackingNo: string;
  note: string;
  dupAccepted: number;
  items: DupOrderItem[];
};
export type DupGroup = { phone10: string; orders: DupOrder[] };

export default function DuplicatesModalClient({
  checkDate,
  groups,
  acceptAction,
  deleteAction,
}: {
  checkDate: string;
  groups: DupGroup[];
  acceptAction: (f: FormData) => Promise<void>;
  deleteAction: (f: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
  const unacceptedCount = groups.filter((g) => g.orders.filter((o) => o.dupAccepted === 0).length > 1).length;

  return (
    <>
      <button
        type="button"
        className={`btn ${unacceptedCount > 0 ? "danger" : "secondary"}`}
        onClick={() => setOpen(true)}
      >
        Find Duplicates ({unacceptedCount})
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.65)", zIndex: 200,
            overflowY: "auto", padding: 24, display: "flex", justifyContent: "center", alignItems: "flex-start",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, maxWidth: 1120, width: "100%", padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--teal)" }}>Duplicate Orders Comparison — {checkDate}</h3>
                <small style={{ color: "var(--muted)" }}>
                  Matched by last 10 digits of phone number. Review side-by-side to Edit, Delete, or Accept Duplication.
                </small>
              </div>
              <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Close ✕</button>
            </div>

            {groups.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No duplicate phone numbers found on {checkDate}.</p>
            ) : (
              groups.map((g) => {
                const unacceptedInGroup = g.orders.filter((o) => o.dupAccepted === 0).length;
                return (
                  <div key={g.phone10} className="card" style={{ borderLeft: `4px solid ${unacceptedInGroup > 1 ? "#dc2626" : "#10b981"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      <div>
                        <b>Phone (last 10): {g.phone10}</b> · <span className="badge info">{g.orders.length} orders</span>{" "}
                        {unacceptedInGroup <= 1 ? (
                          <span className="badge ok">Accepted / Muted</span>
                        ) : (
                          <span className="badge bad">Unresolved Duplicate</span>
                        )}
                      </div>
                      {unacceptedInGroup > 1 && (
                        <form action={acceptAction} style={{ margin: 0 }}>
                          {g.orders.map((o) => <input key={o.id} type="hidden" name="ids" value={o.id} />)}
                          <button className="btn secondary" style={{ padding: "5px 12px", fontSize: 12 }}>
                            Accept All in Group (Mute Warning)
                          </button>
                        </form>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 12 }}>
                      {g.orders.map((o) => (
                        <div key={o.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#fafafa", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 13 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <Link href={`/sales/${o.id}`}><b>#{o.invoiceNo}</b></Link>
                              <span>
                                <span className="badge">{o.status}</span>{" "}
                                {o.dupAccepted === 1 && <span className="badge ok">Accepted</span>}
                              </span>
                            </div>
                            <div><b>Date:</b> {o.date} {o.pageName ? `· ${o.pageName}` : ""}</div>
                            <div><b>Customer:</b> {o.customerName}</div>
                            <div><b>Phone:</b> {o.phone}</div>
                            <div><b>Address:</b> {o.address || "—"}</div>
                            <div style={{ marginTop: 6 }}>
                              <b>Items:</b>
                              {o.items.length === 0 ? " —" : (
                                <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                                  {o.items.map((it, idx) => (
                                    <li key={idx}>{it.sku} — {it.name} {it.size} × {fmt(it.qty)} (৳ {fmt(it.price)})</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div><b>Total:</b> ৳ {fmt(o.total)} · <b>Paid:</b> ৳ {fmt(o.paid)} · <b>Due:</b> ৳ {fmt(Math.max(0, o.total - o.paid))} ({o.paymentMode})</div>
                            {o.courier && <div><b>Courier:</b> {o.courier} ({o.trackingNo})</div>}
                            {o.note && <div><b>Note:</b> {o.note}</div>}
                          </div>

                          <div className="toolbar" style={{ marginBottom: 0 }}>
                            <Link href={`/sales/${o.id}`} className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }}>
                              Edit
                            </Link>
                            <form
                              action={deleteAction}
                              style={{ margin: 0 }}
                              onSubmit={(e) => { if (!confirm(`Delete order #${o.invoiceNo}?`)) e.preventDefault(); }}
                            >
                              <input type="hidden" name="id" value={o.id} />
                              <button className="btn danger" style={{ padding: "5px 10px", fontSize: 12 }}>Delete</button>
                            </form>
                            {o.dupAccepted === 0 && (
                              <form action={acceptAction} style={{ margin: 0 }}>
                                <input type="hidden" name="ids" value={o.id} />
                                <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }}>Accept Duplication</button>
                              </form>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
