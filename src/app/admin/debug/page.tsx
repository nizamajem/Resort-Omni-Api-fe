"use client";

import { useEffect, useMemo, useState } from "react";

type Log = {
  ts: string;
  dir: 'request' | 'response';
  url?: string;
  method?: string;
  status?: number;
  ok?: boolean;
  body?: any;
  error?: any;
};

declare global { interface Window { __apiLogs?: Log[] } }

export default function AdminDebugPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    try { setLogs([...(window.__apiLogs || [])]); } catch {}
    const id = setInterval(() => { try { setLogs([...(window.__apiLogs || [])]); } catch {} }, 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return logs.slice().reverse();
    const q = filter.toLowerCase();
    return logs.filter(l => JSON.stringify(l).toLowerCase().includes(q)).reverse();
  }, [logs, filter]);

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(logs, null, 2)); alert('Copied logs to clipboard'); } catch {}
  };
  const clearAll = () => { try { window.__apiLogs = []; setLogs([]); } catch {} };

  return (
    <main className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Debug: API Logs</h1>
          <p className="text-sm text-slate-600">Semua request/response dari frontend (axios) terekam di sini. Gunakan tombol Copy untuk kirim ke saya.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter (url/text)" className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
          <button onClick={copyAll} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white">Copy JSON</button>
          <button onClick={clearAll} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">Clear</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="max-h-[70vh] overflow-auto text-xs">
          {filtered.length === 0 ? (
            <div className="p-3 text-slate-500">Belum ada log.</div>
          ) : (
            <table className="min-w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1">Time</th>
                  <th className="px-2 py-1">Dir</th>
                  <th className="px-2 py-1">Method</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">URL</th>
                  <th className="px-2 py-1">Body/Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50 align-top">
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(l.ts).toLocaleString('id-ID', { dateStyle:'short', timeStyle:'medium' })}</td>
                    <td className="px-2 py-1">{l.dir}</td>
                    <td className="px-2 py-1">{(l.method || '').toUpperCase()}</td>
                    <td className="px-2 py-1">{l.status ?? ''}</td>
                    <td className="px-2 py-1 break-all max-w-[26rem]">{l.url}</td>
                    <td className="px-2 py-1 break-all max-w-[30rem]">
                      <pre className="whitespace-pre-wrap">{l.error ? String(l.error) : (l.body != null ? JSON.stringify(l.body) : '')}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

