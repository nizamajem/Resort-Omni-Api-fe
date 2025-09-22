"use client";

import { useEffect, useMemo, useState } from "react";

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

type UsingRow = {
  imei: string;
  userId?: string;
  since: number;
  battery?: number;
  speed?: number;
  rideKm?: number;
};

type HistoryRow = {
  imei: string;
  userId?: string;
  start: number;
  end: number;
  durationMs: number;
  distanceKm?: number;
  co2kg?: number;
};

export default function CyclingPage() {
  const [logs, setLogs] = useState<OmniLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/omni/logs', { cache: 'no-store' });
      const data = await res.json();
      setLogs(Array.isArray(data?.logs) ? (data.logs as OmniLog[]) : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load logs');
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(fetchLogs, 5000);
    return () => clearInterval(t);
  }, [auto]);
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function num(v: any): number | undefined {
    if (v == null) return undefined;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }

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
    }
    // lock status
    const lockInstr = num(info.json?.lockingInstruction);
    const horseshoe = num(info.json?.horseshoeLockLockStatus);
    info.lockInstr = lockInstr;
    info.horseshoe = horseshoe;
    // telemetry
    info.battery = num(info.json?.currentElectricQuantity);
    info.speed = num(info.json?.currentSpeed);
    info.totalMileage = num(info.json?.totalMileageRidden);
    // support both mileagePerRide and mileAgePerRide (as per doc)
    info.mileagePerRide = num(info.json?.mileagePerRide ?? info.json?.mileAgePerRide);
    info.userId = info.json?.userId || undefined;
    return info;
  }

  // Status mapping for usage timing
  // Priority 1: numeric flags from LO/H0 payload JSON
  // Fallback: instruction-based signals (LO=open, L1/D0=closed) if numeric flags absent
  function mapStatus(instr?: string, lockInstr?: number, horseshoe?: number): 'OPEN' | 'CLOSED' | undefined {
    if (lockInstr === 0) return 'OPEN';
    if (lockInstr === 1) return 'CLOSED';
    if (horseshoe === 0) return 'OPEN';
    if (horseshoe === 1) return 'CLOSED';
    const u = String(instr || '').toUpperCase();
    if (u === 'LO' || u === 'L0') return 'OPEN';
    if (u === 'L1' || u === 'D0') return 'CLOSED';
    return undefined;
  }

  const computed = useMemo(() => {
    const controller = logs.filter((l) => l.src === 'controller');
    const asc = controller.slice().sort((a,b) => a.ts - b.ts);
    type State = {
      open: boolean;
      openTs?: number;
      startTotal?: number;
      lastTotal?: number;
      lastBattery?: number;
      lastSpeed?: number;
      userId?: string;
      lastRideMileage?: number;
      lastChangeTs?: number;
      openedBy?: 'LO' | 'H0';
      lastS6Ts?: number;
    };
    const byImei = new Map<string, State>();
    const history: HistoryRow[] = [];
    const lastIdxByImei = new Map<string, number>();

    for (const l of asc) {
      const o = parseOmni(l);
      const imei: string | undefined = o.imei;
      if (!imei) continue;
      const st = byImei.get(imei) || { open: false };
      const status = mapStatus(o.instruction, o.lockInstr, o.horseshoe);
      
      // capture telemetry continuously
      if (o.totalMileage != null) st.lastTotal = o.totalMileage;
      if (o.mileagePerRide != null) st.lastRideMileage = o.mileagePerRide;
      if (o.mileagePerRide != null && st.lastTotal == null) st.lastTotal = o.mileagePerRide; // legacy fallback
      if (o.battery != null) st.lastBattery = o.battery;
      if (o.speed != null) st.lastSpeed = o.speed;
      if (o.userId && !st.userId) st.userId = String(o.userId);
      if (String(o.instruction || '').toUpperCase() === 'S6') st.lastS6Ts = l.ts;

      const debounceMs = 1500;
      const openLo = o.lockInstr === 0;
      const closeLo = o.lockInstr === 1;
      const openH0 = o.horseshoe === 0;
      const closeH0 = o.horseshoe === 1;
      const instrU = String(o.instruction || '').toUpperCase();
      const openFallback = instrU === 'LO';
      const closeFallback = (instrU === 'L1');

      if ((openLo || openH0 || openFallback) && !st.open) {
        if (!st.lastChangeTs || l.ts - st.lastChangeTs >= debounceMs) {
          st.open = true;
          st.openTs = l.ts;
          st.startTotal = o.totalMileage ?? o.mileagePerRide ?? st.lastTotal;
          if (o.userId) st.userId = String(o.userId);
          st.openedBy = (openLo || openFallback) ? 'LO' : 'H0';
          st.lastChangeTs = l.ts;
        }
      } else if ((instrU === 'L1') && st.open) {
        if (st.lastChangeTs && l.ts - st.lastChangeTs < 1500) { byImei.set(imei, st); continue; }
        const start = st.openTs || l.ts;
        const opTsRaw = (o.json && (o.json.operationTimeStamp ?? o.json.operationTimestamp));
        const end = (opTsRaw && Number(opTsRaw) ? Number(opTsRaw) * 1000 : l.ts);
        const rideTimeSec = (o.json && o.json.ridingTime != null) ? Number(o.json.ridingTime) : undefined;
        const dur = rideTimeSec != null && Number.isFinite(rideTimeSec) ? Math.max(0, rideTimeSec * 1000) : Math.max(0, end - start);
        let distanceKm = st.lastRideMileage ?? o.mileagePerRide;
        if (distanceKm == null) {
          const endTotal = o.totalMileage ?? st.lastTotal;
          if (st.startTotal != null && endTotal != null) {
            const delta = endTotal - st.startTotal;
            if (Number.isFinite(delta) && delta >= 0) distanceKm = delta;
          }
        }
        const used = (dur >= 5000) || (distanceKm != null && distanceKm > 0);
        const co2kg = distanceKm != null ? Number((distanceKm * 0.12).toFixed(3)) : undefined;
        if (used) {
          history.push({ imei, userId: st.userId, start, end, durationMs: dur, distanceKm, co2kg });
          lastIdxByImei.set(imei, history.length - 1);
        }
        byImei.set(imei, { open: false, lastChangeTs: l.ts });
        continue;
      } else if ((instrU === 'L1') && !st.open) {
        // Adjust the latest history row for this IMEI with L1 summary if present
        const idx = lastIdxByImei.get(imei);
        if (idx != null && idx >= 0 && history[idx]) {
          const row = history[idx];
          const opTsRaw = (o.json && (o.json.operationTimeStamp ?? o.json.operationTimestamp));
          const end = (opTsRaw && Number(opTsRaw) ? Number(opTsRaw) * 1000 : row.end);
          const rideTimeSec = (o.json && o.json.ridingTime != null) ? Number(o.json.ridingTime) : undefined;
          const dur = rideTimeSec != null && Number.isFinite(rideTimeSec) ? Math.max(0, rideTimeSec * 1000) : Math.max(0, end - row.start);
          let distanceKm = row.distanceKm;
          if (distanceKm == null) distanceKm = st.lastRideMileage ?? o.mileagePerRide ?? distanceKm;
          history[idx] = { ...row, end, durationMs: dur, distanceKm, co2kg: distanceKm != null ? Number((distanceKm * 0.12).toFixed(3)) : row.co2kg };
        }
        byImei.set(imei, st);
        continue;
      }
      byImei.set(imei, st);
    }

    const using: UsingRow[] = [];
    for (const [imei, st] of byImei.entries()) {
      if (st.open && st.openTs) {
        using.push({ imei, userId: st.userId, since: st.openTs, battery: st.lastBattery, speed: st.lastSpeed, rideKm: st.lastRideMileage });
      }
    }

    // newest first
    using.sort((a,b) => b.since - a.since);
    history.sort((a,b) => b.start - a.start);
    return { using, history };
  }, [logs]);

  const fmtDate = (ts: number) => new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDur = (ms: number) => {
    const s = Math.floor(ms/1000);
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 3.5M12 3a9 9 0 1 0 9 9"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cycling</h1>
              <p className="text-sm text-slate-600">Status pemakaian realtime dan riwayat selesai dari callback OMNI.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
            <button onClick={() => setAuto((x)=>!x)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Auto: {auto ? 'ON' : 'OFF'}</button>
          </div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </section>

      {/* Using (OPEN sessions) */}
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18"/></svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Using</h3>
        </div>
        {computed.using.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">No active users.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">IMEI</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Since</th>
                  <th className="px-4 py-3 font-medium">Elapsed</th>
                  <th className="px-4 py-3 font-medium">Battery</th>
                  <th className="px-4 py-3 font-medium">Speed</th>
                  <th className="px-4 py-3 font-medium">Distance (km)</th>
                </tr>
              </thead>
              <tbody>
                {computed.using.map((u) => (
                  <tr key={`${u.imei}-${u.since}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-800">{u.imei}</td>
                    <td className="px-4 py-3 text-slate-800">{u.userId || '-'}</td>
                    <td className="px-4 py-3 text-slate-700"><span suppressHydrationWarning>{fmtDate(u.since)}</span></td>
                    <td className="px-4 py-3 text-slate-800"><span suppressHydrationWarning className="font-mono">{fmtDur(nowTs - u.since)}</span></td>
                    <td className="px-4 py-3 text-slate-800">{u.battery != null ? `${u.battery}%` : '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{u.speed != null ? String(u.speed) : '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{u.rideKm != null ? u.rideKm.toFixed(2) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cycling History (closed sessions) */}
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m-15 5.25h15M4.5 6.75h15"/></svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Cycling History</h3>
        </div>
        {computed.history.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">No history.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">IMEI</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium">End</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Distance (km)</th>
                  <th className="px-4 py-3 font-medium">CO₂ Saved</th>
                </tr>
              </thead>
              <tbody>
                {computed.history.map((h, i) => (
                  <tr key={`${h.imei}-${h.start}-${i}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-800">{h.imei}</td>
                    <td className="px-4 py-3 text-slate-800">{h.userId || '-'}</td>
                    <td className="px-4 py-3 text-slate-700"><span suppressHydrationWarning>{fmtDate(h.start)}</span></td>
                    <td className="px-4 py-3 text-slate-700"><span suppressHydrationWarning>{fmtDate(h.end)}</span></td>
                    <td className="px-4 py-3 text-slate-800">{fmtDur(h.durationMs)}</td>
                    <td className="px-4 py-3 text-slate-800">{h.distanceKm != null ? h.distanceKm.toFixed(2) : '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{h.co2kg != null ? `${h.co2kg.toFixed(3)} kg` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
