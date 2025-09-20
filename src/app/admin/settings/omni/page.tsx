"use client";

import { useMemo, useState } from "react";
import { buildDummySignature, dummyConnectivityCheck, getOmniEnv, liveConnectivityTest } from "@/app/lib/omni";

export default function OmniSettingsPage() {
  const env = useMemo(() => getOmniEnv(), []);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [live, setLive] = useState<any | null>(null);
  const [ts, setTs] = useState<string>(() => Math.floor(Date.now()/1000).toString());
  const [devLoading, setDevLoading] = useState(false);
  const [devices, setDevices] = useState<any | null>(null);

  const onTest = async () => {
    setLoading(true);
    const r = await dummyConnectivityCheck(env);
    setResult(r);
    setLoading(false);
  };

  const onLive = async () => {
    setLiveLoading(true);
    setLive(null);
    try {
      const r = await liveConnectivityTest(env);
      setLive(r);
    } catch (e: any) {
      setLive({ ok: false, error: e?.message || String(e) });
    }
    setLiveLoading(false);
  };

  const demoSign = useMemo(() => {
    return buildDummySignature(env.developerId || "", env.developerSecret || "", ts);
  }, [env.developerId, env.developerSecret, ts]);

  const onFetchDevices = async () => {
    setDevLoading(true);
    setDevices(null);
    try {
      const r = await fetch('/api/omni/devices');
      const txt = await r.text();
      let data: any = null;
      try { data = JSON.parse(txt); } catch (e:any) { data = { ok:false, error: 'Invalid JSON from proxy', raw: txt }; }
      setDevices(data);
    } catch (e: any) {
      setDevices({ ok: false, error: e?.message || String(e) });
    }
    setDevLoading(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9"/></svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI API Connecting</h1>
            <p className="text-sm text-slate-600">Frontend-only setup with dummy test. Backend remains unchanged.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Base URL" value={env.baseUrl} secret={false} placeholder="https://api.gridwizapp.com" />
          <Field label="Developer ID" value={env.developerId} secret={false} placeholder="DEVELOPER_ID" />
          <Field label="Developer Secret" value={env.developerSecret} secret placeholder="DEVELOPER_SECRET" />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={onTest} disabled={loading} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">
            {loading ? 'Testing...' : 'Run Dummy Connectivity Test'}
          </button>
          <a href="/admin/settings" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Back</a>
        </div>

        {result && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-800 ring-1 ring-slate-200">
            <div className="mb-2 font-semibold">Dummy Result</div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between"><span className="text-slate-600">OK</span><span className="font-medium">{String(result.ok)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Checked at</span><span className="font-medium">{result.checkedAt}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Base URL</span><span className="font-medium">{result.url}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Note</span><span className="font-medium">{result.note}</span></div>
            </div>
            <div className="mt-3">
              <div className="text-xs font-medium text-slate-600">Sample Request</div>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(result.sampleRequest, null, 2)}</pre>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Live Connectivity Test</div>
        <div className="flex items-center gap-2">
          <button onClick={onLive} disabled={liveLoading} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:opacity-50">
            {liveLoading ? 'Testing (Direct)...' : 'Direct to api.gridwizapp.com'}
          </button>
          <button onClick={async()=>{ setLiveLoading(true); setLive(null); try { const r = await fetch('/api/omni/ping').then(r=>r.json()); setLive(r); } catch(e:any){ setLive({ ok:false, error: e?.message||String(e) }); } setLiveLoading(false); }} disabled={liveLoading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-indigo-700 disabled:opacity-50">
            {liveLoading ? 'Testing (Proxy)...' : 'Via Server Proxy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">Direct akan terkena CORS bila server tidak mengizinkan browser. Via Server Proxy melewati CORS karena request dilakukan di server Next.js (masih dalam repo FE, tidak mengubah resort-be).</p>
        {live && (
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="grid gap-1">
                <div className="flex items-center justify-between"><span className="text-slate-600">OK</span><span className="font-medium">{String(live.ok)}</span></div>
                {typeof live.corsBlocked !== 'undefined' && (
                  <div className="flex items-center justify-between"><span className="text-slate-600">CORS Blocked</span><span className="font-medium">{String(live.corsBlocked)}</span></div>
                )}
                <div className="flex items-center justify-between"><span className="text-slate-600">Status</span><span className="font-medium">{live.status || 0} {live.statusText || ''}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">URL</span><span className="font-medium break-all">{live.url}</span></div>
              </div>
              {live.error && (
                <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">{String(live.error)}</div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600">Headers Sent</div>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(live.headersSent, null, 2)}</pre>
            </div>
            {live.body && (
              <div>
                <div className="text-xs font-medium text-slate-600">Response Body</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{typeof live.body === 'string' ? live.body : JSON.stringify(live.body, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Signature Playground (Dummy)</div>
        <p className="text-sm text-slate-600">Contoh perhitungan signature: HMAC-SHA256(developerId + timestamp, developerSecret). Untuk produksi, lakukan di backend.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Developer ID</label>
            <input readOnly value={env.developerId || ''} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Developer Secret</label>
            <input readOnly value={(env.developerSecret || '').replace(/./g,'•')} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Timestamp (sec)</label>
            <input value={ts} onChange={(e)=>setTs(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-xs font-medium text-slate-600">Dummy Signature</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs ring-1 ring-slate-200">{demoSign}</pre>
        </div>
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Multiple device information query</div>
          <button onClick={onFetchDevices} disabled={devLoading} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">
            {devLoading ? 'Fetching...' : 'Fetch Device List'}
          </button>
        </div>
        <p className="text-xs text-slate-600">Memanggil <span className="font-mono">GET /prod-api/iot/api/v1/param/list/{'{secretKey}'}</span> via server proxy menggunakan Developer secret.</p>
        {devices && (
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="grid gap-1">
                <div className="flex items-center justify-between"><span className="text-slate-600">OK</span><span className="font-medium">{String(devices.ok)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Status</span><span className="font-medium">{devices.status || 0} {devices.statusText || ''}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">URL</span><span className="font-medium break-all">{devices.url}</span></div>
                {devices.contentType && (
                  <div className="flex items-center justify-between"><span className="text-slate-600">Content-Type</span><span className="font-medium">{devices.contentType}</span></div>
                )}
              </div>
            </div>
            {Array.isArray(devices?.body) && devices.body.length > 0 ? (
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">equipmentId</th>
                      <th className="px-3 py-2 font-medium">deviceNo</th>
                      <th className="px-3 py-2 font-medium">name</th>
                      <th className="px-3 py-2 font-medium">status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.body.map((d:any, i:number) => (
                      <tr key={d.id || d.equipmentId || i} className="odd:bg-white even:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800">{i+1}</td>
                        <td className="px-3 py-2 text-slate-800">{d.equipmentId ?? d.id ?? '-'}</td>
                        <td className="px-3 py-2 text-slate-800">{d.deviceNo ?? d.imei ?? '-'}</td>
                        <td className="px-3 py-2 text-slate-800">{d.name ?? d.deviceName ?? '-'}</td>
                        <td className="px-3 py-2 text-slate-800">{String(d.status ?? d.online ?? '-') }</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <div className="text-xs font-medium text-slate-600">Raw Result</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{JSON.stringify(devices, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Where to find IDs & keys</div>
        <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
          <li>Login ke OMNI IOT Platform dengan akun Anda.</li>
          <li>Buka menu Developer → Developer untuk melihat <span className="font-medium">Developer ID</span> dan <span className="font-medium">Developer Secret</span>.</li>
          <li>Gunakan Base URL: <span className="font-mono">https://api.gridwizapp.com</span>.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">Catatan: Jangan menaruh secret asli pada variabel NEXT_PUBLIC di produksi. Untuk produksi, lakukan signing & request melalui backend.</p>
      </section>
    </div>
  );
}

function Field({ label, value, secret, placeholder }: { label: string; value?: string; secret?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input readOnly value={secret ? (value ? value.replace(/./g,'•') : '') : (value || '')} placeholder={placeholder} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-1 ring-slate-200" />
    </div>
  );
}
