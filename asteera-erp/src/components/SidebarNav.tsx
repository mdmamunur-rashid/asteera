"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export type NavChild = { href: string; label: string };
export type NavItem = { href?: string; label: string; mod: string; children?: NavChild[] };

const ICONS: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  "product-check": <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M8 11h6M11 8v6" /></>,
  inventory: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v9" /></>,
  suppliers: <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
  purchases: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l2.5 11h11l2-8H6" /></>,
  wholesale: <><path d="M3 7h18v13H3z" /><path d="M8 7V4h8v3M3 12h18" /></>,
  sales: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  "moderator-orders": <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  "sheet-edit": <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  expenses: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M16 14h2" /></>,
  "p-demand": <><path d="M12 20V10M18 20V4M6 20v-4" /></>,
  production: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></>,
  courier: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  campaigns: <><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></>,
  ledger: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  "wholesale-ledger": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M19 8v6M22 11h-6" /></>,
  stock: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  report: <><path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
};

export default function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function toggle(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div className="nav-menu">
      {items.map((item) => {
        if (item.children && item.children.length > 0) {
          const childActive = item.children.some((c) => pathname === c.href.split("?")[0]);
          const isOpen = openGroups[item.label] ?? childActive;
          return (
            <div key={item.label}>
              <button type="button" className="nav-item" onClick={() => toggle(item.label)}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  {ICONS[item.mod]}
                </svg>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="nav-sub">
                  {item.children.map((c) => (
                    <Link key={c.href + c.label} href={c.href} className={`nav-item${pathname === c.href ? " active" : ""}`}>
                      <span>{c.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }

        const href = item.href ?? "/";
        const base = href.split("?")[0];
        const active = base === "/" ? pathname === "/" : pathname === base;
        return (
          <Link key={href + item.label} href={href} className={`nav-item${active ? " active" : ""}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              {ICONS[item.mod]}
            </svg>
            <span>{labelOrFallback(item.label)}</span>
          </Link>
        );
      })}
    </div>
  );
}

function labelOrFallback(s: string) {
  return s;
}
