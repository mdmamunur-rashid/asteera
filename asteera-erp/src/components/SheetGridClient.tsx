"use client";
import { useState } from "react";

export type SheetColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  width?: number;
};

export default function SheetGridClient({
  tab,
  columns,
  initialRows,
  saveAction,
}: {
  tab: string;
  columns: SheetColumn[];
  initialRows: Record<string, string | number>[];
  saveAction: (f: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(() => new Set());

  function updateCell(idx: number, key: string, value: string | number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    const id = Number(rows[idx]?.id);
    if (id) setDirtyIds((prev) => new Set(prev).add(id));
  }

  const changedRows = rows.filter((r) => dirtyIds.has(Number(r.id)));

  return (
    <form action={saveAction}>
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="changes" value={JSON.stringify(changedRows)} />
      <div className="toolbar">
        <button className="btn" disabled={changedRows.length === 0}>
          Save All Changes ({changedRows.length} modified)
        </button>
        <small style={{ color: "var(--muted)" }}>Edit any cell directly like Google Sheets, then click Save.</small>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key} style={{ minWidth: c.width ?? 110 }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const dirty = dirtyIds.has(Number(r.id));
              return (
                <tr key={String(r.id)} style={{ background: dirty ? "#fffbeb" : undefined }}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ padding: 4 }}>
                      {c.type === "select" ? (
                        <select
                          value={String(r[c.key] ?? "")}
                          onChange={(e) => updateCell(idx, c.key, e.target.value)}
                          style={{ width: "100%", padding: "5px 6px", fontSize: 12.5 }}
                        >
                          {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input
                          type={c.type ?? "text"}
                          step={c.type === "number" ? "any" : undefined}
                          value={String(r[c.key] ?? "")}
                          onChange={(e) => updateCell(idx, c.key, c.type === "number" ? Number(e.target.value) : e.target.value)}
                          style={{ width: "100%", padding: "5px 6px", fontSize: 12.5, borderColor: dirty ? "var(--primary)" : "#e5e7eb" }}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ padding: 16 }}>No rows found.</p>}
      </div>
    </form>
  );
}
