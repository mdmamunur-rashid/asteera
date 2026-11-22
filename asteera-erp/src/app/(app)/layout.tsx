import type { ReactNode } from "react";
import Link from "next/link";
import SidebarNav, { type NavItem } from "@/components/SidebarNav";
import { canAccess, getSession } from "@/lib/auth";
import { getDefaultBrand, isStandaloneMode } from "@/lib/settings";
import { logout } from "../login/actions";

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", mod: "dashboard" },
  { href: "/inventory", label: "Inventory", mod: "inventory" },
  { href: "/suppliers", label: "Suppliers", mod: "suppliers" },
  { href: "/purchases", label: "Purchases", mod: "purchases" },
  { href: "/sales", label: "Sales / Orders", mod: "sales" },
  { href: "/sheet-edit", label: "Sheet Editor", mod: "sheet-edit" },
  { href: "/expenses", label: "Expenses", mod: "expenses" },
  { href: "/production", label: "Production", mod: "production" },
  { href: "/fabrics", label: "Fabric stock", mod: "fabrics" },
  { href: "/ledger", label: "Supplier ledger", mod: "ledger" },
  { href: "/users", label: "Users & Roles", mod: "users" },
  { href: "/settings", label: "Settings & Sync", mod: "settings" },
  { href: "/profile", label: "My Profile", mod: "profile" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [s, brand, standalone] = await Promise.all([getSession(), getDefaultBrand(), isStandaloneMode()]);
  const allowed = NAV.filter((item) => item.mod === "sheet-edit" ? (canAccess(s, "inventory") || canAccess(s, "sales")) : canAccess(s, item.mod));
  const initial = (s?.name?.[0] ?? "A").toUpperCase();

  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">
          {brand.logoUrl && (
            <div style={{ width: "100%", height: 90, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 10 }}>
              <img src={brand.logoUrl} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.35)" }} />
            </div>
          )}
          <h1>{brand.name}</h1>
          <span className={`badge ${standalone ? "ok" : "warn"}`}>
            {standalone ? "Standalone Mode" : "Sheet Sync Ready"}
          </span>
        </div>

        <div className="side-profile">
          <div className="side-avatar">{initial}</div>
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 13.5, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s?.name}</b>
            <small style={{ fontSize: 10.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{s?.role}</small>
          </div>
        </div>

        <SidebarNav items={allowed} />

        <div className="side-foot">
          <form action={logout}>
            <button className="logout-btn">Log out</button>
          </form>
        </div>
      </nav>
      <div className="main-wrap">
        <header className="topbar">
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--teal)" }}>
            {brand.name} ERP {brand.phone ? <small style={{ fontWeight: 500, color: "var(--muted)" }}>· {brand.phone}</small> : null}
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
