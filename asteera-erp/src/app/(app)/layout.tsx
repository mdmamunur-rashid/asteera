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
        <div style={{ padding: "0 20px 14px" }}>
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt={brand.name} style={{ width: "100%", maxHeight: 72, objectFit: "contain", display: "block", marginBottom: 8, background: "#fff", padding: 6, borderRadius: 8 }} />
          )}
          <h1 style={{ margin: 0 }}>{brand.name}</h1>
          <small style={{ color: standalone ? "#86efac" : "#fde68a", fontSize: 11 }}>
            {standalone ? "Standalone Mode" : "Sheet Sync Ready"}
          </small>
        </div>
        {NAV.filter(([, , mod]) => canAccess(s, mod)).map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
        <form action={logout}>
          <small>{s?.name} ({s?.role})</small><br />
          <button className="btn danger" style={{ marginTop: 6 }}>Log out</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
