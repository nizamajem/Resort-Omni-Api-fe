"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rememberEmail");
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const API_BASE = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_API_URL;
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    // Fallback to common local backend port
    if (typeof window !== "undefined") console.warn("NEXT_PUBLIC_API_URL not set. Falling back to http://localhost:4000/api");
    return "http://localhost:4000/api";
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        setError(data?.error || data?.message || "Invalid email or password");
        setLoading(false);
        return;
      }
      const token = data?.accessToken as string | undefined;
      const role = (data?.user?.role || data?.role) as string | undefined; // 'superadmin' | 'resort'
      const resortName = (data?.user?.resortName || data?.resortName) as string | undefined;
      try {
        localStorage.setItem("token", token || "");
        localStorage.setItem("auth", JSON.stringify({ email: data?.user?.email || data?.email || email, role, resortName }));
        localStorage.setItem("role", role || "");
        if (remember) localStorage.setItem("rememberEmail", email);
        else localStorage.removeItem("rememberEmail");
        document.cookie = `role=${role || ""}; Path=/; Max-Age=${60 * 60 * 24 * 7}`;
        if (resortName) document.cookie = `resortName=${encodeURIComponent(resortName)}; Path=/; Max-Age=${60 * 60 * 24 * 7}`;
      } catch {}
      const next = searchParams?.get("next") || "";
      const defaultPath = "/dashboard";
      const allowed = role === "superadmin" ? true : !next.startsWith("/admin");
      router.replace(allowed && next ? next : defaultPath);
    } catch (err) {
      setError("Failed to sign in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 md:grid-cols-2">
        {/* Left: Brand + Illustration */}
        <section className="relative hidden md:flex flex-col justify-center border-r bg-white/70 px-10">
          <div className="max-w-sm">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <span className="text-xs font-medium tracking-wide">Partner Portal</span>
            </div>
            <h1 className="text-3xl font-semibold text-slate-900">Sign in to your account</h1>
            <p className="mt-2 text-slate-600">Access packages, orders, and analytics for your resort.</p>
            <div className="mt-8 rounded-2xl bg-gradient-to-tr from-sky-100 via-emerald-100 to-white p-5 ring-1 ring-slate-200">
              <div className="text-sm font-medium text-slate-700">Why use the portal?</div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Purchase and manage packages easily</li>
                <li>Track transactions in real-time</li>
                <li>Manage resort access securely</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Right: Form */}
        <section className="flex items-center justify-center px-6 py-10">
          <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-800">Welcome back</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue.</p>
            </div>

            <label htmlFor="email" className="block text-sm text-slate-700">Email</label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 shadow-sm focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-slate-500"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15A2.25 2.25 0 0 1 2.25 17.25V6.75M21.75 6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25M21.75 6.75v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91A2.25 2.25 0 0 1 2.25 6.993V6.75"/></svg>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder-slate-400"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mt-4">
              <label htmlFor="password" className="block text-sm text-slate-700">Password</label>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 shadow-sm focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-slate-500"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0V10.5m-.75 9h10.5a2.25 2.25 0 0 0 2.25-2.25v-6a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 11.25v6A2.25 2.25 0 0 0 6.75 19.5Z"/></svg>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder-slate-400"
                  placeholder="Enter your password"
                  required
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                Remember me
              </label>
              <a href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900">Forgot password?</a>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />}
              {loading ? "Signing in" : "Sign in"}
            </button>

            <div className="mt-4 text-center text-xs text-slate-500">
              Having trouble? Contact support.
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
