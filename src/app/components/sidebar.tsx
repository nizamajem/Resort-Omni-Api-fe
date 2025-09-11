"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/auth.context";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, clear } = useAuth();
  const router = useRouter();
  const [roleState, setRole] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  // Order: Dashboard -> Add Resort -> Add Package -> History
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5m-16.5 0A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25m-16.5 0v10.5A2.25 2.25 0 0 0 6 21h12a2.25 2.25 0 0 0 2.25-2.25V6.75M8.25 9h7.5m-7.5 4.5H12"/></svg>
    ), show: true },
    { href: "/admin/resorts/add", label: "Add Resort", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0A17.933 17.933 0 0 1 12 21.75c-2.68 0-5.216-.586-7.5-1.632Z"/></svg>
    ), show: (role === "superadmin" || roleState === "superadmin") },
    { href: "/admin/packages/add", label: "Packages", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 7.5 12 12.75 20.625 7.5M12 21.75l-8.625-5.25V7.5L12 2.25l8.625 5.25v9L12 21.75Z"/></svg>
    ), show: (role === "superadmin" || roleState === "superadmin") },
    { href: "/history", label: "History", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 3.5M12 3a9 9 0 1 0 9 9"/></svg>
    ), show: true },
  ].filter((x) => x.show);

  const onLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { clear(); } catch {}
    router.replace("/");
  };

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white/90 backdrop-blur md:block ring-1 ring-slate-200">
      <div className="px-5 py-5">
        <div className="text-sm font-semibold text-slate-900">Partner Portal</div>
        <div className="text-xs text-slate-500">Super Admin</div>
      </div>
      <nav className="px-3 py-2 space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-slate-50"}`}
              title={l.label}
            >
              <span className={`grid h-7 w-7 place-items-center rounded-md ${active ? "bg-sky-200 text-sky-800" : "bg-slate-100 text-slate-700"}`}>{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          );
        })}
        <div className="pt-3">
          <button
            onClick={onLogout}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </nav>
    </aside>
  );
}
