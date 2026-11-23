import type { ReactNode } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import SidebarNav, { type NavItem } from "@/components/SidebarNav";
import { canAccess, getSession, resolvePermissions } from "@/lib/auth";
import { getBrandings, getDefaultBrand, isStandaloneMode } from "@/lib/settings";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [s, brand, brands, standalone] = await Promise.all([
    getSession(),
    getDefaultBrand(),
    getBrandings(),
    isStandaloneMode(),
  ]);
  const [dbUser] = s ? await db.select().from(schema.users).where(eq(schema.users.id, s.uid)).limit(1) : [];
  const liveSession = s && dbUser
    ? { uid: dbUser.id, name: dbUser.name, role: dbUser.role, permissions: resolvePermissions(dbUser.role, dbUser.permissions) }
    : s;

  const moderatorBrands = brands.length > 0
    ? brands.map((b) => ({ href: `/sales?brand=${encodeURIComponent(b.name)}`, label: b.name }))
    : [{ href: "/sales?brand=Asteera", label: "Asteera" }, { href: "/sales?brand=Hayabin", label: "Hayabin" }];

  const NAV: NavItem[] = [
    { href: "/", label: "Dashboard", mod: "dashboard" },
    { href: "/product-check", label: "Product check", mod: "product-check" },
    { href: "/inventory", label: "Inventory", mod: "inventory" },
    { href: "/suppliers", label: "Suppliers", mod: "suppliers" },
    {
      label: "Purchase", mod: "purchases",
      children: [
        { href: "/fabrics", label: "Fabric purchase" },
        { href: "/purchases", label: "Others" },
      ],
    },
    { href: "/wholesale", label: "Wholesale", mod: "wholesale" },
    { href: "/sales", label: "Sales / Orders", mod: "sales" },
    {
      label: "Moderator Orders", mod: "moderator-orders",
      children: moderatorBrands,
    },
    { href: "/sheet-edit?tab=orders", label: "Order Sheet", mod: "sheet-edit" },
    { href: "/expenses", label: "Expenses", mod: "expenses" },
    { href: "/p-demand", label: "P. Demand", mod: "p-demand" },
    {
      label: "Material Production", mod: "production",
      children: [
        { href: "/production", label: "Production log" },
        { href: "/production/fabric-need", label: "SKU Fabric need" },
        { href: "/production/daily-sewing", label: "Daily Sewing Production" },
      ],
    },
    {
      label: "Courier", mod: "courier",
      children: [
        { href: "/sales?courier=Pathao", label: "Pathao Order" },
        { href: "/sales?status=Hold", label: "Pickup Failed" },
        { href: "/sales?status=Returned", label: "Return order" },
      ],
    },
    { href: "/campaigns", label: "Facebook Campaign Tracker", mod: "campaigns" },
    { href: "/ledger", label: "Supplier ledger", mod: "ledger" },
    { href: "/wholesale-ledger", label: "Wholesale ledger", mod: "wholesale-ledger" },
    { href: "/users", label: "Users & Role Control", mod: "users" },
    {
      label: "Stock", mod: "stock",
      children: [
        { href: "/fabrics", label: "Fabric Stock" },
        { href: "/inventory", label: "Product Stock" },
      ],
    },
    { href: "/settings", label: "Settings, Logos & Sheet Sync", mod: "settings" },
    {
      label: "Report", mod: "report",
      children: [
        { href: "/reports/profit-loss", label: "Loss & Profit" },
        { href: "/reports/business-analysis", label: "Business analysis" },
      ],
    },
    { href: "/profile", label: "My Profile", mod: "profile" },
  ];

  const permAlias: Record<string, string> = {
    "product-check": "inventory",
    wholesale: "sales",
    "moderator-orders": "sales",
    "sheet-edit": "sales",
    "p-demand": "production",
    courier: "sales",
    campaigns: "expenses",
    "wholesale-ledger": "ledger",
    stock: "inventory",
    report: "dashboard",
  };

  const allowed = NAV.filter((item) => canAccess(liveSession, permAlias[item.mod] ?? item.mod));
  const initial = (liveSession?.name?.[0] ?? "A").toUpperCase();

  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">
          {brand.logoUrl && (
            <div style={{ width: "100%", height: 74, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 10 }}>
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
            <b style={{ display: "block", fontSize: 13.5, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{liveSession?.name}</b>
            <small style={{ fontSize: 10.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{liveSession?.role}</small>
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
            {brand.name} ERP
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
