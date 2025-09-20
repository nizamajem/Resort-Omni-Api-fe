"use client";

import { useEffect, useMemo, useState } from "react";

type Cb = {
  serverUrl?: string;
  parameter?: any;
  time?: string | number;
  status?: string | number;
};

export default function OmniCallbacksPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [path, setPath] = useState('/prod-api/iot/api/v1/callback/list');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<'pull'|'received'>('pull');
  const [received, setReceived] = useState<any | null>(null);

  const list: Cb[] = useMemo(() => {
    const body = data?.body ?? data;
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.records)) return body.records;
    return [];
  }, [data]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const u = new URL('/api/omni/callbacks', window.location.origin);
      if (path) u.searchParams.set('path', path);
      if (from) u.searchParams.set('from', from);
      if (to) u.searchParams.set('to', to);
      const res = await fetch(u.toString());
      const txt = await res.text();
      let json: any = null; try { json = JSON.parse(txt); } catch { json = { ok:false, error:'Invalid JSON from proxy', raw: txt }; }
      setData(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const fetchReceived = async () => {
      try { const r = await fetch('/api/omni/webhook'); const j = await r.json(); setReceived(j); } catch {}
    };
    fetchReceived();
  }, []);

  const fmtTs = (v: any) => {
    if (!v) return '-';
    const n = typeof v === 'number' ? (v > 1e12 ? v : v*1000) : Date.parse(String(v));
    if (!isFinite(n)) return String(v);
    return new Date(n).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
  };

  const tryString = (p: any) => {
    if (!p) return '-';
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch { return String(p); }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15M4.5 12h15m-15 5.25h15"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI Callback History</h1>
              <p className="text-sm text-slate-600">Melihat log callback dari OMNI API (via proxy).</p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <button onClick={()=>setTab('pull')} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${tab==='pull' ? 'bg-sky-100 text-sky-800 ring-sky-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>Pull from Platform</button>
          <button onClick={()=>setTab('received')} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${tab==='received' ? 'bg-sky-100 text-sky-800 ring-sky-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>Received Webhooks</button>
        </div>

        {tab==='pull' && (
        <>
        <div className="grid gap-3 sm:grid-cols-3">
          <input value={path} onChange={(e)=>setPath(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" placeholder="/prod-api/iot/api/v1/callback/list" />
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200" />
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Server URL</th>
                <th className="px-3 py-2 font-medium">Parameter</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No records</td></tr>
              ) : list.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 text-slate-800">{i+1}</td>
                  <td className="px-3 py-2 text-slate-800 break-all">{(r as any)?.serverUrl || (r as any)?.server || '-'}</td>
                  <td className="px-3 py-2 text-slate-800">
                    <span title={tryString((r as any)?.parameter)} className="line-clamp-1 max-w-[28rem] inline-block align-middle">{tryString((r as any)?.parameter)}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{fmtTs((r as any)?.time)}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      const s = String((r as any)?.status ?? (r as any)?.callbackStatus ?? '-').toLowerCase();
                      const ok = ['ok','success','true','1'].includes(s);
                      const cls = ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200';
                      return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${cls}`}>{s || '-'}</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && tab==='pull' && !Array.isArray(data?.body) && !Array.isArray(data?.body?.data) && !Array.isArray(data?.body?.records) && (
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-600">Raw Result</div>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(data, null, 2)}</pre>
          </div>
        )}

        </>
        )}
        {tab==='received' && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium text-slate-700">Latest received (local webhook)</div>
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Body</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(received?.data) && received.data.length > 0 ? received.data.map((e:any, i:number) => (
                    <tr key={i} className="odd:bg-white even:bg-slate-50">
                      <td className="px-3 py-2">{i+1}</td>
                      <td className="px-3 py-2">{e.at}</td>
                      <td className="px-3 py-2"><pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">{typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2)}</pre></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No local callbacks received</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-slate-500">Webhook: /api/omni/webhook (set di OMNI Developer → Callback)</div>
          </div>
        )}
      </section>
    </div>
  );
}

