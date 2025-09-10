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
      script.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
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

  return null;
}
