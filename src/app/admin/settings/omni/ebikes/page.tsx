"use client";

import { useEffect, useState } from 'react';

function normalizePhotoUrl(url: string): string {
  try {
    const u = url.trim();
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
export default function EbikeControlPage() {
  // Alias state
  const [aliases, setAliases] = useState<any[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasErr, setAliasErr] = useState<string | null>(null);
  const [imei, setImei] = useState('');
  const [ebikeNumber, setEbikeNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Control state
  const [ctrlEbike, setCtrlEbike] = useState('');
  const [userId, setUserId] = useState('1234');
  const [unlockParam, setUnlockParam] = useState('0');
  const [findRings, setFindRings] = useState('8');
  const [findReserve, setFindReserve] = useState('0');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const loadAliases = async () => {
    setAliasLoading(true); setAliasErr(null);
    try {
      const res = await fetch('/api/omni/aliases', { cache: 'no-store' });
      const txt = await res.text();
      let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt } }
      if (data?.ok) setAliases(Array.isArray(data.data) ? data.data : []); else setAliasErr(data?.error || 'Failed');
    } catch (e:any) { setAliasErr(e?.message || String(e)); }
    setAliasLoading(false);
  };

  useEffect(() => { loadAliases(); }, []);

  const onSave = async () => {
    if (!imei.trim() || !ebikeNumber.trim()) return;
    setSaving(true); setResult(null);
    try {
      // Save mapping first
      const res = await fetch('/api/omni/aliases', { method:'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imei: imei.trim(), ebikeNumber: ebikeNumber.trim() }) });
      const txt = await res.text();
      let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt } }
      setResult(data);
      // Save metadata if present
      if (data?.ok && (displayName.trim() || photoUrl.trim())) {
        const normalized = normalizePhotoUrl(photoUrl.trim());
        await fetch('/api/omni/bike-meta', { method:'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imei: imei.trim(), ebikeNumber: ebikeNumber.trim(), displayName: displayName.trim() || undefined, photoUrl: normalized || undefined }) });
      }
      if (data?.ok) { setImei(''); setEbikeNumber(''); setDisplayName(''); setPhotoUrl(''); loadAliases(); }
    } catch (e:any) {
      setResult({ ok:false, error: e?.message || String(e) });
    }
    setSaving(false);
  };

  const resolveImei = async (eb: string) => {
    const res = await fetch('/api/omni/resolve?ebike=' + encodeURIComponent(eb), { cache: 'no-store' });
    const txt = await res.text();
    try { const data = JSON.parse(txt); if (data?.ok) return data.data.imei as string; throw new Error(data?.error || 'Resolve failed'); }
    catch (e:any) { throw new Error(e?.message || 'Resolve not JSON'); }
  };

  const onUnlock = async () => {
    if (!ctrlEbike.trim()) return;
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/omni/unlock-by-ebike', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ ebikeNumber: ctrlEbike.trim(), userId, unlockParameter: unlockParam }) });
      const txt = await res.text(); let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt } }
      setResult(data);
    } catch (e:any) { setResult({ ok:false, error: e?.message || String(e) }); }
    setBusy(false);
  };

  const onFind = async () => {
    if (!ctrlEbike.trim()) return;
    setBusy(true); setResult(null);
    try {
      const imei = await resolveImei(ctrlEbike.trim());
      const res = await fetch('/api/omni/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imei, numberOfRinging: String(findRings), reserve: String(findReserve), command: 'S8' }) });
      const txt = await res.text(); let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt } }
      setResult(data);
    } catch (e:any) { setResult({ ok:false, error: e?.message || String(e) }); }
    setBusy(false);
  };

  const onPosition = async () => {
    if (!ctrlEbike.trim()) return;
    setBusy(true); setResult(null);
    try {
      const imei = await resolveImei(ctrlEbike.trim());
      const res = await fetch('/api/omni/command', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imei, command: 'D0' }) });
      const txt = await res.text(); let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt } }
      setResult(data);
    } catch (e:any) { setResult({ ok:false, error: e?.message || String(e) }); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.5 19V9.5L12 5l6.5 4.5V19h-13Z"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">E-bike Control</h1>
              <p className="text-sm text-slate-600">Set E-bike Number, metadata, dan kirim perintah berdasarkan nomor E-bike.</p>
            </div>
          </div>
        </div>

        {/* Mapping form */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-900">Set Mapping E-bike Number</div>
            <p className="mt-1 text-xs text-slate-600">Masukkan IMEI dan E-bike Number (unik). Opsional: nama tampilan dan foto.</p>
            <div className="mt-3 grid gap-2">
              <input value={imei} onChange={e=>setImei(e.target.value)} placeholder="IMEI" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
              <input value={ebikeNumber} onChange={e=>setEbikeNumber(e.target.value)} placeholder="E-bike Number (contoh: EBIKE-001)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nama Tampilan (opsional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
              <div>
                <input value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} placeholder="Photo URL (opsional)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
                {photoUrl && (
                  <div className="mt-2">
                    <img src={photoUrl} alt="preview" className="h-24 w-auto rounded-lg ring-1 ring-slate-200 object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'; }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onSave} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Mapping + Metadata'}</button>
                <button onClick={loadAliases} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50">Refresh</button>
              </div>
            </div>
            {result && (
              <div className={`mt-3 rounded-lg p-2 text-xs ring-1 ${result.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>OK: {String(result.ok)}{result.error ? ` - ${result.error}` : ''}</div>
            )}
          </div>

          {/* Alias list */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-900">Daftar Mapping</div>
            <div className="mt-2 max-h-64 overflow-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">E-bike Number</th>
                    <th className="px-3 py-2 font-medium">IMEI</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aliasLoading ? (
                    <tr><td className="px-3 py-2 text-slate-500" colSpan={2}>Loading...</td></tr>
                  ) : aliases.length === 0 ? (
                    <tr><td className="px-3 py-2 text-slate-500" colSpan={2}>Belum ada data.</td></tr>
                  ) : (
                    aliases.map((a) => (
                      <tr key={a.id} className="odd:bg-white even:bg-slate-50">
                        <td className="px-3 py-2 font-mono">{a.ebikeNumber}</td>
                        <td className="px-3 py-2 font-mono">{a.imei}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => { setImei(a.imei || ""); setEbikeNumber(a.ebikeNumber || ""); }} className="mr-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Edit</button>
                          <button onClick={async () => { if (!confirm(`Hapus mapping ${a.ebikeNumber}?`)) return; await fetch(`/api/omni/aliases?ebike=${encodeURIComponent(a.ebikeNumber)}`, { method: "DELETE" }); loadAliases(); }} className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {aliasErr && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">{aliasErr}</div>}
          </div>
        </div>
      </section>

      {/* Control panel */}
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="text-sm font-medium text-slate-900">Tes Kontrol via E-bike Number</div>
        <p className="mt-1 text-xs text-slate-600">Masukkan E-bike Number untuk membuka (unlock), mencari (find device), atau ambil posisi (position).</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input value={ctrlEbike} onChange={e=>setCtrlEbike(e.target.value)} placeholder="E-bike Number" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
          <div className="flex items-center gap-2">
            <button onClick={onUnlock} disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">{busy ? 'Processing...' : 'Unlock'}</button>
            <button onClick={onFind} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-indigo-700 disabled:opacity-50">{busy ? 'Processing...' : 'Find'}</button>
            <button onClick={onPosition} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-violet-700 disabled:opacity-50">{busy ? 'Processing...' : 'Position'}</button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-600">User ID</div>
            <input value={userId} onChange={e=>setUserId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600">Unlock Parameter</div>
            <input value={unlockParam} onChange={e=>setUnlockParam(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-slate-600">Find: Rings</div>
              <input value={findRings} onChange={e=>setFindRings(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200" />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600">Find: Reserve</div>
              <input value={findReserve} onChange={e=>setFindReserve(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200" />
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-4 grid gap-2">
            <div className={`rounded-xl ${result.ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-800' : 'bg-rose-50 ring-rose-200 text-rose-700'} p-3 text-sm ring-1`}>OK: {String(result.ok)} — Status: {result.status ?? '-'}</div>
            {result.request && (
              <div>
                <div className="text-xs font-medium text-slate-600">Request</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(result.request, null, 2)}</pre>
              </div>
            )}
            {result.response && (
              <div>
                <div className="text-xs font-medium text-slate-600">Response</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(result.response, null, 2)}</pre>
              </div>
            )}
            {result.raw && (
              <div>
                <div className="text-xs font-medium text-slate-600">Raw</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{String(result.raw)}</pre>
              </div>
            )}
            {result.error && (
              <div className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">{String(result.error)}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}





