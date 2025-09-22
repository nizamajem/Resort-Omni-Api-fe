import { NextRequest } from 'next/server';

function getBackendApiBase() {
  // Strong default for dev: prefer local backend
  const internal = (process.env.NEXT_INTERNAL_API_BASE_URL || '').trim();
  if (internal) return internal.replace(/\/$/, '') + '/api';
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:4000/api';
  }
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

async function forward(req: NextRequest) {
  const backend = getBackendApiBase();
  const path = req.nextUrl.pathname.replace(/^\/api\/backend/, '');
  const url = backend + path + (req.nextUrl.search || '');
  const method = req.method || 'GET';

  let body: string | undefined = undefined;
  try {
    if (method !== 'GET' && method !== 'HEAD') body = await req.text();
  } catch {}

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'connection' || lk === 'content-length') return;
    headers.set(k, v);
  });
  // Bypass ngrok interstitial page that returns HTML with 200 OK
  try {
    const host = new URL(url).host;
    if (/ngrok-free\.app$/i.test(host) || /ngrok\.io$/i.test(host)) {
      headers.set('ngrok-skip-browser-warning', '1');
    }
  } catch {}

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    const ct = res.headers.get('content-type') || 'application/json; charset=utf-8';
    return new Response(text, { status: res.status, headers: { 'Content-Type': ct } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Proxy fetch failed', url }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function GET(req: NextRequest) { return forward(req); }
export async function POST(req: NextRequest) { return forward(req); }
export async function PUT(req: NextRequest) { return forward(req); }
export async function PATCH(req: NextRequest) { return forward(req); }
export async function DELETE(req: NextRequest) { return forward(req); }
export async function OPTIONS() { return new Response(null, { status: 204 }); }

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
