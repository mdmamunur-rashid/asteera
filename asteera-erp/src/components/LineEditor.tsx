"use client";
import { useState } from "react";

type Opt = { id: number; label: string; price: number };
type Row = { itemId: number; qty: number; price: number };

/** Dynamic line-item editor; serialises rows into a hidden `lines` input. */
export default function LineEditor({
  options,
  priceLabel,
  initialRows,
}: {
  options: Opt[];
  priceLabel: string;
  initialRows?: Row[];
}) {
  const blank = (): Row => ({ itemId: options[0]?.id ?? 0, qty: 1, price: options[0]?.price ?? 0 });
  const [rows, setRows] = useState<Row[]>(initialRows && initialRows.length > 0 ? initialRows : [blank()]);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);

  return (
    <div className="card">
      <input type="hidden" name="lines" value={JSON.stringify(rows)} />
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>{priceLabel}</th><th>Amount</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <select
                  value={r.itemId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    set(i, { itemId: id, price: options.find((o) => o.id === id)?.price ?? 0 });
                  }}
                >
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </td>
              <td><input type="number" min={0.001} step="any" value={r.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} /></td>
              <td><input type="number" min={0} step="any" value={r.price} onChange={(e) => set(i, { price: Number(e.target.value) })} /></td>
              <td>{(r.qty * r.price).toFixed(2)}</td>
              <td><button type="button" className="link" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3} style={{ textAlign: "right" }}><b>Subtotal</b></td><td colSpan={2}><b>{total.toFixed(2)}</b></td></tr></tfoot>
      </table>
      <button type="button" className="btn secondary" onClick={() => setRows((r) => [...r, blank()])}>+ Add line</button>
    </div>
  );
}
