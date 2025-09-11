"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/lib/api";

type HistoryRow = {
  id: string;
  resortName?: string;
  userEmail?: string;
  userPassword?: string;
  packageName?: string;
  price?: number;
  duration?: string;
  purchasedAt?: string; // ISO string
  status?: "success" | "failed" | "canceled" | "pending";
  paymentMethod?: "cash" | "online";
};

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "canceled" | "pending">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "cash" | "online">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  const fmtIDR = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const u = new URL(`${API_BASE}/orders/history`);
      if (statusFilter !== "all") u.searchParams.set("status", statusFilter);
      if (methodFilter !== "all") u.searchParams.set("paymentMethod", methodFilter);
      if (from) u.searchParams.set("from", from);
      if (to) u.searchParams.set("to", to);
      const res = await fetch(u.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      const list: HistoryRow[] = Array.isArray(data)
        ? data.map((r: any) => ({
            id: r.id,
            resortName: r.resortName ?? "-",
            userEmail: r.userEmail ?? "",
            userPassword: r.userPassword ?? "",
            packageName: r.packageName ?? r.pkg ?? "-",
            price: Number(r.price ?? 0),
            duration: r.duration ?? "",
            purchasedAt: r.purchasedAt ? new Date(r.purchasedAt).toISOString() : r.createdAt,
            status: r.status ?? "success",
            paymentMethod: r.paymentMethod ?? "cash",
          }))
        : [];
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load history");
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  const filtered = rows
    .filter((x) => (statusFilter === "all" ? true : x.status === statusFilter))
    .filter((x) => (methodFilter === "all" ? true : x.paymentMethod === methodFilter))
    .filter((x) =>
      q
        ? `${x.id} ${x.resortName} ${x.userEmail} ${x.packageName} ${x.duration}`.toLowerCase().includes(q.toLowerCase())
        : true
    );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  const paged = filtered.slice(start, end);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, methodFilter, from, to]);

  const downloadCSV = () => {
    const header = [
      "ID",
      "Resort",
      "Guest Email",
      "Guest Password",
      "Package",
      "Price",
      "Duration",
      "Date",
      "Status",
      "Method",
    ];
    const lines = filtered.map((r) => [
      r.id,
      r.resortName || "",
      r.userEmail || "",
      r.userPassword || "",
      r.packageName || "",
      String(r.price || 0),
      r.duration || "",
      r.purchasedAt || "",
      r.status || "",
      r.paymentMethod || "",
    ]);
    const csv = [header, ...lines].map((a) => a.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const StatusPill = ({ s }: { s?: HistoryRow["status"] }) => {
    const map: Record<string, string> = {
      success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      failed: "bg-rose-50 text-rose-700 ring-rose-200",
      canceled: "bg-amber-50 text-amber-800 ring-amber-200",
      pending: "bg-slate-100 text-slate-700 ring-slate-200",
    };
    const dot = s === "success" ? "bg-emerald-500" : s === "failed" ? "bg-rose-500" : s === "canceled" ? "bg-amber-500" : "bg-slate-500";
    const label = s ? s[0].toUpperCase() + s.slice(1) : "-";
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${map[s || "pending"]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </span>
    );
  };

  const MethodPill = ({ m }: { m?: HistoryRow["paymentMethod"] }) => {
    const map: any = { cash: "bg-slate-100 text-slate-800 ring-slate-200", online: "bg-sky-50 text-sky-700 ring-sky-200" };
    return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${map[m || "cash"]}`}>{m === "online" ? "Online" : "Cash"}</span>;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 3.5M12 3a9 9 0 1 0 9 9"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Purchase History</h1>
              <p className="text-sm text-slate-600">See your package purchases including payment method and status.</p>
            </div>
          </div>
          <button onClick={downloadCSV} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Export CSV</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="search"
            placeholder="Search id, resort, email, package, duration"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100">
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="canceled">Canceled</option>
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100">
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={load} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Apply</button>
          {(q || from || to || statusFilter !== "all" || methodFilter !== "all") && (
            <button onClick={() => { setQ(""); setFrom(""); setTo(""); setStatusFilter("all"); setMethodFilter("all"); load(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50">Reset</button>
          )}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Resort</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No data.</td></tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-500">{r.id}</td>
                    <td className="px-4 py-3 text-slate-800">{r.resortName || "-"}</td>
                    <td className="px-4 py-3 text-slate-800">
                      <div className="text-slate-900">{r.userEmail || "-"}</div>
                      {r.userPassword ? <div className="text-xs text-slate-500">{r.userPassword}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <div>{r.packageName || "-"}</div>
                      {r.duration ? <div className="text-xs text-slate-500">{r.duration}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{fmtIDR(r.price || 0)}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(r.purchasedAt)}</td>
                    <td className="px-4 py-3"><MethodPill m={r.paymentMethod} /></td>
                    <td className="px-4 py-3"><StatusPill s={r.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-600">Showing <span className="font-medium">{total === 0 ? 0 : start + 1}</span>–<span className="font-medium">{end}</span> of <span className="font-medium">{total}</span></div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            <div className="text-xs text-slate-600">Page {page} / {totalPages}</div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </section>
    </div>
  );
}
