"use client";

import { useEffect, useRef, useState } from "react";

type SnapInitOptions = {
  token: string;
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options?: Record<string, unknown>) => void;
    };
  }
}

export default function MidtransPopup({ token, onSuccess, onPending, onError, onClose }: SnapInitOptions) {
  const [ready, setReady] = useState<boolean>(false);
  const paidRef = useRef<string | null>(null);

  // Load Snap JS and mark ready when available
  useEffect(() => {
    const ensureReady = () => {
      if (typeof window !== 'undefined' && window.snap && typeof window.snap.pay === 'function') {
        setReady(true);
      }
    };

    let script = document.getElementById("midtrans-snapjs") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
      script.id = "midtrans-snapjs";
      script.src = isProd
        ? "https://app.midtrans.com/snap/snap.js"
        : "https://app.sandbox.midtrans.com/snap/snap.js";
      const clientKey = isProd
        ? (process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY_PRODUCTION || "")
        : (process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY_SANDBOX || "");
      script.setAttribute("data-client-key", clientKey);
      script.onload = ensureReady;
      document.body.appendChild(script);
    } else {
      // If script already present, poll briefly until snap is ready
      ensureReady();
      if (!ready) {
        const id = window.setInterval(() => {
          ensureReady();
          if (window.snap) window.clearInterval(id);
        }, 50);
        // Safety timeout
        window.setTimeout(() => window.clearInterval(id), 3000);
      }
    }
  }, [ready]);

  // Invoke Snap pay when ready and token provided (once per token)
  useEffect(() => {
    if (!token || !ready) return;
    if (paidRef.current === token) return; // avoid double-open for same token
    if (typeof window === 'undefined' || !window.snap?.pay) return;
    paidRef.current = token;
    window.snap.pay(token, {
      onSuccess,
      onPending,
      onError,
      onClose,
    });
  }, [token, ready, onSuccess, onPending, onError, onClose]);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/30">
      <div className="w-[90%] max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl ring-1 ring-slate-200">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M6 4.5h12A2.25 2.25 0 0 1 20.25 6.75v10.5A2.25 2.25 0 0 1 18 19.5H6A2.25 2.25 0 0 1 3.75 17.25V6.75A2.25 2.25 0 0 1 6 4.5Z"/></svg>
        </div>
        <div className="text-lg font-semibold text-slate-900">Opening Payment</div>
        <div className="mt-1 text-sm text-slate-600">Midtrans Snap is being prepared...</div>
        <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
          Please wait a moment
        </div>
      </div>
    </div>
  );
}
