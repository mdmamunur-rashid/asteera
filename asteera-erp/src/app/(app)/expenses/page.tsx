import Link from "next/link";
import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, today } from "@/lib/util";
import { createExpense, deleteExpense, toggleExpenseStatus } from "./actions";

export const dynamic = "force-dynamic";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    from?: string;
    to?: string;
    category?: string;
    status?: string;
    q?: string;
    all?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const now = today();
  const currentMonth = now.slice(0, 7);
  const showAll = sp.all === "1";
  const hasDateRange = Boolean((sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) || (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)));
  const month = !showAll && !hasDateRange
    ? (sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth)
    : "";
  const from = hasDateRange && sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : "";
  const to = hasDateRange && sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : "";
  const category = (sp.category ?? "").trim();
  const status = (sp.status ?? "").trim();
  const q = (sp.q ?? "").trim();

  const conditions: SQL[] = [];
  if (month) {
    conditions.push(gte(schema.expenses.date, `${month}-01`));
    conditions.push(lte(schema.expenses.date, `${month}-31`));
  } else {
    if (from) conditions.push(gte(schema.expenses.date, from));
    if (to) conditions.push(lte(schema.expenses.date, to));
  }
  if (category) conditions.push(eq(schema.expenses.category, category));
  if (status === "Paid" || status === "Unpaid") conditions.push(eq(schema.expenses.paymentStatus, status));
  if (q) {
    const term = `%${q}%`;
    conditions.push(or(like(schema.expenses.purpose, term), like(schema.expenses.notes, term), like(schema.expenses.paidBy, term), like(schema.expenses.category, term))!);
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  // Category breakdown uses the same date/month/status/search filters, ignoring category filter so user can switch categories easily
  const catConditions: SQL[] = [];
  if (month) {
    catConditions.push(gte(schema.expenses.date, `${month}-01`));
    catConditions.push(lte(schema.expenses.date, `${month}-31`));
  } else {
    if (from) catConditions.push(gte(schema.expenses.date, from));
    if (to) catConditions.push(lte(schema.expenses.date, to));
  }
  if (status === "Paid" || status === "Unpaid") catConditions.push(eq(schema.expenses.paymentStatus, status));
  const catWhere = catConditions.length ? and(...catConditions) : undefined;

  const [rows, byCat, allCategories, monthlySummary] = await Promise.all([
    db.select().from(schema.expenses).where(whereClause).orderBy(desc(schema.expenses.date), desc(schema.expenses.id)).limit(500),
    db.select({
      c: schema.expenses.category,
      t: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)`,
      cnt: sql<number>`COUNT(*)`,
    }).from(schema.expenses).where(catWhere).groupBy(schema.expenses.category).orderBy(desc(sql`SUM(${schema.expenses.amount})`)),
    db.selectDistinct({ c: schema.expenses.category }).from(schema.expenses).orderBy(asc(schema.expenses.category)),
    db.select({
      ym: sql<string>`DATE_FORMAT(${schema.expenses.date}, '%Y-%m')`,
      total: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)`,
      paid: sql<number>`COALESCE(SUM(CASE WHEN ${schema.expenses.paymentStatus} = 'Paid' THEN ${schema.expenses.amount} ELSE 0 END), 0)`,
      unpaid: sql<number>`COALESCE(SUM(CASE WHEN ${schema.expenses.paymentStatus} <> 'Paid' THEN ${schema.expenses.amount} ELSE 0 END), 0)`,
      cnt: sql<number>`COUNT(*)`,
    }).from(schema.expenses).groupBy(sql`DATE_FORMAT(${schema.expenses.date}, '%Y-%m')`).orderBy(desc(sql`DATE_FORMAT(${schema.expenses.date}, '%Y-%m')`)).limit(12),
  ]);

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const paidAmount = rows.filter((r) => r.paymentStatus === "Paid").reduce((s, r) => s + Number(r.amount || 0), 0);
  const unpaidAmount = totalAmount - paidAmount;

  const periodText = showAll
    ? "All Months"
    : hasDateRange
      ? `${from || "Start"} to ${to || "End"}`
      : monthLabel(month);

  const buildFilterHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (month && !("from" in overrides) && !("to" in overrides) && overrides.all !== "1") p.set("month", overrides.month ?? month);
    if (from && !("month" in overrides) && overrides.all !== "1") p.set("from", overrides.from ?? from);
    if (to && !("month" in overrides) && overrides.all !== "1") p.set("to", overrides.to ?? to);
    if (overrides.all === "1") p.set("all", "1");
    const nextCat = "category" in overrides ? overrides.category : category;
    if (nextCat) p.set("category", nextCat);
    const nextStatus = "status" in overrides ? overrides.status : status;
    if (nextStatus) p.set("status", nextStatus);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Expenses</h2>
          <small style={{ color: "var(--muted)" }}>Period: <b>{periodText}</b>{category ? <> · Category: <b>{category}</b></> : null}{status ? <> · Status: <b>{status}</b></> : null}</small>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/expenses?month=${currentMonth}`} className={`btn ${month === currentMonth && !category && !status ? "" : "secondary"}`}>This Month</Link>
          <Link href="/expenses?all=1" className={`btn ${showAll ? "" : "secondary"}`}>All Months</Link>
        </div>
      </div>

      {sp.error && <div className="err">{sp.error}</div>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 14 }}>
        <div className="stat c-rose"><b>৳ {fmt(totalAmount)}</b><span>{periodText} Total ({rows.length})</span></div>
        <div className="stat c-green"><b>৳ {fmt(paidAmount)}</b><span>Paid</span></div>
        <div className="stat c-amber"><b>৳ {fmt(unpaidAmount)}</b><span>Unpaid</span></div>
      </div>

      <details className="card">
        <summary><b>+ Add expense</b></summary>
        <form action={createExpense} className="form" style={{ marginTop: 12 }}>
          <label>Date<input type="date" name="date" defaultValue={now} required /></label>
          <label>
            Category
            <input name="category" list="expense-categories" required placeholder="e.g. Salary, Rent, Ads, Packaging" />
            <datalist id="expense-categories">
              {allCategories.map((c) => <option key={c.c} value={c.c} />)}
            </datalist>
          </label>
          <label>Purpose<input name="purpose" placeholder="Short description" /></label>
          <label>Amount<input type="number" step="any" min="0.01" name="amount" required /></label>
          <label>Status<select name="paymentStatus"><option>Paid</option><option>Unpaid</option></select></label>
          <label>Paid by<input name="paidBy" /></label>
          <label>Notes<input name="notes" /></label>
          <button className="btn">Save</button>
        </form>
      </details>

      <div className="card">
        <form className="toolbar" style={{ marginBottom: 0 }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            Month
            <input type="month" name="month" defaultValue={month} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            From Date (overrides month)
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            To Date
            <input type="date" name="to" defaultValue={to} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            Category
            <select name="category" defaultValue={category}>
              <option value="">All Categories</option>
              {allCategories.map((c) => <option key={c.c} value={c.c}>{c.c}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            Status
            <select name="status" defaultValue={status}>
              <option value="">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "var(--muted)" }}>
            Search
            <input name="q" placeholder="Purpose / Notes / Paid by" defaultValue={q} />
          </label>
          <button className="btn" style={{ alignSelf: "flex-end" }}>Filter</button>
          <Link href={`/expenses?month=${currentMonth}`} className="btn secondary" style={{ alignSelf: "flex-end" }}>Reset</Link>
        </form>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <b>By Category ({periodText})</b>
          {category && <Link href={buildFilterHref({ category: "" })} className="link">Clear category filter</Link>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {byCat.map((c) => {
            const active = category === c.c;
            return (
              <Link
                key={c.c}
                href={buildFilterHref({ category: active ? "" : c.c })}
                className={`badge ${active ? "ok" : ""}`}
                style={{ textDecoration: "none", padding: "6px 10px", fontSize: 12.5, border: active ? "1px solid var(--brand)" : "1px solid var(--line)" }}
              >
                {c.c} ({c.cnt}): <b>৳ {fmt(c.t)}</b>
              </Link>
            );
          })}
          {byCat.length === 0 && <small style={{ color: "var(--muted)" }}>No expenses in this period.</small>}
        </div>
      </div>

      {monthlySummary.length > 0 && (
        <details className="card">
          <summary><b>Monthly Breakdown (Last {monthlySummary.length} Months)</b></summary>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Month</th><th>Entries</th><th>Paid</th><th>Unpaid</th><th>Total</th><th /></tr></thead>
            <tbody>
              {monthlySummary.map((m) => (
                <tr key={m.ym} style={m.ym === month ? { background: "rgba(0,90,90,0.06)", fontWeight: 600 } : undefined}>
                  <td>{monthLabel(m.ym)} ({m.ym})</td>
                  <td>{m.cnt}</td>
                  <td>৳ {fmt(m.paid)}</td>
                  <td>৳ {fmt(m.unpaid)}</td>
                  <td><b>৳ {fmt(m.total)}</b></td>
                  <td><Link href={`/expenses?month=${m.ym}`} className="link">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Paid by</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                <td><Link href={buildFilterHref({ category: e.category })} className="badge" style={{ textDecoration: "none" }}>{e.category}</Link></td>
                <td>{e.purpose}</td>
                <td><b>৳ {fmt(e.amount)}</b></td>
                <td>
                  <form action={toggleExpenseStatus} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="nextStatus" value={e.paymentStatus === "Paid" ? "Unpaid" : "Paid"} />
                    <button className={`badge ${e.paymentStatus === "Paid" ? "ok" : "warn"}`} style={{ border: "none", cursor: "pointer" }} title="Click to toggle Paid/Unpaid">
                      {e.paymentStatus}
                    </button>
                  </form>
                </td>
                <td>{e.paidBy}</td>
                <td><small>{e.notes}</small></td>
                <td>
                  <form action={deleteExpense} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="link" style={{ color: "#b91c1c" }}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ color: "var(--muted)" }}>No expenses match the selected filters.</p>}
      </div>
    </>
  );
}
