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

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [s, brand, standalone] = await Promise.all([getSession(), getDefaultBrand(), isStandaloneMode()]);
  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt={brand.name} style={{ width: "100%", maxHeight: 72, objectFit: "contain", display: "block" }} />
          )}
          <h1>{brand.name}</h1>
          <span className={`badge ${standalone ? "ok" : "warn"}`}>
            {standalone ? "Standalone Mode" : "Sheet Sync Ready"}
          </span>
        </div>
        {NAV.filter(([, , mod]) => canAccess(s, mod)).map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
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
