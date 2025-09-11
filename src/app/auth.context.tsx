"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthState = {
  token: string | null;
  role: string | null;
  email: string | null;
  resortName: string | null;
  setAuth: (s: { token?: string | null; role?: string | null; email?: string | null; resortName?: string | null }) => void;
  clear: () => void;
  refreshFromStorage: () => void;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [resortName, setResortName] = useState<string | null>(null);

  const refreshFromStorage = () => {
    try {
      const t = localStorage.getItem("token") || (typeof document !== 'undefined' ? (document.cookie.match(/(?:^|; )token=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )token=([^;]+)/)![1]) : null) : null);
      const r = localStorage.getItem("role") || (typeof document !== 'undefined' ? (document.cookie.match(/(?:^|; )role=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )role=([^;]+)/)![1]) : null) : null);
      const aRaw = localStorage.getItem("auth");
      const a = aRaw ? JSON.parse(aRaw) : null;
      setToken(t && t.trim() ? t : null);
      setRole(r && r.trim() ? r : (a?.role || null));
      setEmail(a?.email || null);
      setResortName(a?.resortName || null);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshFromStorage();
    const onStorage = () => refreshFromStorage();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setAuth = (s: { token?: string | null; role?: string | null; email?: string | null; resortName?: string | null }) => {
    if (s.token !== undefined) {
      setToken(s.token);
      try { localStorage.setItem("token", s.token || ""); document.cookie = `token=${encodeURIComponent(s.token || "")}; Path=/; Max-Age=${60*60*24*7}; SameSite=Lax`; } catch {}
    }
    if (s.role !== undefined) {
      setRole(s.role);
      try { localStorage.setItem("role", s.role || ""); document.cookie = `role=${s.role || ""}; Path=/; Max-Age=${60*60*24*7}`; } catch {}
    }
    if (s.email !== undefined || s.resortName !== undefined) {
      const a = { email: s.email ?? email ?? "", role: s.role ?? role ?? "", resortName: s.resortName ?? resortName ?? "" } as any;
      setEmail(a.email || null);
      setResortName(a.resortName || null);
      try { localStorage.setItem("auth", JSON.stringify(a)); } catch {}
    }
  };

  const clear = () => {
    setToken(null); setRole(null); setEmail(null); setResortName(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("auth");
      document.cookie = `token=; Path=/; Max-Age=0`;
      document.cookie = `role=; Path=/; Max-Age=0`;
      document.cookie = `resortName=; Path=/; Max-Age=0`;
    } catch {}
  };

  const value = useMemo(() => ({ token, role, email, resortName, setAuth, clear, refreshFromStorage }), [token, role, email, resortName]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}