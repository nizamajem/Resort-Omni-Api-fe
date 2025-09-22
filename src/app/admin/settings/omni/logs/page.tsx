"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/lib/api";

type OmniLog = {
  ts: number;
  path: string;
  method?: string;
  ip?: string;
  src?: 'mw' | 'controller';
  query: any;
  headers: Record<string, any>;
  body: any;
};

export default function OmniLogsPage() {
  const [logs, setLogs] = useState<OmniLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [q, setQ] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [diag, setDiag] = useState<{ source: 'proxy' | 'direct' | null; proxy?: any; direct?: any; ping?: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 2;
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const base = useMemo(() => (api.defaults.baseURL || "").replace(/\/$/, ""), []);
  const logsUrl = `${base}/iot/omni/logs`;
  const cbUrl = `${base}/iot/omni/callback`;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try proxy first
      const res = await fetch('/api/omni/logs', { cache: 'no-store' });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch {}
      // Record diagnostics
      const nextDiag: any = { source: 'proxy', proxy: { status: res.status, body: (text || '').slice(0, 1000) } };
      // If proxy good
      if (data && Array.isArray(data.logs)) {
        setLogs(data.logs as OmniLog[]);
        setDiag((prev) => ({ ...(prev || {}), ...nextDiag }));
      } else {
        // Fallback: direct to backend via axios baseURL
        try {
          const direct = await api.get('/iot/omni/logs');
          const list = Array.isArray(direct.data?.logs) ? direct.data.logs : [];
          setLogs(list as OmniLog[]);
          setDiag((prev) => ({ ...(prev || {}), ...nextDiag, direct: { status: direct.status, body: JSON.stringify(direct.data).slice(0, 1000) } }));
        } catch (e: any) {
          setLogs([]);
          setError(e?.message || data?.error || 'Failed to load logs');
          setDiag((prev) => ({ ...(prev || {}), ...nextDiag, direct: { error: e?.message } }));
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load logs");
      setLogs([]);
    }
    setLoading(false);
  };

  const clear = async () => {
    try {
      await api.delete("/iot/omni/logs");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to clear logs");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [auto]);

  // Tick every 1s to refresh running timers for OPEN devices
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    // hanya tampilkan yang sumbernya controller
    const base = logs.filter((l) => l.src === 'controller');
    if (!text) return base;
    return base.filter((l) => JSON.stringify(l).toLowerCase().includes(text));
  }, [logs, q]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.min(total, (page - 1) * pageSize);
  const end = Math.min(total, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, logs]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
      alert("Logs copied to clipboard");
    } catch {}
  };

  // const checkPing = async () => {
  //   try {
  //     const res = await fetch('/api/omni/ping', { cache: 'no-store' });
  //     const t = await res.text();
  //     setDiag((prev) => ({ ...(prev || {}), ping: t }));
  //     return t;
  //   } catch {
  //     setDiag((prev) => ({ ...(prev || {}), ping: '0' }));
  //     return '0';
  //   }
  // };

    function parseOmni(l: OmniLog) {
    const b: any = l.body || {};
    const info: any = {};
    if (typeof b?.instruction === 'string' && b.instruction) info.instruction = String(b.instruction).toUpperCase();
    let j: any = undefined;
    if (typeof b?.json === 'string') { try { j = JSON.parse(b.json); } catch {} }
    else if (b?.json && typeof b.json === 'object') j = b.json;
    info.json = j || {};
    const dataStr: string | undefined = typeof b?.data === 'string' ? b.data : undefined;
    if (dataStr) {
      const csv = dataStr.replace(/^\*/, '').replace(/#$/, '').split(',');
      info.tokens = csv;
      const imei = csv.find((t) => /^\d{11,17}$/.test(t));
      if (imei) info.imei = imei;
      if (!info.instruction) {
        const maybe = csv.find((t) => /^([A-Z]\d+|[A-Z]{1,3})$/.test(t));
        if (maybe) info.instruction = String(maybe).toUpperCase();
      }
      if (info.instruction === 'L0' || info.instruction === 'LO') {
        const idx = csv.findIndex((t) => t && (/^L0$|^LO$/i).test(String(t)));
        if (idx >= 0) {
          if (csv[idx + 1] !== undefined) {
            const st = Number(csv[idx + 1]);
            if (!Number.isNaN(st)) (info as any).l0Status = st;
          }
          if (csv[idx + 2] !== undefined && !info.userId) info.userId = csv[idx + 2];
        }
      }
    }
    const jv = info.json || {};
    if (jv.currentElectricQuantity != null) info.battery = jv.currentElectricQuantity;
    if (jv.currentSpeed != null) info.speed = jv.currentSpeed;
    if (jv.chargingState != null) info.charging = jv.chargingState;
    if (jv.faultInformation != null) info.fault = jv.faultInformation;
    if (jv.estimatedRemainingCyclingMiles != null) info.remain = jv.estimatedRemainingCyclingMiles;
    if (jv.mileagePerRide != null) info.mileagePerRide = jv.mileagePerRide; else if (jv.mileAgePerRide != null) info.mileagePerRide = jv.mileAgePerRide;
    if (jv.horseshoeLockLockStatus != null) {
      const v = jv.horseshoeLockLockStatus;
      let norm: number | undefined;
      if (typeof v === 'number') norm = v === 0 ? 0 : v === 1 ? 1 : undefined; else if (typeof v === 'string') norm = v.trim() === '0' ? 0 : v.trim() === '1' ? 1 : undefined;
      if (norm !== undefined) info.horseshoe = norm;
    }
    if (jv.lockingInstruction != null) {
      const v = jv.lockingInstruction;
      let norm: number | undefined;
      if (typeof v === 'number') norm = v === 0 ? 0 : v === 1 ? 1 : undefined; else if (typeof v === 'string') norm = v.trim() === '0' ? 0 : v.trim() === '1' ? 1 : undefined;
      if (norm !== undefined) info.lockInstr = norm;
    }
    if (!info.userId && jv.userId) info.userId = jv.userId;
    return info;
  }// Map instruction to status
  const mapInstr = (instr?: string, lockInstr?: number, horseshoe?: number, l0Status?: number): 'OPEN' | 'CLOSED' | undefined => {
    // Highest priority: explicit numeric lock indicators in payload JSON
    if (lockInstr === 0) return 'OPEN';
    if (lockInstr === 1) return 'CLOSED';
    if (horseshoe === 0) return 'OPEN';
    if (horseshoe === 1) return 'CLOSED';
    const u = String(instr || '').toUpperCase();
    if (u === 'S6') return 'OPEN';
    if (u === 'L1') return 'CLOSED';
    if ((u === 'LO' || u === 'L0') && l0Status === 0) return 'OPEN';
    return undefined;
  };

  // Build per-IMEI state from oldest->newest to detect transition time (openSince) with debounce
  const deviceStates = useMemo(() => {
    type State = { imei: string; status: 'OPEN' | 'CLOSED'; openSince: number | null; lastTs: number; lastInstr?: string; lastChangeTs?: number; lastS6Ts?: number };
    const states = new Map<string, State>();
    const ordered = logs.filter((l) => l.src === 'controller').slice().reverse(); // oldest first
    for (const l of ordered) {
      const omni = parseOmni(l);
      const imei: string | undefined = omni.imei;
      if (!imei) continue;
      const instr: string | undefined = omni.instruction ? String(omni.instruction).toUpperCase() : undefined;
      const prev = states.get(imei) || { imei, status: 'CLOSED' as const, openSince: null as number | null, lastTs: 0, lastInstr: undefined as string | undefined, lastChangeTs: undefined as number | undefined, lastS6Ts: undefined as number | undefined };

      // Update last seen timestamp and instruction
      prev.lastTs = l.ts;
      if (instr) prev.lastInstr = instr;

      // Track fresh S6 telemetry
      if (instr === 'S6') prev.lastS6Ts = l.ts;

      const debounceMs = 1500;
      const openLo = omni.lockInstr === 0; // from LO JSON
      const openH0 = omni.horseshoe === 0; // from H0
      const u = String(instr || '').toUpperCase();
      const openFallback = (u === 'LO' || u === 'L0'); // L0/LO open attempt
      const closeOnL1 = (u === 'L1'); // close only on L1 summary

      if ((openLo || openH0 || openFallback) && prev.status !== 'OPEN') {
        if (!prev.lastChangeTs || l.ts - prev.lastChangeTs >= debounceMs) {
          prev.status = 'OPEN';
          prev.openSince = l.ts;
          prev.lastChangeTs = l.ts;
        }
      } else if (closeOnL1 && prev.status !== 'CLOSED') {
        // Close only when L1 arrives
        if (!prev.lastChangeTs || l.ts - prev.lastChangeTs >= debounceMs) {
          prev.status = 'CLOSED';
          prev.openSince = null;
          prev.lastChangeTs = l.ts;
        }
      }

      states.set(imei, prev);
    }
    // convert to array, newest first
    return Array.from(states.values()).sort((a, b) => b.lastTs - a.lastTs);
  }, [logs]);

  const fmtDuration = (ms: number) => {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s/3600)).padStart(2,'0');
    const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    return `${hh}:${mm}:${ss}`;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M3 9.75h18M3 15h18M3 20.25h18"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI Logs</h1>
              <p className="text-sm text-slate-600">Lihat semua callback masuk untuk analisis & debugging.</p>
            </div>
          </div>
          <a href="/admin/settings/omni/callbacks" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Send Test</a>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">Logs URL: <span className="font-mono break-all">{logsUrl}</span></div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">Callback URL: <span className="font-mono break-all">{cbUrl}</span></div>
        </div>
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        {/* Device states summary */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-semibold text-slate-800">Device States</div>
          {deviceStates.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">No devices yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {deviceStates.map((d) => {
                const open = d.status === 'OPEN';
                const sinceTs = open ? (d.openSince ?? d.lastTs) : d.lastTs;
                const sinceStr = new Date(sinceTs).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
                const dur = open && d.openSince ? fmtDuration(nowTs - d.openSince) : undefined;
                return (
                  <div key={d.imei} className={`rounded-xl p-3 ring-1 ${open ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">IMEI {d.imei}</div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${open ? 'bg-amber-100 text-amber-800 ring-amber-300' : 'bg-emerald-100 text-emerald-800 ring-emerald-300'}`}>{open ? 'OPEN' : 'CLOSED'}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-700">Instr: {d.lastInstr || '-'}</div>
                    <div className="mt-1 text-xs text-slate-700">Since: {sinceStr}</div>
                    {open && (
                      <div className="mt-1 text-xs text-slate-900"><span className="font-medium">Open for:</span> <span suppressHydrationWarning className="font-mono">{dur}</span></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logs (text/JSON)" className="min-w-[220px] grow rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
          <button onClick={load} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
          <button onClick={() => setAuto((x) => !x)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">{auto ? 'Auto: ON' : 'Auto: OFF'}</button>
          <button onClick={clear} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50">Clear</button>
          <button onClick={copyAll} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Copy JSON</button>
          {/* <button onClick={() => { setDebugOpen((v) => !v); checkPing(); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">{debugOpen ? 'Hide Debug' : 'Show Debug'}</button> */}
        </div>

        <div className="mt-4 space-y-3">
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
          {filtered.length === 0 && !loading && <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">No logs.</div>}
          {filtered.slice(start, end).map((l, idx) => {
            const ts = new Date(l.ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" });
            const hasErr = /\berr(or)?\b|\bfail\b|\bexception\b/i.test(JSON.stringify(l.body || {}));
            const omni = parseOmni(l);
            return (
              <div key={idx} className={`rounded-xl p-3 ring-1 ${hasErr ? 'bg-rose-50 ring-rose-200' : 'bg-slate-50 ring-slate-200'}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="font-medium text-slate-900">{ts}</span>
                  {l.method && <span className="rounded-md bg-white/70 px-2 py-0.5 ring-1 ring-slate-200 font-mono">{l.method}</span>}
                  <span className="rounded-md bg-white/70 px-2 py-0.5 ring-1 ring-slate-200 font-mono">{l.path}</span>
                  {l.ip && <span className="rounded-md bg-white/70 px-2 py-0.5 ring-1 ring-slate-200 font-mono">{l.ip}</span>}
                  {l.src && <span className={`rounded-md px-2 py-0.5 ring-1 ${l.src === 'controller' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>{l.src}</span>}
                  {hasErr && <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-800 ring-1 ring-rose-200">Detected error</span>}
                </div>
                {(omni.imei || omni.instruction || omni.battery != null) && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    {omni.imei && <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200 font-mono">IMEI: {omni.imei}</span>}
                    {omni.instruction && <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">Instruction: {String(omni.instruction).toUpperCase()}</span>}
                    {omni.battery != null && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200">Battery: {omni.battery}%</span>}
                    {omni.speed != null && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-800 ring-1 ring-sky-200">Speed: {omni.speed}</span>}
                    {omni.charging != null && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200">Charging: {String(omni.charging)}</span>}
                    {omni.fault != null && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-800 ring-1 ring-rose-200">Fault: {String(omni.fault)}</span>}
                    {omni.remain != null && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-violet-800 ring-1 ring-violet-200">Remain: {String(omni.remain)}</span>}
                  </div>
                )}
                <details className="rounded-lg bg-white/70 p-2">
                  <summary className="cursor-pointer text-xs text-slate-800">View payload</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <div className="md:col-span-1">
                      <div className="mb-1 text-xs font-semibold text-slate-800">Query</div>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">{JSON.stringify(l.query || {}, null, 2)}</pre>
                    </div>
                    <div className="md:col-span-1">
                      <div className="mb-1 text-xs font-semibold text-slate-800">Headers</div>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">{JSON.stringify(l.headers || {}, null, 2)}</pre>
                    </div>
                    <div className="md:col-span-1">
                      <div className="mb-1 text-xs font-semibold text-slate-800">Body</div>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">{JSON.stringify(l.body || {}, null, 2)}</pre>
                    </div>
                  </div>
                  {omni.tokens && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs font-semibold text-slate-800">Parsed tokens (data)</div>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {omni.tokens.map((t: string, i: number) => (
                          <span key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono ring-1 ring-slate-200">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {omni.json && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs font-semibold text-slate-800">json (decoded)</div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">{JSON.stringify(omni.json, null, 2)}</pre>
                    </div>
                  )}
                </details>
              </div>
            );
          })}
          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-600">Showing <span className="font-medium">{total === 0 ? 0 : start + 1}</span>–<span className="font-medium">{end}</span> of <span className="font-medium">{total}</span></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50">Prev</button>
              <div className="text-xs text-slate-600">Page {page} / {totalPages}</div>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
        {debugOpen && (
          <div className="mt-4 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-semibold text-slate-800">Diagnostics</div>
            <div className="grid gap-2 md:grid-cols-3 text-xs text-slate-700">
              <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                <div className="font-medium">Ping</div>
                <div className="mt-1 font-mono">{diag?.ping ?? '-'}</div>
                {/* <button onClick={checkPing} className="mt-2 rounded border px-2 py-1 text-xs">Check</button> */}
              </div>
              <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                <div className="font-medium">Proxy fetch (/api/_omni/logs)</div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(diag?.proxy || {}, null, 2)}</pre>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                <div className="font-medium">Direct fetch (base /iot/omni/logs)</div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(diag?.direct || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
