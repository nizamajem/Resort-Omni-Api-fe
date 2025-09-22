"use client";

import { useState } from 'react';

export default function GridwizLoginPage() {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ebike, setEbike] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const onVerify = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setChecking(true); setVerified(null); setError(null);
    try {
      const res = await fetch('/api/credentials/verify?code=' + encodeURIComponent(c), { cache: 'no-store' });
      const txt = await res.text();
      let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt }; }
      if (data?.ok && data?.data?.status === 'active') setVerified(data.data); else setError(data?.error || 'Kode tidak valid / sudah expired');
    } catch (e: any) { setError(e?.message || String(e)); }
    setChecking(false);
  };

  const onUnlock = async () => {
    if (!verified?.userId || !ebike.trim()) return;
    setBusy(true); setResult(null); setError(null);
    try {
      const res = await fetch('/api/omni/unlock-by-ebike', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ebikeNumber: ebike.trim(), userId: verified.userId, unlockParameter: '0' }) });
      const txt = await res.text(); let data: any = null; try { data = JSON.parse(txt); } catch { data = { ok:false, error:'Invalid JSON', raw: txt }; }
      setResult(data);
    } catch (e:any) { setError(e?.message || String(e)); }
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Gridwiz Login via Kode</h1>
      <p className="text-sm text-slate-600">Masukkan kode yang diberikan resort. Jika aktif, Anda bisa input nomor sepeda untuk membuka kunci.</p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="Masukkan kode" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg tracking-widest uppercase ring-1 ring-slate-200" />
          <button onClick={onVerify} disabled={checking} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:opacity-50">{checking ? 'Memeriksa...' : 'Verifikasi'}</button>
        </div>
        {error && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
        {verified && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">Kode aktif</div>
            <div className="mt-1 text-xs text-slate-600">Resort: {verified.resortName || '-'}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={ebike} onChange={(e)=>setEbike(e.target.value)} placeholder="Masukkan nomor E-bike" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-1 ring-slate-200" />
              <button onClick={onUnlock} disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">{busy ? 'Memproses...' : 'Unlock'}</button>
            </div>
            {result && (
              <div className={`mt-3 rounded-lg p-2 text-xs ring-1 ${result.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>OK: {String(result.ok)}{result.error ? ` - ${result.error}` : ''}</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

