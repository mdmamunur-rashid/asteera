import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmt, today } from "@/lib/util";
import { createCampaign, deleteCampaign } from "./actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const rows = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.date), desc(schema.campaigns.id)).limit(200);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <h2>Facebook Campaign Tracker</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="stat c-rose"><b>৳ {fmt(totalSpend)}</b><span>Total Ad Spend</span></div>
        <div className="stat c-green"><b>৳ {fmt(totalRev)}</b><span>Total Revenue</span></div>
        <div className="stat c-amber"><b>{totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : "0.00"}x</b><span>Overall ROAS</span></div>
      </div>

      <details className="card">
        <summary><b>+ Add Campaign Entry</b></summary>
        <form action={createCampaign} className="form" style={{ marginTop: 12 }}>
          <label>Date<input type="date" name="date" defaultValue={today()} /></label>
          <label>Campaign Name<input name="name" required /></label>
          <label>Brand / Page<input name="brand" placeholder="Asteera / Hayabin" /></label>
          <label>Ad Spend (৳)<input type="number" step="any" name="spend" defaultValue={0} /></label>
          <label>Orders<input type="number" name="ordersCount" defaultValue={0} /></label>
          <label>Revenue (৳)<input type="number" step="any" name="revenue" defaultValue={0} /></label>
          <label>Notes<input name="notes" /></label>
          <button className="btn">Save</button>
        </form>
      </details>

      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>Campaign</th><th>Brand</th><th>Spend</th><th>Orders</th><th>Revenue</th><th>ROAS</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.date}</td><td><b>{c.name}</b><br /><small>{c.notes}</small></td><td>{c.brand || "—"}</td>
                <td>৳ {fmt(c.spend)}</td><td>{c.ordersCount}</td><td>৳ {fmt(c.revenue)}</td>
                <td><b>{c.spend > 0 ? `${(c.revenue / c.spend).toFixed(2)}x` : "—"}</b></td>
                <td><form action={deleteCampaign}><input type="hidden" name="id" value={c.id} /><button className="link">Delete</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No campaigns logged yet.</p>}
      </div>
    </>
  );
}
