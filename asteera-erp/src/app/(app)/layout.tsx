import type { ReactNode } from "react";
import Link from "next/link";
import { canAccess, getSession } from "@/lib/auth";
import { getDefaultBrand, isStandaloneMode } from "@/lib/settings";
import { logout } from "../login/actions";

const NAV: [string, string, string][] = [
  ["/", "Dashboard", "dashboard"],
  ["/inventory", "Inventory", "inventory"],
  ["/suppliers", "Suppliers", "suppliers"],
  ["/purchases", "Purchases", "purchases"],
  ["/sales", "Sales / Orders", "sales"],
  ["/expenses", "Expenses", "expenses"],
  ["/production", "Production", "production"],
  ["/fabrics", "Fabric stock", "fabrics"],
  ["/ledger", "Supplier ledger", "ledger"],
  ["/users", "Users & Roles", "users"],
  ["/settings", "Settings & Sync", "settings"],
  ["/profile", "My Profile", "profile"],
];

const ICONS: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  inventory: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v9" /></>,
  suppliers: <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
  purchases: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l2.5 11h11l2-8H6" /></>,
  sales: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  expenses: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M16 14h2" /></>,
  production: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></>,
  fabrics: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>,
  ledger: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M19 8v6M22 11h-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [s, brand, standalone] = await Promise.all([getSession(), getDefaultBrand(), isStandaloneMode()]);
  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">
          {brand.logoUrl && (
            <div style={{ width: "100%", height: 96, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={brand.logoUrl} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.35)" }} />
            </div>
          )}
          <h1>{brand.name}</h1>
          <span className={`badge ${standalone ? "ok" : "warn"}`}>
            {standalone ? "Standalone Mode" : "Sheet Sync Ready"}
          </span>
        </div>
        {NAV.filter(([, , mod]) => canAccess(s, mod)).map(([href, label, mod]) => (
          <Link key={href} href={href}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              {ICONS[mod]}
            </svg>
            <span>{label}</span>
          </Link>
        ))}
        <div className="side-foot">
          <b>{s?.name}</b> · <span>{s?.role}</span>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn danger" style={{ width: "100%" }}>Log out</button>
          </form>
        </div>
      </nav>
      <div className="main-wrap">
        <header className="topbar">
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            <b>{brand.name} ERP</b> {brand.phone ? `· ${brand.phone}` : ""}
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Link href="/sales/new" className="btn" style={{ padding: "6px 12px", fontSize: 12.5 }}>+ New Order</Link>
            <Link href="/sales/bulk-print" className="btn secondary" style={{ padding: "6px 12px", fontSize: 12.5 }}>Bulk Print</Link>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
