import { redirect } from "next/navigation";
import { canAccess, requireSession } from "@/lib/auth";
import { getBrandings, getSettingsMap } from "@/lib/settings";
import {
  deleteBranding, makeStandalone, reconnectSheets, runSheetSync,
  saveBranding, saveIntegrations, saveSheetConfig, setDefaultBrand,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [s, { error, ok }, brands, cfg] = await Promise.all([
    requireSession(), searchParams, getBrandings(), getSettingsMap(),
  ]);
  if (!canAccess(s, "settings")) redirect("/");

  const standalone = cfg.standalone_mode === "true";

  return (
    <>
      <h2>Settings, Logos &amp; Sheet Sync</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      {/* 1. Google Sheets Sync & Standalone Disconnect */}
      <div className="card" style={{ borderLeft: `4px solid ${standalone ? "#10b981" : "#ff8c00"}` }}>
        <h3>Google Sheets Sync &amp; Standalone Mode</h3>
        {standalone ? (
          <>
            <p><span className="badge ok">Standalone Mode Active</span> Google Sheets are disconnected. The ERP runs 100% independently on cPanel MySQL.</p>
            <form action={reconnectSheets}><button className="btn secondary">Re-enable Sheet Sync</button></form>
          </>
        ) : (
          <>
            <p>Sync existing data from your Google Sheets, then click <b>Make Standalone (Disconnect Sheets)</b> once setup is complete.</p>
            <form action={saveSheetConfig} className="form" style={{ marginBottom: 12 }}>
              <label>Inventory Sheet ID<input name="inv_sheet_id" defaultValue={cfg.inv_sheet_id ?? ""} /></label>
              <label>Order Sheet ID<input name="order_sheet_id" defaultValue={cfg.order_sheet_id ?? ""} /></label>
              <label>Production Sheet ID<input name="prod_sheet_id" defaultValue={cfg.prod_sheet_id ?? ""} /></label>
              <button className="btn secondary">Save Sheet IDs</button>
            </form>
            <div className="toolbar">
              <form action={runSheetSync}><button className="btn">Sync Now from Google Sheets</button></form>
              <form action={makeStandalone}><button className="btn danger">Make Standalone (Disconnect Sheets)</button></form>
            </div>
          </>
        )}
      </div>

      {/* 2. Brandings & Logo Selection */}
      <div className="card">
        <h3>Logos &amp; Brandings</h3>
        <form action={saveBranding} className="form" style={{ marginBottom: 16 }}>
          <label>Brand / Page Name<input name="name" placeholder="e.g. Asteera" required /></label>
          <label>Logo URL<input name="logoUrl" placeholder="https://..." /></label>
          <label>Phone<input name="phone" placeholder="018..." /></label>
          <label>Address<input name="address" placeholder="Dhaka..." /></label>
          <button className="btn">+ Add Brand / Logo</button>
        </form>
        <table>
          <thead><tr><th>Logo</th><th>Name</th><th>Phone &amp; Address</th><th>Active Default</th><th /></tr></thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id}>
                <td>{b.logoUrl ? <img src={b.logoUrl} alt={b.name} style={{ maxHeight: 64, maxWidth: 160, objectFit: "contain" }} /> : "—"}</td>
                <td><b>{b.name}</b></td>
                <td>{b.phone}<br /><small style={{ whiteSpace: "pre-line" }}>{b.address}</small></td>
                <td>
                  {b.isDefault === 1 ? (
                    <span className="badge ok">Active Default</span>
                  ) : (
                    <form action={setDefaultBrand}><input type="hidden" name="id" value={b.id} /><button className="btn secondary">Use as Default</button></form>
                  )}
                </td>
                <td>
                  {b.isDefault !== 1 && (
                    <form action={deleteBranding}><input type="hidden" name="id" value={b.id} /><button className="link">Delete</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3. Courier & SMS Credentials */}
      <div className="card">
        <h3>Courier (Steadfast / Pathao) &amp; SMS Settings</h3>
        <form action={saveIntegrations} className="form">
          <label>Steadfast API Key<input name="steadfast_api_key" defaultValue={cfg.steadfast_api_key ?? ""} type="password" /></label>
          <label>Steadfast Secret Key<input name="steadfast_secret_key" defaultValue={cfg.steadfast_secret_key ?? ""} type="password" /></label>
          <label>Pathao Base URL<input name="pathao_base_url" defaultValue={cfg.pathao_base_url || "https://api-hermes.pathao.com"} /></label>
          <label>Pathao Store ID<input name="pathao_store_id" defaultValue={cfg.pathao_store_id ?? ""} /></label>
          <label>Pathao Client ID<input name="pathao_client_id" defaultValue={cfg.pathao_client_id ?? ""} /></label>
          <label>Pathao Client Secret<input name="pathao_client_secret" defaultValue={cfg.pathao_client_secret ?? ""} type="password" /></label>
          <label>Pathao Username<input name="pathao_username" defaultValue={cfg.pathao_username ?? ""} /></label>
          <label>Pathao Password<input name="pathao_password" defaultValue={cfg.pathao_password ?? ""} type="password" /></label>
          <label>Pathao Webhook Secret<input name="pathao_webhook_secret" defaultValue={cfg.pathao_webhook_secret ?? ""} type="password" /></label>
          <label>Automas SMS API Key<input name="sms_api_key" defaultValue={cfg.sms_api_key ?? ""} type="password" /></label>
          <label>SMS Sender ID<input name="sms_sender" defaultValue={cfg.sms_sender ?? "8809617171817"} /></label>
          <label>Send SMS on Courier Dispatch
            <select name="sms_enabled" defaultValue={cfg.sms_enabled ?? "true"}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <button className="btn">Save Integrations</button>
        </form>
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          Webhook URL for Pathao &amp; Steadfast: <code>https://asteera.erp.innerspinbd.com/api/webhooks/courier</code>
        </p>
      </div>
    </>
  );
}
