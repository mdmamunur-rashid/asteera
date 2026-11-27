import Link from "next/link";
import DuplicatesModalClient from "@/components/DuplicatesModalClient";
import SalesTableClient from "@/components/SalesTableClient";
import { loadOrdersView } from "@/lib/sales-list";
import { ORDER_STATUSES } from "@/lib/util";
import { acceptDuplicate, bulkOrderAction, deleteOrder, markPrinted, setOrderStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function Sales({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; printStatus?: string; brand?: string; courier?: string; ok?: string; error?: string }>;
}) {
  const { q, status, from: rawFrom, to: rawTo, printStatus, brand, courier, ok, error } = await searchParams;
  const { from, to, checkDate, countMap, totalCount, dupGroups, unacceptedDupGroups, clientRows } = await loadOrdersView({
    q, status, from: rawFrom, to: rawTo, printStatus, brand, courier,
  });

  const buildTabHref = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (printStatus) p.set("printStatus", printStatus);
    if (brand) p.set("brand", brand);
    if (courier) p.set("courier", courier);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/sales?${qs}` : "/sales";
  };

  return (
    <>
      <h2>Sales / Orders{brand ? ` — ${brand}` : ""}{courier ? ` — ${courier}` : ""}</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      {unacceptedDupGroups.length > 0 && (
        <div className="err" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <b>Warning: {unacceptedDupGroups.length} duplicate phone number(s) on {checkDate}:</b>{" "}
            {unacceptedDupGroups.slice(0, 5).map((g) => `${g.phone10} (${g.orders.map((o) => o.invoiceNo).join(", ")})`).join(" | ")}
            {unacceptedDupGroups.length > 5 ? ` (+${unacceptedDupGroups.length - 5} more)` : ""}
          </div>
          <small>Click <b>Same-day duplicate</b> or <b>Find Duplicates</b> below to compare.</small>
        </div>
      )}

      <div className="tabs">
        <Link href={buildTabHref()} className={`tab ${!status ? "active" : ""}`}>All ({totalCount})</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={buildTabHref(s)} className={`tab ${status === s ? "active" : ""}`}>
            {s} ({countMap.get(s) ?? 0})
          </Link>
        ))}
      </div>

      <div className="toolbar">
        <Link className="btn" href={brand ? `/sales/new?pageName=${encodeURIComponent(brand)}` : "/sales/new"}>+ New order / invoice</Link>
        <Link className="btn secondary" href="/sales/bulk-print">Bulk Print Unprinted</Link>
        <DuplicatesModalClient checkDate={checkDate} groups={dupGroups} acceptAction={acceptDuplicate} deleteAction={deleteOrder} />
        <form className="toolbar" style={{ marginBottom: 0 }}>
          {status && <input type="hidden" name="status" value={status} />}
          {brand && <input type="hidden" name="brand" value={brand} />}
          {courier && <input type="hidden" name="courier" value={courier} />}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            From <input type="date" name="from" defaultValue={from} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            To <input type="date" name="to" defaultValue={to} />
          </label>
          <select name="printStatus" defaultValue={printStatus ?? ""}>
            <option value="">Print Status: All</option>
            <option value="unprinted">Print (Not Printed)</option>
            <option value="printed">Printed</option>
          </select>
          <input name="q" placeholder="Search invoice, name, phone..." defaultValue={q} />
          <button className="btn secondary">Filter</button>
          {(from || to || printStatus || q || status) && <Link href="/sales" className="btn danger" style={{ padding: "8px 12px" }}>Reset</Link>}
        </form>
      </div>

      <SalesTableClient
        rows={clientRows}
        bulkAction={bulkOrderAction}
        inlineStatusAction={setOrderStatus}
        markPrintedAction={markPrinted}
        returnTo="/sales"
      />
    </>
  );
}
