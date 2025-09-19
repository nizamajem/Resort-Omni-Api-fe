"use client";

import { useEffect, useRef, useState } from "react";

type MidtransMode = "sandbox" | "production";

type SnapInitOptions = {
  token: string;
  mode?: MidtransMode;
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};

const SNAP_SCRIPT_ID = "midtrans-snapjs";

const resolveClientKey = (mode: MidtransMode): string => {
  if (mode === "production") {
    return (
      process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY_PRODUCTION ||
      process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ||
      ""
    );
  }
  return (
    process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY_SANDBOX ||
    process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ||
    ""
  );
};

const resolveScriptSrc = (mode: MidtransMode): string =>
  mode === "production"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options?: Record<string, unknown>) => void;
    };
  }
}

export default function MidtransPopup({ token, mode, onSuccess, onPending, onError, onClose }: SnapInitOptions) {
  const resolvedMode: MidtransMode = mode ?? (process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true' ? 'production' : 'sandbox');
  const [ready, setReady] = useState(false);
  const paidRef = useRef<string | null>(null);

  useEffect(() => {
    const desiredMode = resolvedMode;
    const ensureReady = () => {
      if (typeof window !== "undefined" && window.snap && typeof window.snap.pay === "function") {
        setReady(true);
      }
    };

    let script = document.getElementById(SNAP_SCRIPT_ID) as HTMLScriptElement | null;

    if (script && script.getAttribute("data-midtrans-mode") !== desiredMode) {
      script.remove();
      if (typeof window !== "undefined") {
        try {
          window.snap = undefined;
        } catch {
          // ignore
        }
      }
      script = null;
      setReady(false);
      paidRef.current = null;
    }

    if (!script) {
      const newScript = document.createElement("script");
      newScript.id = SNAP_SCRIPT_ID;
      newScript.src = resolveScriptSrc(desiredMode);
      newScript.setAttribute("data-midtrans-mode", desiredMode);
      const clientKey = resolveClientKey(desiredMode);
      if (!clientKey) {
        console.warn('Midtrans client key missing for mode', desiredMode);
      }
      newScript.setAttribute("data-client-key", clientKey);
      newScript.onload = ensureReady;
      document.body.appendChild(newScript);
    } else {
      ensureReady();
      if (!ready) {
        const id = window.setInterval(() => {
          ensureReady();
          if (window.snap) window.clearInterval(id);
        }, 50);
        window.setTimeout(() => window.clearInterval(id), 3000);
      }
    }
  }, [resolvedMode, ready]);

  useEffect(() => {
    if (!token || !ready) return;
    if (paidRef.current === token) return;
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
