"use client";

import { useEffect, useMemo, useState } from "react";
import MidtransPopup from "@/app/components/midtrans.popup";

type Pkg = { id: "1h" | "3h" | "1d"; title: string; desc: string; price: number; unit: string };

export default function DashboardPage() {
  const packages = useMemo<Pkg[]>(
    () => [
      { id: "1h", title: "1 Hour", desc: "Perfect for short city rides.", price: 50000, unit: "hour" },
      { id: "3h", title: "3 Hours", desc: "Explore more with extra time.", price: 100000, unit: "3 hours" },
      { id: "1d", title: "1 Day", desc: "Full day adventure on e-bike.", price: 200000, unit: "day" },
    ],
    []
  );

  const [detailFor, setDetailFor] = useState<Pkg | null>(null);
  const [orderFor, setOrderFor] = useState<Pkg | null>(null);
  const [methodChoiceOpen, setMethodChoiceOpen] = useState(false);
  const [confirmOnlineOpen, setConfirmOnlineOpen] = useState(false);
  const [confirmCashOpen, setConfirmCashOpen] = useState(false);
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  const [availability, setAvailability] = useState<{ '1h': number; '3h': number; '1d': number } | null>(null);

  // Backend base URL
  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  // Auth info (token + resort name)
  const [token, setToken] = useState<string | null>(null);
  const [resortName, setResortName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // Prefer localStorage token; fallback to cookie if present
  const readToken = () => {
    try {
      const ls = localStorage.getItem("token");
      if (ls && ls.trim()) return ls;
      const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )token=([^;]+)/) : null;
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    try {
      setToken(readToken());
      const raw = localStorage.getItem("auth");
      const auth = raw ? JSON.parse(raw) : null;
      setResortName(auth?.resortName || "");
      setUserEmail(auth?.email || "");
    } catch {}

    const onStorage = () => setToken(readToken());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Fetch availability of active accounts per package
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/orders/availability`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === 'object') setAvailability(data);
      } catch {}
    };
    run();
  }, [API_BASE, token]);

  const canOrder = (id: Pkg["id"]) => {
    if (!availability) return true; // optimistic until fetched
    return (availability[id] || 0) > 0;
  };

  

  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const onDetail = (p: Pkg) => {
    setDetailFor(p);
  };

  const onOrder = (p: Pkg) => {
    setOrderFor(p);
    setMethodChoiceOpen(true);
  };

  const orderCash = async () => {
    if (!orderFor) return;
    setMethodChoiceOpen(false);
    setConfirmCashOpen(false);
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/orders/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          pkg: orderFor.id,
          packageName: orderFor.title,
          price: orderFor.price,
          duration: orderFor.unit,
          resortName: resortName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setResultMsg(data?.error || "Failed to record cash order.");
      } else {
        const c = data?.credential;
        if (c?.email && c?.password) {
          setCred({ email: c.email, password: c.password });
          setResultMsg(null);
        } else {
          setResultMsg("Order recorded. Credentials will be sent via email.");
        }
      }
    } catch {
      setResultMsg("Failed to record cash order.");
    } finally {
      setProcessing(false);
    }
  };

  const orderOnline = async () => {
    if (!orderFor) return;
    setMethodChoiceOpen(false);
    setConfirmOnlineOpen(false);
    setProcessing(true);
    try {
      const orderId = `ORDER-${orderFor.id}-${Date.now()}`;
      setLastOrderId(orderId);
      const snapReq = {
        transaction_details: { order_id: orderId, gross_amount: orderFor.price },
        item_details: [
          { id: orderFor.id, price: orderFor.price, quantity: 1, name: `${orderFor.title} (${orderFor.unit})` },
        ],
        customer_details: { first_name: resortName || "Resort", email: userEmail || "demo@example.com" },
        credit_card: { secure: true },
      };
      const res = await fetch("/api/midtrans/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapReq) });
      const text = await res.text();
      if (!res.ok) {
        // Show server error details from route for easier debugging
        let detail = "";
        try { const j = JSON.parse(text); detail = typeof j?.error === 'string' ? j.error : text; } catch { detail = text; }
        setResultMsg(`Online payment initialization failed. ${detail ? `\nDetail: ${detail}` : ''}`.trim());
        return;
      }
      let data: any = null;
      try { data = JSON.parse(text); } catch {}
      if (!data?.token) {
        setResultMsg("Online payment initialization failed. Detail: Missing token from server.");
        return;
      }
      setSnapToken(data.token);
      setSnapOpen(true);
    } catch {
      setResultMsg("Online payment initialization failed.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-tr from-sky-50 to-emerald-50 p-[1px] shadow-sm">
        <div className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z"/></svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-600">Choose a package and complete checkout with cash or online payment.</p>
          </div>
        </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <article key={p.id} className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{p.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{p.desc}</p>
              </div>
              <div className="h-10 w-10 grid place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 19.5l3-9h4.5m0 0L18 6h-3m1.5 4.5 3 3"/></svg>
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <div className="text-2xl font-bold text-slate-900">{fmt(p.price)}</div>
              <div className="text-sm text-slate-500">/ {p.unit}</div>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Includes {fmt(p.price)} Reflow balance
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => onDetail(p)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Detail</button>
              <button
                onClick={() => onOrder(p)}
                disabled={!canOrder(p.id)}
                className={`h-11 flex-1 rounded-xl px-4 text-sm font-medium shadow-sm transition ${
                  canOrder(p.id)
                    ? "bg-sky-500 text-white hover:bg-sky-600"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed"
                }`}
                title={canOrder(p.id) ? "Order" : "Unavailable: no active account"}
              >
                {canOrder(p.id) ? "Order" : "Unavailable"}
              </button>
            </div>
          </article>
        ))}
      </section>

      {resultMsg && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 ring-1 ring-emerald-200">{resultMsg}</div>
      )}

      {/* Detail modal */}
      {detailFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailFor(null)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">{detailFor.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{detailFor.desc}</p>

            <div className="mt-4 rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-800">What you get</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>{fmt(detailFor.price)} Reflow balance to kickstart your rides</li>
                <li>Welcome coupon: extra 10 minutes on your first ride</li>
                <li>Free battery swaps during your rental period</li>
                <li>First 1 minute free to check the bike (brakes, tires, handlebar, etc.)</li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-800">Friendly terms</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>Please install the Reflow app to unlock and use the bike.</li>
                <li>Only end your ride when you are truly finished. Ending early may prevent re‑unlocking in the same session.</li>
                <li>Taking a break? Use Pause mode and lock the bike securely (e.g., at a cafe or stop point).</li>
                <li>Overtime is flexible: if you exceed the rental time, an additional IDR 30,000 applies for each started 30‑minute block. These extra fees are calculated after you return the e‑bike.</li>
              </ol>
            </div>

            <div className="mt-4 text-slate-700">Price: <span className="font-semibold">{fmt(detailFor.price)}</span> / {detailFor.unit}</div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDetailFor(null)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Close</button>
              <button onClick={() => { setDetailFor(null); onOrder(detailFor); }} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment choice modal */}
      {orderFor && methodChoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMethodChoiceOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Choose Payment Method</h3>
            <p className="mt-1 text-sm text-slate-600">{orderFor.title} • {fmt(orderFor.price)} / {orderFor.unit}</p>
            <div className="mt-4 grid gap-3">
              <button onClick={() => { setMethodChoiceOpen(false); setConfirmCashOpen(true); }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cash (Pay on site)</button>
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">Online payment available: QRIS/VA/CC ({process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true' ? 'Midtrans Production' : 'Midtrans Sandbox'})</div>
              <button onClick={() => { setMethodChoiceOpen(false); setConfirmOnlineOpen(true); }} className="h-11 w-full rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Online Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cash modal */}
      {orderFor && confirmCashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmCashOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Cash Order</h3>
            <p className="mt-2 text-sm text-slate-600">
              This order will be recorded in our system.
              Please confirm you would like to proceed with cash payment for {orderFor.title} ({fmt(orderFor.price)}).
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={orderCash} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Yes, proceed</button>
              <button onClick={() => setConfirmCashOpen(false)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Online modal */}
      {orderFor && confirmOnlineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOnlineOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Online Payment</h3>
            <p className="mt-2 text-sm text-slate-600">You can pay using ShopeePay, QRIS, GoPay, or Dana via {process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true' ? 'Midtrans (Production)' : 'Midtrans (Sandbox)'}.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-700 ring-1 ring-orange-200">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> ShopeePay
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> QRIS
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700 ring-1 ring-sky-200">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> GoPay
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700 ring-1 ring-indigo-200">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Dana
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Package</span>
                <span className="font-medium text-slate-900">{orderFor.title}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-600">Duration</span>
                <span className="font-medium text-slate-900">{orderFor.unit}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-600">Amount</span>
                <span className="font-semibold text-slate-900">{fmt(orderFor.price)}</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">You will be redirected to the Midtrans Snap popup to complete payment securely.</div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setConfirmOnlineOpen(false); orderOnline(); }} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Yes, continue</button>
              <button onClick={() => setConfirmOnlineOpen(false)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Midtrans Snap popup */}
      {snapOpen && snapToken && (
        <MidtransPopup
          token={snapToken}
          onSuccess={async () => {
            // Finalize payment to backend and fetch credentials
            if (!orderFor) { setResultMsg("Payment success."); setSnapOpen(false); setSnapToken(null); return; }
            try {
              const res = await fetch(`${API_BASE}/payments/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'include',
                body: JSON.stringify({
                  orderId: lastOrderId || `ORDER-${orderFor.id}-${Date.now()}`,
                  pkg: orderFor.id,
                  packageName: orderFor.title,
                  price: orderFor.price,
                  duration: orderFor.unit,
                  resortName: resortName || "",
                }),
              });
              const data = await res.json();
              const c = data?.credential;
              if (c?.email && c?.password) {
                setCred({ email: c.email, password: c.password });
                setResultMsg(null);
              } else {
                setResultMsg("Payment success.");
              }
            } catch {
              setResultMsg("Payment success.");
            } finally {
              setSnapOpen(false);
              setSnapToken(null);
            }
          }}
          onPending={() => { setResultMsg("Payment pending."); setSnapOpen(false); setSnapToken(null); }}
          onError={() => { setResultMsg("Payment failed."); setSnapOpen(false); setSnapToken(null); }}
          onClose={() => { setResultMsg("Payment window closed."); setSnapOpen(false); setSnapToken(null); }}
        />
      )}

      {/* Credential modal */}
      {cred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCred(null)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Credentials Ready</h3>
            </div>
            <p className="text-sm text-slate-600">Use these credentials to sign in on the Re:Flow app and start your ride.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">Email</label>
              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm ring-1 ring-slate-200">
                <span className="truncate pr-3 font-mono text-slate-900">{cred.email}</span>
                <button onClick={() => navigator.clipboard.writeText(cred.email)} className="rounded-lg border px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">Copy</button>
              </div>
              <label className="mt-2 block text-xs font-medium text-slate-600">Password</label>
              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm ring-1 ring-slate-200">
                <span className="truncate pr-3 font-mono text-slate-900">{cred.password}</span>
                <button onClick={() => navigator.clipboard.writeText(cred.password)} className="rounded-lg border px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">Copy</button>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-sky-50 p-3 text-xs text-sky-800 ring-1 ring-sky-200">
              Open the Re:Flow mobile app, tap Sign In, and paste the email & password above. You can change the password later in the app.
            </div>
            <div className="mt-5 text-xs text-slate-500">We also send these credentials to your registered contact email for convenience.</div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setCred(null)} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {processing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20">
          <div className="rounded-xl bg-white px-6 py-4 shadow ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-sm text-slate-700"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" /> Processing...</div>
          </div>
        </div>
      )}
      {!token && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-800 ring-1 ring-amber-200">
          You are not signed in. Please log in to place orders.
        </div>
      )}
    </div>
  );
}
