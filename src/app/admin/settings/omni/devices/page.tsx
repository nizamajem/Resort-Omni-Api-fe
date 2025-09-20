"use client";

import { useEffect, useMemo, useState } from "react";

type Device = {
  id?: string;
  equipmentId?: string;
  imei?: string;
  mac?: string;
  lat?: number;
  lng?: number;
  heartTime?: number;
  positionTime?: number;
  isOnline?: boolean | number | null;
  equipmentStatus?: string | number;
  iotPower?: string | number;
  equipmentPower?: string | number;
  iotPowerPercent?: number;
  gsm?: number;
  gsmNum?: number;
  name?: string;
  deviceNo?: string;
};

export default function OmniDevicesPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any | null>(null);
  const [selected, setSelected] = useState<Device | null>(null);
  const [unlockParam, setUnlockParam] = useState<string>("0");
  const [unlockUser, setUnlockUser] = useState<string>("1234");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockResult, setUnlockResult] = useState<any | null>(null);
  const [activeCmd, setActiveCmd] = useState<'unlock'|'find'|'position'|'c4'|'c5'>('unlock');
  const [findRings, setFindRings] = useState<string>('8');
  const [findReserve, setFindReserve] = useState<string>('0');
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdResult, setCmdResult] = useState<any | null>(null);

  const devices: Device[] = useMemo(() => {
    const b = payload?.body ?? payload?.data ?? payload;
    if (Array.isArray(b)) return b;
    if (Array.isArray(b?.data)) return b.data;
    return [];
  }, [payload]);

  const load = async () => {
    setLoading(true); setError(null); setPayload(null);
    try {
      const res = await fetch('/api/omni/devices');
      const txt = await res.text();
      let data: any = null;
      try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON from proxy', raw: txt }; }
      setPayload(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmtTs = (sec?: number) => sec ? new Date(sec * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

  const deriveOnline = (d: Device) => {
    // Prefer explicit boolean/number
    if (typeof d.isOnline === 'boolean') return d.isOnline;
    if (d.isOnline === 1 || (d as any)?.isOnline === '1') return true;
    // Check common string fields (status/on-line)
    const sRaw = (d as any)?.status ?? (d as any)?.deviceStatus ?? (d as any)?.onlineStatus;
    const s = typeof sRaw === 'string' ? sRaw.toLowerCase() : '';
    if (['on-line','online','on','1','true'].includes(s)) return true;
    // Heartbeat recency fallback: if within last 30 minutes consider online
    const nowSec = Math.floor(Date.now()/1000);
    if (d.heartTime && nowSec - d.heartTime < 30*60) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18v11.5H3zM7.5 18.75h9"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI • View Device</h1>
              <p className="text-sm text-slate-600">Daftar perangkat dari OMNI API via server proxy.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

        <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">IMEI</th>
                <th className="px-3 py-2 font-medium">MAC</th>
                <th className="px-3 py-2 font-medium">Online</th>
                <th className="px-3 py-2 font-medium">Equip Status</th>
                <th className="px-3 py-2 font-medium">IoT Power</th>
                <th className="px-3 py-2 font-medium">Equip Power</th>
                <th className="px-3 py-2 font-medium">IoT %</th>
                <th className="px-3 py-2 font-medium">GSM</th>
                <th className="px-3 py-2 font-medium">Last Heartbeat</th>
                <th className="px-3 py-2 font-medium">Last Position</th>
                <th className="px-3 py-2 font-medium">Lat</th>
                <th className="px-3 py-2 font-medium">Lng</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-slate-500">No devices</td></tr>
              ) : devices.map((d, i) => {
                const online = deriveOnline(d);
                const onlineBadge = online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200';
                return (
                <tr key={(d.id || d.equipmentId || d.imei || d.mac || i).toString()} className="odd:bg-white even:bg-slate-50 hover:bg-sky-50/60 cursor-pointer" onClick={() => { setSelected(d); setUnlockResult(null); }}>
                  <td className="px-3 py-2 text-slate-800">{i+1}</td>
                  <td className="px-3 py-2 text-slate-800 font-mono">{d.id || d.equipmentId || '-'}</td>
                  <td className="px-3 py-2 text-slate-800 font-mono">{d.imei || d.deviceNo || '-'}</td>
                  <td className="px-3 py-2 text-slate-800 font-mono">{d.mac || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${onlineBadge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500':'bg-rose-500'}`} />
                        {online ? 'Online' : 'Offline'}
                      </span>
                      {((d as any)?.status || (d as any)?.deviceStatus || (d as any)?.onlineStatus) && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">{String((d as any)?.status || (d as any)?.deviceStatus || (d as any)?.onlineStatus)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{d.equipmentStatus ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{d.iotPower ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{d.equipmentPower ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{d.iotPowerPercent ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{d.gsm} / {d.gsmNum}</td>
                  <td className="px-3 py-2 text-slate-800">{fmtTs(d.heartTime)}</td>
                  <td className="px-3 py-2 text-slate-800">{fmtTs(d.positionTime)}</td>
                  <td className="px-3 py-2 text-slate-800">{d.lat ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{d.lng ?? '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {payload && !Array.isArray(devices) && (
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-600">Raw Result</div>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(payload, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Device modal with Unlock action */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18v11.5H3zM7.5 18.75h9"/></svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Device Detail</h3>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Close</button>
            </div>

            <div className="grid gap-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between"><span className="text-slate-600">ID</span><span className="font-medium text-slate-900">{selected.id || selected.equipmentId || '-'}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">IMEI</span><span className="font-medium text-slate-900">{selected.imei || selected.deviceNo || '-'}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">MAC</span><span className="font-medium text-slate-900">{selected.mac || '-'}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Last Heartbeat</span><span className="font-medium text-slate-900">{fmtTs(selected.heartTime)}</span></div>
            </div>
            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Command Center</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { key:'unlock', label:'Unlock (L0)' },
                  { key:'find', label:'Find Device (S8)' },
                  { key:'position', label:'Get Position (D0)' },
                  { key:'c4', label:'Command 4' },
                  { key:'c5', label:'Command 5' },
                ] as const).map((c) => (
                  <button key={c.key} onClick={()=>{ setActiveCmd(c.key); setCmdResult(null); }} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${activeCmd===c.key ? 'bg-sky-100 text-sky-800 ring-sky-200' : 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200'}`}>{c.label}</button>
                ))}
              </div>

              {/* Unlock form */}
              {activeCmd==='unlock' && (
                <div className="mt-3">
                  <p className="text-xs text-slate-600">Unlock: POST /prod-api/iot/api/v1/request, command L0.</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Unlock Parameter</label>
                      <input value={unlockParam} onChange={(e)=>setUnlockParam(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">User ID</label>
                      <input value={unlockUser} onChange={(e)=>setUnlockUser(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={async()=>{
                      if (!selected?.imei && !selected?.deviceNo) return;
                      setCmdBusy(true); setCmdResult(null);
                      try {
                        const res = await fetch('/api/omni/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imei: selected.imei || selected.deviceNo, unlockParameter: unlockParam, userId: unlockUser, command: 'L0' }) });
                        const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { data = { ok:false, error:'Invalid JSON from proxy', raw: text }; }
                        setCmdResult(data);
                      } catch (e:any) { setCmdResult({ ok:false, error: e?.message || String(e) }); }
                      setCmdBusy(false);
                    }} disabled={cmdBusy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:opacity-50">{cmdBusy ? 'Sending...' : 'Send Unlock'}</button>
                    <button onClick={()=>{ setUnlockParam('0'); setUnlockUser('1234'); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50">Reset</button>
                  </div>
                </div>
              )}

              {/* Find Device form */}
              {activeCmd==='find' && (
                <div className="mt-3">
                  <p className="text-xs text-slate-600">Find a car/device: command S8 dengan parameter numberOfRinging & reserve.</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">numberOfRinging</label>
                      <input value={findRings} onChange={(e)=>setFindRings(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">reserve</label>
                      <input value={findReserve} onChange={(e)=>setFindReserve(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={async()=>{
                      if (!selected?.imei && !selected?.deviceNo) return;
                      setCmdBusy(true); setCmdResult(null);
                      try {
                        const res = await fetch('/api/omni/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imei: selected.imei || selected.deviceNo, numberOfRinging: String(findRings), reserve: String(findReserve), command: 'S8' }) });
                        const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { data = { ok:false, error:'Invalid JSON from proxy', raw: text }; }
                        setCmdResult(data);
                      } catch (e:any) { setCmdResult({ ok:false, error: e?.message || String(e) }); }
                      setCmdBusy(false);
                    }} disabled={cmdBusy} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">{cmdBusy ? 'Sending...' : 'Send Find Device'}</button>
                    <button onClick={()=>{ setFindRings('8'); setFindReserve('0'); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50">Reset</button>
                  </div>
                </div>
              )}

              {/* Position (D0) */}
              {activeCmd==='position' && (
                <div className="mt-3">
                  <p className="text-xs text-slate-600">Get positioning instructions, one time: command D0 (tanpa parameter tambahan).</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={async()=>{
                      if (!selected?.imei && !selected?.deviceNo) return;
                      setCmdBusy(true); setCmdResult(null);
                      try {
                        const res = await fetch('/api/omni/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imei: selected.imei || selected.deviceNo, command: 'D0' }) });
                        const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { data = { ok:false, error:'Invalid JSON from proxy', raw: text }; }
                        setCmdResult(data);
                      } catch (e:any) { setCmdResult({ ok:false, error: e?.message || String(e) }); }
                      setCmdBusy(false);
                    }} disabled={cmdBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-indigo-700 disabled:opacity-50">{cmdBusy ? 'Sending...' : 'Send D0'}</button>
                  </div>
                </div>
              )}

              {/* Placeholder commands 4-5 */}
              {(['c4','c5'] as const).includes(activeCmd) && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">Silakan kirim spesifikasi 3 command lainnya; UI siap menampung.</div>
              )}

              {cmdResult && (
                <div className="mt-4 grid gap-2">
                  <div className={`rounded-xl ${cmdResult.ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-800' : 'bg-rose-50 ring-rose-200 text-rose-700'} p-3 text-sm ring-1`}>OK: {String(cmdResult.ok)} • Status: {cmdResult.status ?? '-'}</div>
                  <div>
                    <div className="text-xs font-medium text-slate-600">Request</div>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(cmdResult.request ?? {}, null, 2)}</pre>
                  </div>
                  {cmdResult.response && (
                    <div>
                      <div className="text-xs font-medium text-slate-600">Response</div>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(cmdResult.response, null, 2)}</pre>
                    </div>
                  )}
                  {cmdResult.raw && (
                    <div>
                      <div className="text-xs font-medium text-slate-600">Raw</div>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{String(cmdResult.raw)}</pre>
                    </div>
                  )}
                  {cmdResult.error && (
                    <div className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">{String(cmdResult.error)}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
