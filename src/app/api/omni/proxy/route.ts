import { NextRequest } from 'next/server';

function getBackendApiBase() {
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

async function forward(req: NextRequest) {
  const backend = getBackendApiBase();
  const target = backend + '/iot/omni';
  const method = req.method || 'POST';

  // Read raw body as text to preserve JSON/form payloads
  let body: string | undefined = undefined;
  try { body = await req.text(); } catch {}

  // Forward headers (preserve content-type, but drop host/connection)
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'connection' || lk === 'content-length') return;
    headers.set(k, v);
  });

  try {
    const res = await fetch(target, { method, headers, body });
    const text = await res.text();
    return new Response(text || '1', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (e: any) {
    return new Response('0', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

export async function POST(req: NextRequest) {
  return forward(req);
}

export async function PUT(req: NextRequest) {
  return forward(req);
}

export async function PATCH(req: NextRequest) {
  return forward(req);
}

export async function DELETE(req: NextRequest) {
  return forward(req);
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

