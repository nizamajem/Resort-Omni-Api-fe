"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/app/lib/api";

export default function OmniCallbacksPage() {
  const [payload, setPayload] = useState<string>(() => JSON.stringify({
    deviceId: "bike-1",
    status: "unlocked",
    gps: "-6.2,106.8",
    battery: 82,
  }, null, 2));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(() => {
    const base = (api.defaults.baseURL || "").replace(/\/$/, "");
    return base ? `${base}/iot/omni/callback` : "/api/iot/omni/callback";
  }, []);

  const onSend = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const body = JSON.parse(payload);
      const res = await api.post("/iot/omni/callback", body);
      setResult(res.data);
    } catch (e: any) {
      setError(e?.message || "Failed to send callback");
    }
    setSending(false);
  };

  const setSample = (name: string) => {
    if (name === 'unlock') {
      setPayload(JSON.stringify({ deviceId: "bike-1", status: "unlocked", gps: "-6.2,106.8", battery: 82 }, null, 2));
    } else if (name === 'lock') {
      setPayload(JSON.stringify({ deviceId: "bike-1", status: "locked", gps: "-6.2,106.8", battery: 80 }, null, 2));
    } else if (name === 'gps') {
      setPayload(JSON.stringify({ deviceId: "bike-1", event: "gps", lat: -6.2001, lon: 106.8167, speed: 2.3 }, null, 2));
    } else if (name === 'battery') {
      setPayload(JSON.stringify({ deviceId: "bike-1", event: "battery", percent: 78, voltage: 3.9 }, null, 2));
    }
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
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OMNI Callbacks</h1>
              <p className="text-sm text-slate-600">Kirim payload test ke endpoint webhook untuk debugging.</p>
            </div>
          </div>
          <a href="/admin/settings/omni/logs" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">View Logs</a>
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
          Webhook URL: <span className="font-mono break-all">{callbackUrl}</span>
          {!callbackUrl.includes("ngrok") && (
            <div className="mt-1 text-amber-700">Hint: gunakan URL ngrok (set NEXT_PUBLIC_API_BASE_URL) agar dapat menerima callback dari internet.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setSample('unlock')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">Sample: Unlock</button>
          <button onClick={() => setSample('lock')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">Sample: Lock</button>
          <button onClick={() => setSample('gps')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">Sample: GPS</button>
          <button onClick={() => setSample('battery')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">Sample: Battery</button>
        </div>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className="h-64 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        />
        <div className="flex items-center gap-2">
          <button onClick={onSend} disabled={sending} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 disabled:opacity-50">{sending ? 'Sending...' : 'Send Test Callback'}</button>
          <a href="/admin/settings/omni/logs" className="text-sm text-sky-700 underline">Lihat logs</a>
        </div>
        {error && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
        )}
        {result && (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-1 text-sm font-semibold text-slate-800">Response</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </section>
    </div>
  );
}

