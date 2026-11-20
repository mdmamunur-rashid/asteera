export const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const today = () => new Date().toISOString().slice(0, 10);

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const num = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
};

export type Line = { itemId: number; qty: number; price: number };
export function parseLines(raw: string): Line[] {
  let arr: unknown;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => ({ itemId: Number(r?.itemId), qty: Number(r?.qty), price: Number(r?.price) }))
    .filter((l) => l.itemId > 0 && l.qty > 0 && Number.isFinite(l.price) && l.price >= 0);
}

export const ORDER_STATUSES = ["New", "Ready to Bill", "Billed", "In Courier", "Delivered", "Returned", "Hold", "Cancelled"];
/** Statuses that do NOT reduce stock. */
export const NON_STOCK_STATUSES = ["New", "Cancelled", "Returned"];
export const STAGE_STATUSES = ["Not Started", "In Progress", "Done", "On Hold"];
