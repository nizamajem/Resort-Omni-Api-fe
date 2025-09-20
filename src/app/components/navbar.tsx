"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/auth.context";
import { useEffect, useRef, useState } from "react";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, email: ctxEmail, resortName: ctxResort, clear } = useAuth();
  const [roleState, setRole] = useState<string | null>(null);
  const [resortName, setResortName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const r = typeof window !== 'undefined'
        ? (localStorage.getItem('role') || (document.cookie.match(/(?:^|; )role=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )role=([^;]+)/)![1]) : null))
        : null;
      setRole(r);
      const raw = localStorage.getItem("auth");
      const auth = raw ? JSON.parse(raw) : null;
      setResortName(auth?.resortName || "");
      setEmail(auth?.email || "");
    } catch {}
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  // Hide navbar on login/auth pages
  if (pathname && pathname.startsWith("/login")) return null;

  const onLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { clear(); } catch {}
    router.replace("/");
  };

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/history", label: "History", show: true },
    { href: "/admin/resorts/add", label: "Add Resort", show: role === 'superadmin' },
    { href: "/admin/packages/add", label: "Packages", show: role === 'superadmin' },
    { href: "/admin/settings/omni", label: "OMNI Settings", show: role === 'superadmin' },
    { href: "/admin/settings/omni/devices", label: "OMNI View Device", show: role === 'superadmin' },
    { href: "/admin/settings/omni/callbacks", label: "OMNI Callbacks", show: role === 'superadmin' },
    { href: "/admin/settings/omni/logs", label: "OMNI Logs", show: role === 'superadmin' },
  ].filter((l) => l.show);

  const hideDesktopForSuper = role === 'superadmin' ? 'md:hidden' : '';

  return (
    <header className={`sticky top-0 z-40 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 ${hideDesktopForSuper}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M6 4.5h12A2.25 2.25 0 0 1 20.25 6.75v10.5A2.25 2.25 0 0 1 18 19.5H6A2.25 2.25 0 0 1 3.75 17.25V6.75A2.25 2.25 0 0 1 6 4.5Z"/></svg>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Resort Dashboard</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[12rem]">{resortName || (role === 'superadmin' ? 'Super Admin' : email)}</div>
          </div>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((s) => !s)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm active:scale-[0.98]"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="hidden xs:inline">Menu</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 8.25h10.5M6.75 12h10.5M6.75 15.75h10.5"/></svg>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Navigation</div>
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                  <span>{l.label}</span>
                </Link>
              ))}
              <div className="my-1 h-px bg-slate-200" />
              <button onClick={onLogout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3H6A2.25 2.25 0 0 0 3.75 5.25v13.5A2.25 2.25 0 0 0 6 21h7.5a2.25 2.25 0 0 0 2.25-2.25V15m-6 0 3-3m0 0-3-3m3 3H21"/></svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
