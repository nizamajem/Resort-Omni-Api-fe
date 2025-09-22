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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [omniOpen, setOmniOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);

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

  // Main links (non-OMNI, non-ops)
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5m-16.5 0A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25m-16.5 0v10.5A2.25 2.25 0 0 0 6 21h12a2.25 2.25 0 0 0 2.25-2.25V6.75M8.25 9h7.5m-7.5 4.5H12"/></svg>
    ), show: true },
  ].filter((x) => x.show);

  const historyLinks = [
    { href: "/history", label: "Payment History", matchDeep: false },
    { href: "/history/cycling", label: "Cycling History", matchDeep: true },
  ];

  const onLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { clear(); } catch {}
    router.replace("/");
  };

  const isHistory = pathname.startsWith('/history');
  const isOmni = pathname.startsWith('/admin/settings/omni');
  const isOps = pathname.startsWith('/admin/resorts') || pathname.startsWith('/admin/packages') || pathname.startsWith('/admin/settings') || pathname.startsWith('/admin/operations');

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white/90 backdrop-blur md:block ring-1 ring-slate-200">
      <div className="px-5 py-5">
        <div className="text-sm font-semibold text-slate-900">Partner Portal</div>
        <div className="text-xs text-slate-500">Gridwiz Side</div>
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

        <div className="pt-2">
          <button
            onClick={() => setHistoryOpen((s) => !s)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${isHistory ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <span className="flex items-center gap-3">
              <span className={`grid h-7 w-7 place-items-center rounded-md ${isHistory ? 'bg-sky-200 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 3.5M12 3a9 9 0 1 0 9 9"/></svg>
              </span>
              <span>History</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${historyOpen || isHistory ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/></svg>
          </button>
          {(historyOpen || isHistory) && (
            <div className="mt-1 space-y-1 pl-10">
              {historyLinks.map((hl) => {
                const active = pathname === hl.href || (hl.matchDeep && pathname.startsWith(`${hl.href}/`));
                return (
                  <Link
                    key={hl.href}
                    href={hl.href}
                    className={`block rounded-md px-2 py-1 text-sm ${active ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {hl.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {(role === "superadmin" || roleState === "superadmin") && (
          <>
            {/* Gridwiz Operation group */}
            <div className="pt-2">
              <button
                onClick={() => setOpsOpen((s) => !s)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${isOps ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-md ${isOps ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9"/></svg>
                  </span>
                  <span>Gridwiz Operation</span>
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${opsOpen || isOps ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/></svg>
              </button>
              {(opsOpen || isOps) && (
                <div className="mt-1 space-y-1 pl-10">
                  <Link href="/admin/resorts/add" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/resorts/add' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}>Add Resort</Link>
                  <Link href="/admin/packages/add" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/packages/add' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}>Add Packages</Link>
                  <Link href="/admin/settings" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}>Fitur Settings</Link>
                  <Link href="/admin/operations/bikes" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/operations/bikes' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}>Bike List</Link>
                  <Link href="/admin/debug" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/debug' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}> Fitur Debug Logs</Link>
                </div>
              )}
            </div>

            {/* OMNI API group */}
            <div className="pt-2">
              <button
                onClick={() => setOmniOpen((s) => !s)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${isOmni ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-md ${isOmni ? 'bg-sky-200 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9"/></svg>
                  </span>
                  <span>OMNI API</span>
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${omniOpen || isOmni ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/></svg>
              </button>
              {(omniOpen || isOmni) && (
                <div className="mt-1 space-y-1 pl-10">
                  <Link href="/admin/settings/omni" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings/omni' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>API connection</Link>
                  <Link href="/admin/settings/omni/ebikes" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings/omni/ebikes' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>Device Control</Link>
                  <Link href="/admin/settings/omni/devices" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings/omni/devices' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>View Device</Link>
                  <Link href="/admin/settings/omni/callbacks" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings/omni/callbacks' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>Callbacks</Link>
                  <Link href="/admin/settings/omni/logs" className={`block rounded-md px-2 py-1 text-sm ${pathname === '/admin/settings/omni/logs' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>Logs</Link>
                </div>
              )}
            </div>
          </>
        )}

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



