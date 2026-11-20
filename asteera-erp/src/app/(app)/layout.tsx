import type { ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logout } from "../login/actions";

const NAV = [
  ["/", "Dashboard"], ["/inventory", "Inventory"], ["/suppliers", "Suppliers"], ["/purchases", "Purchases"],
  ["/sales", "Sales / Orders"], ["/expenses", "Expenses"], ["/production", "Production"],
  ["/fabrics", "Fabric stock"], ["/ledger", "Supplier ledger"],
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  return (
    <div className="shell">
      <nav className="side">
        <h1>{process.env.BRAND_NAME ?? "Asteera"}</h1>
        {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        <form action={logout}>
          <small>{s?.name}</small><br />
          <button className="btn danger" style={{ marginTop: 6 }}>Log out</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
