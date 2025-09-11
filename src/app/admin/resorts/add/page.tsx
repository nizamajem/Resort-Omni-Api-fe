"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/lib/api";

type Resort = {
  id: string;
  resortName: string;
  email: string;
  status: "active" | "disabled";
  createdAt?: string;
};

export default function AdminResortsAddPage() {
  // Form state
  const [resortName, setResortName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // List state
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Resort[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [editRow, setEditRow] = useState<Resort | null>(null);
  const [editPw, setEditPw] = useState("");
  const [editPw2, setEditPw2] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'toggle' | 'delete'; row: Resort } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  const genPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPassword(out);
  };

  const loadResorts = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const u = new URL(`${API_BASE}/resorts`);
      if (q) u.searchParams.set("q", q);
      if (statusFilter !== "all") u.searchParams.set("status", statusFilter);
      const res = await fetch(u.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      const items: Resort[] = (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []).map((r: any) => ({
        id: r.id,
        resortName: r.resortName,
        email: r.email,
        status: r.status,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
      }));
      setRows(items);
    } catch {
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadResorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  // Reset pagination when filters or search change
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const { data } = await api.post("/resorts", { resortName, email, password });
      if (!res.ok || data?.error) {
        setError(data?.error || data?.message || "Failed to create resort");
        setSubmitting(false);
        return;
      }
      setSuccess(`Created ${data.resortName || resortName}`);
      setResortName("");
      setEmail("");
      setPassword("");
      await loadResorts();
    } catch (err: any) {
      setError(err?.message || "Request failed");
    }
    setSubmitting(false);
  };

  const toggleStatus = async (row: Resort) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const { data } = await api.post("/resorts", { resortName, email, password });
      if (res.ok && !data?.error) loadResorts();
    } catch {}
  };

  const removeRow = async (row: Resort) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const u = new URL(`${API_BASE}/resorts`);
      u.searchParams.set("id", row.id);
      const res = await fetch(u.toString(), { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (res.ok && !data?.error) loadResorts();
    } catch {}
  };

  const onEditOpen = (row: Resort) => {
    setEditRow({ ...row });
    setEditPw("");
    setEditPw2("");
    setEditSaving(false);
    setEditError(null);
  };
  const onEditSave = async () => {
    if (!editRow) return;
    try {
      setEditSaving(true);
      setEditError(null);
      const emailValid = /.+@.+\..+/.test(editRow.email);
      if (!editRow.resortName.trim() || !emailValid) {
        setEditError(!editRow.resortName.trim() ? 'Resort name is required' : 'Invalid email');
        setEditSaving(false);
        return;
      }
      if ((editPw || editPw2) && editPw !== editPw2) {
        setEditError('Passwords do not match');
        setEditSaving(false);
        return;
      }
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const patch: any = { id: editRow.id, resortName: editRow.resortName, email: editRow.email };
      if (editPw) patch.password = editPw;
      const { data } = await api.post("/resorts", { resortName, email, password });
      if (res.ok && !data?.error) {
        setEditRow(null);
        setEditPw("");
        setEditPw2("");
        loadResorts();
      } else {
        const msg = Array.isArray(data?.message)
          ? data.message.join(', ')
          : (typeof data?.message === 'string' ? data.message : (data?.error || 'Bad Request'));
        setEditError(msg);
      }
    } catch (e: any) {
      setEditError(e?.message || "Request failed");
    } finally {
      setEditSaving(false);
    }
  };

  const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-tr from-sky-50 to-emerald-50 p-[1px] shadow-sm">
        <div className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0A17.933 17.933 0 0 1 12 21.75c-2.68 0-5.216-.586-7.5-1.632Z"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Add Resort Account</h1>
              <p className="text-sm text-slate-600">Create and manage partner resort logins.</p>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-700">Resort Name</label>
            <input
              type="text"
              required
              value={resortName}
              onChange={(e) => setResortName(e.target.value)}
              placeholder="Sunset Bay Villas"
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700">Login Email</label>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="resort@partner.id"
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700">Password</label>
            <div className="mt-2 flex gap-2">
              <input
                type={showPw ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50">
                {showPw ? "Hide" : "Show"}
              </button>
              <button type="button" onClick={genPassword} className="rounded-xl bg-slate-800 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-900">
                Generate
              </button>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

        <div className="mt-5">
          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-xl bg-sky-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Add Resort"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Resort Accounts</h2>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Search account"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadResorts(); }}
              className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); setTimeout(loadResorts, 0); }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <button
              onClick={loadResorts}
              disabled={loading}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Resort</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page-1)*pageSize, (page-1)*pageSize + pageSize).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{r.resortName}</td>
                  <td className="px-4 py-3 text-slate-700">{r.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                      {r.status === 'active' ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setConfirmAction({ type: 'toggle', row: r })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50">
                        {r.status === 'active' ? 'Disable' : 'Activate'}
                      </button>
                      <button onClick={() => onEditOpen(r)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100">
                        Edit
                      </button>
                      <button onClick={() => setConfirmAction({ type: 'delete', row: r })} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">{loading ? 'Loading...' : 'No data.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-600">Showing <span className="font-medium">{rows.length === 0 ? 0 : (page-1)*pageSize + 1}</span>–<span className="font-medium">{Math.min(rows.length, (page-1)*pageSize + pageSize)}</span> of <span className="font-medium">{rows.length}</span></div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            <div className="text-xs text-slate-600">Page {page} / {Math.max(1, Math.ceil(rows.length / pageSize))}</div>
            <button
              onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(rows.length / pageSize)), p + 1))}
              disabled={page >= Math.max(1, Math.ceil(rows.length / pageSize))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditRow(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Edit Resort</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm text-slate-700">Resort Name</label>
                <input value={editRow.resortName} onChange={(e) => setEditRow((prev) => (prev ? { ...prev, resortName: e.target.value } : prev))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <label className="block text-sm text-slate-700">Email</label>
                <input value={editRow.email} onChange={(e) => setEditRow((prev) => (prev ? { ...prev, email: e.target.value } : prev))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <label className="block text-sm text-slate-700">New Password (optional)</label>
                <input type="password" value={editPw} onChange={(e) => setEditPw(e.target.value)} placeholder="Leave blank to keep current" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div>
                <label className="block text-sm text-slate-700">Confirm New Password</label>
                <input type="password" value={editPw2} onChange={(e) => setEditPw2(e.target.value)} placeholder="Re-enter new password" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>
            {editError && <p className="mt-3 text-sm text-rose-600">{editError}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={onEditSave} disabled={editSaving} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60">{editSaving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditRow(null)} disabled={editSaving} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">{confirmAction.type === 'delete' ? 'Delete Resort?' : 'Change Status?'}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction.type === 'delete'
                ? `This action will remove ${confirmAction.row.resortName} (${confirmAction.row.email}) from the system.`
                : `This will set ${confirmAction.row.resortName} (${confirmAction.row.email}) to ${confirmAction.row.status === 'active' ? 'Disabled' : 'Active'}.`}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={async () => {
                  const row = confirmAction.row;
                  setConfirmAction(null);
                  if (confirmAction.type === 'delete') await removeRow(row);
                  else await toggleStatus(row);
                }}
                className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
              >
                Yes, continue
              </button>
              <button onClick={() => setConfirmAction(null)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

