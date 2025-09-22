"use client";

import { useEffect, useState, Fragment } from "react";

type Bike = {
  id: string;
  imei: string;
  ebikeNumber: string;
  displayName?: string | null;
  photoUrl?: string | null;
  iotPowerPercent?: number | null;
  equipmentPower?: string | null;
  isOnline?: boolean | null;
  heartTime?: number | null;
  positionTime?: number | null;
  gsm?: number | null;
};

type Device = {
  id?: string;
  equipmentId?: string;
  imei?: string;
  deviceNo?: string;
  mac?: string;
  lat?: number;
  lng?: number;
  heartTime?: number;
  positionTime?: number;
  isOnline?: boolean | number | null;
  gsm?: number;
  gsmNum?: number;
};

function normalizePhotoUrl(url: string): string {
  try {
    const u = (url || '').trim();
    if (!u) return u;
    let m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    m = u.match(/drive\.google\.com\/(?:open|uc)\/?\?[^#]*id=([^&]+)/i);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    m = u.match(/lh3\.googleusercontent\.com\/d\/([^/?#]+)/i);
    if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
    return u;
  } catch { return url; }
}

const proxiedPhoto = (url?: string | null) => {
  if (!url) return '';
  const norm = normalizePhotoUrl(url);
  return `/api/image-proxy?url=${encodeURIComponent(norm)}`;
};

export default function BikeListPage() {
  const [rows, setRows] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nowSec, setNowSec] = useState<number | null>(null);
  const [devIdx, setDevIdx] = useState<Record<string, Device>>({}); // key: IMEI or deviceNo
  const [addrByImei, setAddrByImei] = useState<Record<string, string>>({});

  useEffect(() => { setNowSec(Math.floor(Date.now()/1000)); }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/operations/bikes', { cache: 'no-store' });
      const txt = await res.text();
      const data = JSON.parse(txt);
      if (data?.ok) setRows(Array.isArray(data.data) ? data.data : []); else setError(data?.error || 'Failed to load');
    } catch (e:any) { setError(e?.message || String(e)); }
    setLoading(false);
  };

  const onSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/operations/bikes/sync', { method: 'POST' });
      await load();
    } finally { setSyncing(false); }
  };

  useEffect(() => { load(); }, []);

  // Enrichment: load device list from OMNI once
  useEffect(() => {
    (async() => {
      try {
        const res = await fetch('/api/omni/devices', { cache: 'no-store' });
        const txt = await res.text();
        let data: any = null; try { data = JSON.parse(txt); } catch { data = { body: [] }; }
        const list: Device[] = Array.isArray(data?.body) ? data.body : (Array.isArray(data?.body?.data) ? data.body.data : []);
        const idx: Record<string, Device> = {};
        for (const d of list) {
          const key = String((d as any)?.imei || (d as any)?.deviceNo || '').trim();
          if (key) idx[key] = d;
        }
        setDevIdx(idx);
      } catch {}
    })();
  }, []);

  const fmtTs = (sec?: number | null) => (sec ? new Date(Number(sec) * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
  const filtered = rows.filter((b) => (b.ebikeNumber || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 6.75h13.5v10.5H5.25zM8.25 18.75h7.5"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bike List</h1>
              <p className="text-sm text-slate-600">Daftar E-bike. Klik nomor untuk melihat detail.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input suppressHydrationWarning value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cari E-bike Number" className="w-52 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
            <button onClick={load} disabled={loading} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">{loading ? 'Loading...' : 'Refresh'}</button>
            <button onClick={onSync} disabled={syncing} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:opacity-50">{syncing ? 'Syncing...' : 'Sync from OMNI'}</button>
          </div>
        </div>
        {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

        <div className="mt-2 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">E-bike Number</th>
                <th className="px-3 py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={2}>{query ? 'Tidak ada hasil.' : 'Belum ada data. Klik Sync untuk impor dari OMNI.'}</td>
                </tr>
              ) : filtered.map((b) => {
                const online = !!b.isOnline || (b.heartTime ? (nowSec! - Number(b.heartTime) < 30*60) : false);
                const open = expanded === b.id;
                const dev = devIdx[b.imei] || devIdx[b.ebikeNumber] || {};
                return (
                  <Fragment key={b.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={()=>{
                      const nextOpen = open ? null : b.id;
                      setExpanded(nextOpen);
                      if (!open && (dev as any).lat != null && (dev as any).lng != null && !addrByImei[b.imei]) {
                        (async()=>{
                          try {
                            const r = await fetch(`/api/geocode?lat=${encodeURIComponent(String((dev as any).lat))}&lng=${encodeURIComponent(String((dev as any).lng))}`, { cache:'no-store' });
                            const t = await r.text();
                            let j: any = null; try { j = JSON.parse(t); } catch { j = null; }
                            const name = j?.data?.displayName || '';
                            if (name) setAddrByImei(prev => ({ ...prev, [b.imei]: name }));
                          } catch {}
                        })();
                      }
                    }}>
                      <td className="px-3 py-2 font-mono text-slate-900">{b.ebikeNumber}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ring-1 ${online ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} /> {online ? 'Online' : 'Offline'}
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/></svg>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={2} className="bg-white">
                          <div className="px-3 py-3">
                            <div className="grid gap-3 md:grid-cols-4">
                              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                                <div className="text-xs font-medium text-slate-600 mb-1">Overview</div>
                                <div className="text-sm text-slate-900">{b.displayName || '-'}</div>
                                <div className="text-xs text-slate-600">IMEI: <span className="font-mono">{b.imei}</span></div>
                                <div className="text-xs text-slate-600">Battery: {b.iotPowerPercent ?? '-'}%</div>
                                <div className="text-xs text-slate-600">Equip Power: {b.equipmentPower ?? '-'}</div>
                                <div className="text-xs text-slate-600">GSM: {b.gsm ?? '-'}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                                <div className="text-xs font-medium text-slate-600 mb-1">Timestamps</div>
                                <div className="text-xs text-slate-600">Last Heartbeat: {fmtTs(b.heartTime)}</div>
                                <div className="text-xs text-slate-600">Position Time: {fmtTs(b.positionTime)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                                <div className="text-xs font-medium text-slate-600 mb-1">Device</div>
                                <div className="text-xs text-slate-600">MAC: <span className="font-mono">{(dev as any)?.mac || '-'}</span></div>
                                <div className="text-xs text-slate-600">ID: <span className="font-mono">{(dev as any)?.equipmentId || (dev as any)?.id || '-'}</span></div>
                                <div className="text-xs text-slate-600">GSM: {(dev as any)?.gsm ?? (dev as any)?.gsmNum ?? b.gsm ?? '-'}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                                <div className="text-xs font-medium text-slate-600 mb-1">Location</div>
                                <div className="text-xs text-slate-600">Lat: <span className="font-mono">{(dev as any)?.lat ?? '-'}</span></div>
                                <div className="text-xs text-slate-600">Lng: <span className="font-mono">{(dev as any)?.lng ?? '-'}</span></div>
                                {addrByImei[b.imei] && (
                                  <div className="mt-1 text-xs text-slate-700">{addrByImei[b.imei]}</div>
                                )}
                                {(dev as any)?.lat != null && (dev as any)?.lng != null && (
                                  <a className="mt-2 inline-block text-xs text-sky-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${encodeURIComponent(String((dev as any).lat))},${encodeURIComponent(String((dev as any).lng))}`}>
                                    Buka di Google Maps
                                  </a>
                                )}
                              </div>
                              <div className="md:col-span-4 lg:col-span-2 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                                <div className="text-xs font-medium text-slate-600 mb-1">Photo</div>
                                {b.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={proxiedPhoto(b.photoUrl)} alt={b.displayName || b.ebikeNumber} className="h-32 w-auto rounded-lg ring-1 ring-slate-200 object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'; }} />
                                ) : (
                                  <div className="grid h-32 w-full place-items-center text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-8 w-8"><path strokeLinecap="round" strokeLinejoin="round" d="M5 18h2l3-7 3 5h2l3-8"/></svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

