import axios from "axios";

function getBase() {
  // Prefer same-origin proxy in dev to avoid CORS
  if ((process.env.NEXT_ENABLE_API_PROXY || '').trim() === '1' || process.env.NODE_ENV !== 'production') {
    return '/api/backend';
  }
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  const chosen = rawA || rawB;
  if (chosen) {
    const base = chosen.replace(/\/$/, "");
    return `${base}/api`;
  }
  // Fallback to local dev backend
  return "http://localhost:4000/api";
}

export const api = axios.create({
  baseURL: getBase(),
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
});

// Simple client-side API logger for diagnostics
declare global {
  interface Window { __apiLogs?: any[] }
}
try { if (typeof window !== 'undefined' && !window.__apiLogs) window.__apiLogs = []; } catch {}

api.interceptors.request.use((config) => {
  try {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (t && t.trim()) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${t}`;
    }
    // Log request
    try {
      if (typeof window !== 'undefined') {
        window.__apiLogs = window.__apiLogs || [];
        window.__apiLogs.push({
          ts: new Date().toISOString(),
          dir: 'request',
          url: `${config.baseURL || ''}${config.url || ''}`,
          method: (config.method || 'GET').toUpperCase(),
          body: config.data || null,
        });
      }
    } catch {}
  } catch {}
  return config;
});

api.interceptors.response.use(
  (res) => {
    try {
      if (typeof window !== 'undefined') {
        window.__apiLogs = window.__apiLogs || [];
        window.__apiLogs.push({
          ts: new Date().toISOString(),
          dir: 'response',
          url: res?.config ? `${res.config.baseURL || ''}${res.config.url || ''}` : '',
          status: res?.status,
          ok: true,
          body: res?.data,
        });
      }
    } catch {}
    return res;
  },
  (err) => {
    try {
      if (typeof window !== 'undefined') {
        const cfg = err?.config;
        window.__apiLogs = window.__apiLogs || [];
        window.__apiLogs.push({
          ts: new Date().toISOString(),
          dir: 'response',
          url: cfg ? `${cfg.baseURL || ''}${cfg.url || ''}` : '',
          status: err?.response?.status,
          ok: false,
          body: err?.response?.data,
          error: err?.message,
        });
      }
    } catch {}
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("auth");
        localStorage.removeItem("role");
        if (typeof document !== "undefined") {
          document.cookie = `token=; Path=/; Max-Age=0`;
          document.cookie = `role=; Path=/; Max-Age=0`;
          document.cookie = `resortName=; Path=/; Max-Age=0`;
        }
      } catch {}
      if (typeof window !== "undefined") window.location.replace("/");
    }
    return Promise.reject(err);
  }
);
