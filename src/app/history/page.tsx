"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/lib/api";
import { useAuth } from "@/app/auth.context";

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
  orderId?: string;
};

type RentalRow = {
  id: string;
  resortName?: string;
  guestName: string;
  roomNumber: string;
  packageName: string;
  basePrice: number;
  baseMinutes: number;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'unpaid' | 'paid';
  amountDue?: number;
};

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [methodMap, setMethodMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [debugOpen, setDebugOpen] = useState(false);
  type DebugLog = { step: string; ok: boolean; status?: number; url?: string; note?: string; payload?: any; response?: any; error?: any };
  const [debug, setDebug] = useState<DebugLog[]>([]);
  const addDebug = (d: DebugLog) => setDebug((prev) => [...prev, d]);
  // Removed rental status and payment type filters per request

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "canceled" | "pending">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "cash" | "online">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { role } = useAuth();
  const isSuperAdmin = role === 'superadmin';

  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ rentalId: string; historyId?: string; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const columnCount = isSuperAdmin ? 10 : 9;

  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  const fmtIDR = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
  const fmtDate = (iso?: string | number) =>
    iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setDebug([]);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const authRaw = typeof window !== 'undefined' ? localStorage.getItem('auth') : null;
      let resortName = '-';
      try { const a = authRaw ? JSON.parse(authRaw) : null; resortName = a?.resortName || '-'; } catch {}
      addDebug({ step: 'auth', ok: !!token, note: `token:${token ? 'present' : 'missing'} resort:${resortName}` });
      const u = new URL(`${API_BASE}/orders/history`);
      if (statusFilter !== "all") u.searchParams.set("status", statusFilter);
      if (methodFilter !== "all") u.searchParams.set("paymentMethod", methodFilter);
      if (from) u.searchParams.set("from", from);
      if (to) u.searchParams.set("to", to);
      const res = await fetch(u.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      addDebug({ step: 'orders:history', ok: res.ok, status: res.status, url: u.toString() });
      const data = await res.json().catch(() => null);
      if (!Array.isArray(data)) addDebug({ step: 'orders:history:parse', ok: false, note: 'non-array response', response: data });
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
            orderId: r.orderId || r.order_id,
          }))
        : [];
      if (list.length > 0) {
        list.sort((a, b) => {
          const ta = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
          const tb = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
          return tb - ta;
        });
      }
      setRows(list);
      // Load rentals (paid only); use absolute API_BASE to avoid misconfigured axios base
      try {
        const token2 = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const paidUrl = new URL(`${API_BASE}/rentals/list`);
        paidUrl.searchParams.set('status', 'paid');
        const resPaid = await fetch(paidUrl.toString(), { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} });
        const paid = await resPaid.json().catch(() => null);
        addDebug({ step: 'rentals:list:paid', ok: resPaid.ok, status: resPaid.status, url: paidUrl.toString(), response: paid });
        if (Array.isArray(paid) && paid.length > 0) {
          setRentals(paid);
        } else {
          const allUrl = new URL(`${API_BASE}/rentals/list`);
          allUrl.searchParams.set('status', 'all');
          const resAll = await fetch(allUrl.toString(), { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} });
          const anyStatus = await resAll.json().catch(() => null);
          addDebug({ step: 'rentals:list:all', ok: resAll.ok, status: resAll.status, url: allUrl.toString(), response: anyStatus });
          setRentals(Array.isArray(anyStatus) ? anyStatus : []);
        }
      } catch (err: any) {
        addDebug({ step: 'rentals:list:error', ok: false, error: err?.message });
        setRentals([]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load history");
      addDebug({ step: 'fatal', ok: false, error: e?.message });
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);


  const unified = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const findHistoryForRental = (rental: RentalRow) => {
      if (!safeRows.length) return undefined;
      const orderId = (rental as any).paymentOrderId as string | undefined;
      if (orderId) {
        const orderMatch = safeRows.find((row) => row.orderId && row.orderId === orderId);
        if (orderMatch) return orderMatch;
      }
      const candidates = safeRows.filter((row) => {
        if (row.resortName && rental.resortName && row.resortName !== rental.resortName) return false;
        if (row.packageName && row.packageName !== rental.packageName) return false;
        if (typeof row.price === 'number' && Number(row.price || 0) !== rental.basePrice) return false;
        return true;
      });
      if (!candidates.length) return undefined;
      const startTs = rental.startedAt;
      const ranked = candidates
        .map((row) => {
          const ts = row.purchasedAt ? Date.parse(row.purchasedAt) : NaN;
          const diff = Number.isFinite(ts) ? Math.abs(ts - startTs) : Number.POSITIVE_INFINITY;
          return { row, diff };
        })
        .sort((a, b) => a.diff - b.diff);
      return ranked[0]?.row;
    };
    const ended = rentals
      .filter((r) => typeof r.endedAt === 'number' && r.endedAt > 0)
      .sort((a, b) => {
        const endA = typeof a.endedAt === 'number' ? a.endedAt : a.startedAt;
        const endB = typeof b.endedAt === 'number' ? b.endedAt : b.startedAt;
        return (endB || 0) - (endA || 0);
      });
    return ended.map((r) => {
      const historyRow = findHistoryForRental(r);
      const start = r.startedAt;
      const end = typeof r.endedAt === 'number' && r.endedAt > 0 ? r.endedAt : start;
      const durSec = Math.max(0, Math.floor((end - start) / 1000));
      const hh = String(Math.floor(durSec / 3600)).padStart(2, '0');
      const mm2 = String(Math.floor((durSec % 3600) / 60)).padStart(2, '0');
      const ss2 = String(durSec % 60).padStart(2, '0');
      return ({
        _type: 'Rental' as const,
        key: `r-${r.id}`,
        guest: r.guestName,
        pkg: r.packageName,
        start,
        end,
        dur: `${hh}:${mm2}:${ss2}`,
        methodOrderId: (r as any).paymentOrderId as string | undefined,
        methodDirect: (r as any).paymentType as string | undefined,
        status: r.status,
        historyId: historyRow?.id,
        raw: r,
      });
    });
  }, [rentals, rows]);

  const filteredUnified = useMemo(() => {
    const text = q.toLowerCase();
    const fromTs = from ? Date.parse(from) : undefined;
    const toTs = to ? Date.parse(to) + 24*60*60*1000 - 1 : undefined; // inclusive day
    return unified.filter((u) => {
      // search across guest, room, package, resort, payment fields
      const hay = [
        u.guest,
        u.pkg,
        (u as any).raw?.roomNumber,
        (u as any).raw?.resortName,
        (u as any).methodDirect,
        (u as any).methodOrderId,
        u.status,
      ]
        .map((v) => (v ?? "").toString().toLowerCase())
        .join(" ");
      if (text && !hay.includes(text)) return false;
      const start = typeof u.start === 'number' ? u.start : (u.start ? Date.parse(String(u.start)) : undefined);
      if (fromTs && (start ?? 0) < fromTs) return false;
      if (toTs && (start ?? 0) > toTs) return false;
      return true;
    });
  }, [unified, q, from, to]);

  const total = filteredUnified.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, methodFilter, from, to]);

  const downloadCSV = () => {
    const header = [
      'Resort','Guest','Room','Package','Start','End','Duration','Status','Payment'
    ];
    const lines = unified.map((u: any) => [
      u.raw?.resortName || '-',
      u.guest || '-',
      u.raw?.roomNumber || '-',
      u.pkg || '-',
      typeof u.start === 'number' || typeof u.start === 'string' ? fmtDate(u.start) : '-',
      typeof u.end === 'number' || typeof u.end === 'string' ? fmtDate(u.end) : '-',
      u.dur || '-',
      u.status || '-',
      (u.methodDirect ? String(u.methodDirect).replace(/_/g,' ').toUpperCase() : (u.methodOrderId ? (methodMap[u.methodOrderId] ? String(methodMap[u.methodOrderId]).replace(/_/g,' ').toUpperCase() : '-') : '-')),
    ]);
    const csv = [header, ...lines].map((a) => a.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      addDebug({ step: 'history:delete:begin', ok: true, payload: deleteTarget });
      try {
        const resRental = await api.delete(`/rentals/${deleteTarget.rentalId}`);
        addDebug({ step: 'history:delete:rental', ok: true, status: resRental?.status });
      } catch (err: any) {
        addDebug({ step: 'history:delete:rental', ok: false, error: err?.message, response: err?.response?.data });
        throw err;
      }
      if (deleteTarget.historyId) {
        try {
          const resHist = await api.delete(`/orders/history/${deleteTarget.historyId}`);
          addDebug({ step: 'history:delete:history', ok: true, status: resHist?.status });
        } catch (err: any) {
          addDebug({ step: 'history:delete:history', ok: false, error: err?.message, response: err?.response?.data });
        }
      }
      setRentals((prev) => prev.filter((x) => x.id !== deleteTarget.rentalId));
      if (deleteTarget.historyId) {
        setRows((prev) => prev.filter((x) => x.id !== deleteTarget.historyId));
      }
      setDeleteTarget(null);
      setNotice('History entry deleted.');
      setPage(1);
      addDebug({ step: 'history:delete:complete', ok: true });
    } catch (err: any) {
      const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message || '';
      setError(detail ? `Failed to delete history entry. ${detail}` : 'Failed to delete history entry.');
      addDebug({ step: 'history:delete:error', ok: false, status: err?.response?.status, error: detail || err?.message, response: err?.response?.data });
    } finally {
      setDeleteBusy(false);
    }
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

  const MethodPill = ({ orderId }: { orderId?: string }) => {
    const label = orderId ? (methodMap[orderId] ? String(methodMap[orderId]).replace(/_/g,' ').toUpperCase() : 'CHECKING...') : '-';
    return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 bg-sky-50 text-sky-700 ring-sky-200`}>{label}</span>;
  };

  const PaymentPill = ({ orderId, direct }: { orderId?: string; direct?: string }) => {
    const fallback = direct ? String(direct).replace(/_/g, ' ').toUpperCase() : undefined;
    const label = fallback || (orderId ? (methodMap[orderId] ? String(methodMap[orderId]).replace(/_/g,' ').toUpperCase() : 'CHECKING...') : '-');
    return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 bg-sky-50 text-sky-700 ring-sky-200`}>{label}</span>;
  };

  const RentalStatusPill = ({ s }: { s: RentalRow['status'] }) => {
    const map: Record<string, string> = {
      active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      unpaid: "bg-rose-50 text-rose-700 ring-rose-200",
      paid: "bg-slate-100 text-slate-700 ring-slate-200",
    };
    const dot = s === 'active' ? 'bg-emerald-500' : s === 'unpaid' ? 'bg-rose-500' : 'bg-slate-500';
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${map[s]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {s[0].toUpperCase()+s.slice(1)}
      </span>
    );
  };

  const openDetail = async (row: HistoryRow) => {
    setDetailRow(row);
    setDetailLoading(true);
    setDetailData(null);
    try {
      if (row.orderId) {
        const res = await api.get(`/payments/status`, { params: { orderId: row.orderId } });
        setDetailData(res.data);
      }
    } catch {}
    setDetailLoading(false);
  };

  // Load Midtrans payment type map lazily for current rows
  useEffect(() => {
    const run = async () => {
      const ids = rows.map((r) => r.orderId).filter((x): x is string => Boolean(x));
      const unique = Array.from(new Set(ids)).filter((id) => !methodMap[id]);
      for (const id of unique.slice(0, 20)) {
        try {
          const res = await api.get(`/payments/status`, { params: { orderId: id } });
          const t = res?.data?.payment_type || res?.data?.channel || '';
          if (t) setMethodMap((prev) => ({ ...prev, [id]: String(t) }));
        } catch {}
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 3.5M12 3a9 9 0 1 0 9 9"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payment History</h1>
              <p className="text-sm text-slate-600">Completed rental payments with full details.</p>
            </div>
          </div>
          <button suppressHydrationWarning onClick={downloadCSV} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Export CSV</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <input suppressHydrationWarning
            type="search"
            placeholder="Search guest/email, room, package"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
          {/* Method filter removed in favor of Midtrans types shown per row */}
          <div className="grid grid-cols-2 gap-3">
            <input suppressHydrationWarning type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
            <input suppressHydrationWarning type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button suppressHydrationWarning onClick={load} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Apply</button>
          {(q || from || to || statusFilter !== "all" || methodFilter !== "all") && (
            <button suppressHydrationWarning onClick={() => { setQ(""); setFrom(""); setTo(""); setStatusFilter("all"); setMethodFilter("all"); load(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50">Reset</button>
          )}
          {/* <button suppressHydrationWarning onClick={() => setDebugOpen((x) => !x)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">{debugOpen ? 'Hide Debug' : 'Show Debug'}</button> */}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Resort</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">End</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                {isSuperAdmin && <th className="px-4 py-3 font-medium">Operation</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
              ) : filteredUnified.length === 0 ? (
                <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-slate-500">No data.</td></tr>
              ) : (
                filteredUnified.slice(start, end).map((u: any) => (
                  <tr key={u.key} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-800">{u.raw?.resortName || '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{u.guest}</td>
                    <td className="px-4 py-3 text-slate-800">{u.raw?.roomNumber || '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{u.pkg}</td>
                    <td className="px-4 py-3 text-slate-700"><span suppressHydrationWarning>{fmtDate(u.start)}</span></td>
                    <td className="px-4 py-3 text-slate-700"><span suppressHydrationWarning>{fmtDate(u.end)}</span></td>
                    <td className="px-4 py-3"><RentalStatusPill s={u.status as any} /></td>
                    <td className="px-4 py-3"><PaymentPill orderId={u.methodOrderId} direct={u.methodDirect} /></td>
                    <td className="px-4 py-3"><button onClick={() => openDetail(u.raw)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50">Details</button></td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={deleteBusy}
                          onClick={() => {
                            if (!u?.raw?.id) return;
                            setNotice(null);
                            setError(null);
                            setDeleteTarget({
                              rentalId: u.raw.id,
                              historyId: u.historyId,
                              label: `${u.guest || 'Guest'} - ${fmtDate(u.end || u.start)}`
                            });
                          }}
                          aria-label="Delete history"
                          title="Delete history"
                          className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m1 0v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7m3 4v6m4-6v6"/></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {debugOpen && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-semibold text-slate-800">Debug</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{JSON.stringify(debug, null, 2)}</pre>
            {rentals.length === 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
                No rentals returned. Ensure you: 1) are logged in as the correct resort, 2) completed Start → End → Pay, 3) ran DB migrations.
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  try {
                    const token2 = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                    const res = await fetch(`${API_BASE}/rentals/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(token2 ? { Authorization: `Bearer ${token2}` } : {}) },
                      body: JSON.stringify({
                        pkg: '1h', packageName: '1 Hour', price: 50000, duration: 'hour',
                        guestName: `Debug Guest ${Date.now() % 10000}`, roomNumber: String(Math.floor(Math.random()*900)+100)
                      }),
                    });
                    const data = await res.json().catch(() => null);
                    addDebug({ step: 'dev:start', ok: res.ok, status: res.status, response: data });
                    await load();
                  } catch (e: any) {
                    addDebug({ step: 'dev:start:error', ok: false, error: e?.message });
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >Start sample rental</button>
              <button
                onClick={async () => {
                  try {
                    // fetch all and end latest active
                    const token2 = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                    const listRes = await fetch(`${API_BASE}/rentals/list?status=all`, { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} });
                    const list = await listRes.json().catch(() => []);
                    const active = (Array.isArray(list) ? list : []).filter((x: any) => x.status === 'active').sort((a: any,b: any) => (b.startedAt||0)-(a.startedAt||0));
                    const target = active[0];
                    if (!target) { addDebug({ step: 'dev:end', ok: false, note: 'no active rental' }); return; }
                    const res = await fetch(`${API_BASE}/rentals/end`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token2 ? { Authorization: `Bearer ${token2}` } : {}) },
                      body: JSON.stringify({ rentalId: target.id })
                    });
                    const data = await res.json().catch(() => null);
                    addDebug({ step: 'dev:end', ok: res.ok, status: res.status, response: data });
                    await load();
                  } catch (e: any) {
                    addDebug({ step: 'dev:end:error', ok: false, error: e?.message });
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >End latest active</button>
              <button
                onClick={async () => {
                  try {
                    const token2 = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                    const listRes = await fetch(`${API_BASE}/rentals/list?status=all`, { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} });
                    const list = await listRes.json().catch(() => []);
                    const unpaid = (Array.isArray(list) ? list : []).filter((x: any) => x.status === 'unpaid').sort((a: any,b: any) => (b.endedAt||0)-(a.endedAt||0));
                    const target = unpaid[0];
                    if (!target) { addDebug({ step: 'dev:settle', ok: false, note: 'no unpaid rental' }); return; }
                    const orderId = `RENTAL-${target.id}-${Date.now()}`;
                    const res = await fetch(`${API_BASE}/rentals/settle`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token2 ? { Authorization: `Bearer ${token2}` } : {}) },
                      body: JSON.stringify({ rentalId: target.id, orderId, paymentType: 'credit_card' })
                    });
                    const data = await res.json().catch(() => null);
                    addDebug({ step: 'dev:settle', ok: res.ok, status: res.status, response: data });
                    await load();
                  } catch (e: any) {
                    addDebug({ step: 'dev:settle:error', ok: false, error: e?.message });
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >Settle latest unpaid</button>
            </div>
          </div>
        )}
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
        {notice && <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{notice}</div>}
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleteBusy) setDeleteTarget(null); }}
          />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M4.93 19.07a10 10 0 1 1 14.14 0 10 10 0 0 1-14.14 0Z"/></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Delete History?</h3>
            </div>
            <p className="text-sm text-slate-600">This will remove the selected rental record{deleteTarget?.historyId ? ' and its payment history entry' : ''}. This action cannot be undone.</p>
            <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
              <div className="font-medium text-slate-900">{deleteTarget.label}</div>
              <div className="text-xs text-slate-500">
                Rental ID: {deleteTarget.rentalId}
                {deleteTarget.historyId && (<span> - History ID: {deleteTarget.historyId}</span>)}
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleConfirmDelete}
                disabled={deleteBusy}
                className="h-11 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                onClick={() => { if (!deleteBusy) setDeleteTarget(null); }}
                disabled={deleteBusy}
                className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rental detail modal */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setDetailRow(null); setDetailData(null); }} />
          <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9"/></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Rental Details</h3>
            </div>
            {(() => {
              const r: any = detailRow;
              const isRental = typeof r?.startedAt === 'number';
              if (!isRental) {
                return (
                  <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">No rental data.</div>
                );
              }
              const start = r.startedAt; const end = r.endedAt || start;
              const durMin = Math.max(0, Math.ceil((end - start)/60000));
              const durSec = Math.max(0, Math.floor((end - start)/1000));
              const hh = String(Math.floor(durSec/3600)).padStart(2,'0');
              const mm = String(Math.floor((durSec%3600)/60)).padStart(2,'0');
              const ss = String(durSec%60).padStart(2,'0');
              const extraMin = Math.max(0, durMin - (r.baseMinutes || 0));
              const blocks = Math.max(0, Math.ceil(extraMin/30));
              const extrasCost = blocks * 30000;
              const total = r.amountDue ?? (r.basePrice + extrasCost);
              const method = (r.paymentType || '').toString().replace(/_/g,' ').toUpperCase() || '-';
              const orderId = r.paymentOrderId || '-';
              return (
                <div className="space-y-3 text-sm">
                  <div className="grid gap-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between"><span className="text-slate-600">Guest</span><span className="font-medium text-slate-900">{r.guestName}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-600">Room</span><span className="font-medium text-slate-900">{r.roomNumber}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-600">Package</span><span className="font-medium text-slate-900">{r.packageName}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-600">Start time</span><span className="font-medium text-slate-900">{fmtDate(start)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-600">End time</span><span className="font-medium text-slate-900">{fmtDate(end)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-600">Rental duration</span><span className="font-medium text-slate-900">{hh}:{mm}:{ss}</span></div>
                  </div>
                  <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-sm font-semibold text-slate-800">Payment</div>
                    <div className="mt-2 grid gap-1">
                      <div className="flex items-center justify-between"><span className="text-slate-600">Payment type</span><span className="font-medium text-slate-900">{method}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Order ID</span><span className="font-mono text-slate-900">{orderId}</span></div>
                      <div className="my-2 h-px bg-slate-200" />
                      <div className="flex items-center justify-between"><span className="text-slate-600">Base</span><span className="font-medium text-slate-900">{fmtIDR(r.basePrice)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Extra time</span><span className="font-medium text-slate-900">{extraMin} min ({blocks} x 60 min)</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Extra cost</span><span className="font-medium text-slate-900">{fmtIDR(extrasCost)}</span></div>
                      <div className="my-2 h-px bg-slate-200" />
                      <div className="flex items-center justify-between text-base"><span className="font-semibold text-slate-900">Total</span><span className="font-semibold text-slate-900">{fmtIDR(total)}</span></div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => { setDetailRow(null); setDetailData(null); }} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Close</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}






