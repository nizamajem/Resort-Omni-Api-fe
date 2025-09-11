import axios from "axios";

function getBase() {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  const base = raw.replace(/\/$/, "");
  return `${base}/api`;
}

export const api = axios.create({
  baseURL: getBase(),
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  try {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (t && t.trim()) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${t}`;
    }
  } catch {}
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
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