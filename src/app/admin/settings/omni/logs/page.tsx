"use client";

import { useEffect, useMemo, useState } from "react";

type LogRow = {
  id?: string;
  imei?: string;
  instructionId?: string;
  instructionName?: string;
  command?: string;
  equipmentId?: string;
  equipmentName?: string;
  createTime?: number | string;
};

export default function OmniLogsPage() {
  const [equipmentId, setEquipmentId] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // default last 1 hour
    const end = new Date();
    const start = new Date(Date.now() - 60*60*1000);
    setFrom(start.toISOString().slice(0,16));
    setTo(end.toISOString().slice(0,16));
    try {
      const url = new URL(window.location.href);
      const eq = url.searchParams.get('equipmentId');
      if (eq) setEquipmentId(eq);
    } catch {}
  }, []);

  const rows: LogRow[] = useMemo(() => {
    const r = data?.response ?? data?.body ?? data;
    if (Array.isArray(r?.rows)) return r.rows;
    return [];
  }, [data]);

  const total: number = useMemo(() => {
    const r = data?.response ?? data?.body ?? data;
    return Number(r?.total || 0);
  }, [data]);

  const fmtTs = (v: any) => {
    if (!v) return '-';
    const n = typeof v === 'number' ? (v > 1e12 ? v : v*1000) : Date.parse(String(v));
    if (!isFinite(n)) return String(v);
    return new Date(n).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
  };

  const toEpoch = (s: string) => {
    if (!s) return undefined;
    const n = Date.parse(s);
    return Math.floor(n/1000);
  };

  const run = async () => {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch('/api/omni/logs', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ equipmentId: equipmentId.trim(), startTime: toEpoch(from), endTime: toEpoch(to), pageNum, pageSize })
      });
      const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch { json = { ok:false, error:'Invalid JSON from proxy', raw: text }; }
      setData(json);
    } catch (e:any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15M4.5 12h15m-15 5.25h15"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI • Query Log List</h1>
              <p className="text-sm text-slate-600">Menampilkan riwayat perintah dari perangkat.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={run} disabled={loading} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">{loading ? 'Loading...' : 'Fetch Logs'}</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <input value={equipmentId} onChange={(e)=>setEquipmentId(e.target.value)} placeholder="equipmentId" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
          <input type="datetime-local" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
          <input type="datetime-local" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min={1} max={200} value={pageSize} onChange={(e)=>setPageSize(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
            <input type="number" min={1} value={pageNum} onChange={(e)=>setPageNum(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Create Time</th>
                <th className="px-3 py-2 font-medium">Instruction</th>
                <th className="px-3 py-2 font-medium">IMEI</th>
                <th className="px-3 py-2 font-medium">Command</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No logs</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id || i} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 text-slate-800">{i+1 + (pageNum-1)*pageSize}</td>
                  <td className="px-3 py-2 text-slate-800">{fmtTs(r.createTime)}</td>
                  <td className="px-3 py-2 text-slate-800">{r.instructionName ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800 font-mono">{r.imei ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800 break-all">{r.command ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800 ring-1 ring-slate-200">Total: {total}</div>
            <div>
              <div className="text-xs font-medium text-slate-600">Debug</div>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        )}
        {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </section>
    </div>
  );
}
