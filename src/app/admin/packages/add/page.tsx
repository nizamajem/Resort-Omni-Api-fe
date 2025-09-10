"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/app/components/ui/label";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type PkgId = "1h" | "3h" | "1d";
type PackageAccount = { id: string; pkg: PkgId; email: string; password: string; status: "active" | "sold"; createdAt?: string };

const API_BASE = (() => {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
  return "http://localhost:4000/api";
})();

export default function AdminPackagesAddPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    try { setToken(localStorage.getItem("token")); } catch {}
  }, []);

  // Add form state
  const [pkg, setPkg] = useState<PkgId>("1h");
  const [lines, setLines] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  // Accounts list state
  const [filterPkg, setFilterPkg] = useState<"all" | PkgId>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "sold">("active");
  const [rows, setRows] = useState<PackageAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 5;

  const pkgLabel = (id: PkgId) => (id === "1h" ? "1 Hour" : id === "3h" ? "3 Hours" : "1 Day");

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/package-accounts`);
      if (filterStatus !== "all") url.searchParams.set("status", filterStatus);
      if (filterPkg !== "all") url.searchParams.set("pkg", filterPkg);
      url.searchParams.set("offset", String((page - 1) * limit));
      url.searchParams.set("limit", String(limit));
      const res = await fetch(url.toString(), {
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const tot = typeof data?.total === 'number' ? data.total : list.length;
      setRows(list as PackageAccount[]);
      setTotal(tot);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPkg, filterStatus, token, page]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterPkg, filterStatus]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddMsg(null);
    const items = lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [email, password] = l.split(/,|\s+/).map((x) => x.trim());
        return { email, password };
      })
      .filter((x) => x.email && x.password);
    if (items.length === 0) {
      setAddMsg("Please provide at least one line: email,password");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/package-accounts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ pkg, items }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setAddMsg(data?.error || "Failed to add accounts");
      } else {
        setAddMsg(`Inserted ${data?.inserted || items.length} account(s)`);
        setLines("");
        setPage(1);
        fetchAccounts();
      }
    } catch {
      setAddMsg("Failed to add accounts");
    } finally {
      setAdding(false);
    }
  };

  const onToggleStatus = async (row: PackageAccount) => {
    const next = row.status === "active" ? "sold" : "active";
    try {
      const res = await fetch(`${API_BASE}/package-accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: row.id, status: next }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed");
      // Refresh to keep pagination/total accurate
      fetchAccounts();
    } catch {
      // noop error UI for now
    }
  };

  const startEdit = (row: PackageAccount) => {
    setEditingId(row.id);
    setEditEmail(row.email);
    setEditPassword(row.password);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditEmail("");
    setEditPassword("");
  };

  const saveEdit = async (row: PackageAccount) => {
    try {
      const res = await fetch(`${API_BASE}/package-accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: row.id, email: editEmail, password: editPassword }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed");
      // Refresh to reflect changes
      fetchAccounts();
      cancelEdit();
    } catch {
      // noop error UI for now
    }
  };

  const fmtDate = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }), []);

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Add Package Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">Add credentials for the three fixed packages below. Each line is one account: email,password</p>

        <form onSubmit={onAdd} className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="pkg" requiredMark>Package</Label>
            <Select id="pkg" value={pkg} onChange={(e) => setPkg(e.target.value as PkgId)}>
              <option value="1h">1 Hour (IDR 50,000)</option>
              <option value="3h">3 Hours (IDR 100,000)</option>
              <option value="1d">1 Day (IDR 200,000)</option>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="lines" requiredMark className="text-slate-900">Accounts (one per line)</Label>
            <textarea
              id="lines"
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              placeholder={"email1@example.com,password1\nemail2@example.com,password2"}
              className="h-32 w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 placeholder:text-slate-400"
            />
            <div className="mt-1 text-xs text-slate-700">Format: email,password (comma or whitespace separated)</div>
          </div>

          <div className="sm:col-span-3 flex items-center gap-2">
            <Button type="submit" loading={adding}>Add Accounts</Button>
            {addMsg && <div className="text-sm text-slate-600">{addMsg}</div>}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Accounts</h2>
            <p className="text-xs text-slate-700">Manage credentials used to fulfill orders.</p>
          </div>
          <div className="flex gap-2">
            <div className="min-w-[160px]">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="sold">Disabled</option>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Select value={filterPkg} onChange={(e) => setFilterPkg(e.target.value as any)}>
                <option value="all">All Packages</option>
                <option value="1h">1 Hour</option>
                <option value="3h">3 Hours</option>
                <option value="1d">1 Day</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 align-top">
                    {editingId === r.id ? (
                      <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="text-slate-900" />
                    ) : (
                      <span className="font-mono text-slate-900">{r.email}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-900 align-top">{pkgLabel(r.pkg)}</td>
                  <td className="px-3 py-2 text-slate-800 align-top">{r.createdAt ? fmtDate.format(new Date(r.createdAt)) : "-"}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-50 text-slate-700 ring-slate-300'}`}>
                      {r.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editingId === r.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="New password" />
                        <div className="flex gap-2">
                          <Button onClick={() => saveEdit(r)} className="px-3 py-1">Save</Button>
                          <Button variant="secondary" onClick={cancelEdit} className="px-3 py-1">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant={r.status === "active" ? "danger" : "secondary"} onClick={() => onToggleStatus(r)} className="px-3 py-1">
                          {r.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button variant="secondary" onClick={() => startEdit(r)} className="px-3 py-1">Edit</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No accounts</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading...</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-slate-700">
            <div>
              {total > 0 ? (
                <span>
                  Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
                </span>
              ) : (
                <span>Showing 0–0 of 0</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1"
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                disabled={page * limit >= total}
                onClick={() => setPage((p) => (p * limit >= total ? p : p + 1))}
                className="px-3 py-1"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
