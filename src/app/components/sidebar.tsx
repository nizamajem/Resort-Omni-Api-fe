"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const r = localStorage.getItem("role") || (typeof document !== 'undefined' ? (document.cookie.match(/(?:^|; )role=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )role=([^;]+)/)![1]) : null) : null);
      setRole(r);
    } catch {}
  }, []);

  // Hide sidebar on login/auth pages regardless of role
  if (pathname && pathname.startsWith("/login")) {
    return null;
  }

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/history", label: "History", show: true },
    { href: "/admin/packages/add", label: "Add Package", show: role === "superadmin" },
    { href: "/admin/resorts/add", label: "Add Resort", show: role === "superadmin" },
  ].filter((x) => x.show);

  const onLogout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("auth");
      localStorage.removeItem("role");
      document.cookie = `role=; Path=/; Max-Age=0`;
      document.cookie = `resortName=; Path=/; Max-Age=0`;
    } catch {}
    window.location.href = "/login";
  };

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-white/90 backdrop-blur md:block ring-1 ring-slate-200">
      <div className="px-4 py-5">
        <div className="text-sm font-semibold text-slate-800">Partner Portal</div>
        <div className="text-xs text-slate-500">Resort Admin</div>
      </div>
      <nav className="px-2 py-2 space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {l.label}
            </Link>
          );
        })}
        <button
          onClick={onLogout}
          className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          Logout
        </button>
      </nav>
    </aside>
  );
}
