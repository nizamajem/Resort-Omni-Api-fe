"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    const existing = document.getElementById("midtrans-snapjs");
    if (!existing) {
      const script = document.createElement("script");
      const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
      script.id = "midtrans-snapjs";
      script.src = isProd
        ? "https://app.midtrans.com/snap/snap.js"
        : "https://app.sandbox.midtrans.com/snap/snap.js";
      script.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (token && window.snap?.pay) {
      window.snap.pay(token, {
        onSuccess,
        onPending,
        onError,
        onClose,
      });
    }
  }, [token, onSuccess, onPending, onError, onClose]);

  return null;
}

