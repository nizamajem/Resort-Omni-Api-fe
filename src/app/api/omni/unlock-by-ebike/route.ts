import { NextRequest } from 'next/server';

function getBackendApiBase() {
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

export async function POST(req: NextRequest) {
  const url = getBackendApiBase() + '/iot/omni/unlock-by-ebike';
  const body = await req.text();
  try {
    const res = await fetch(url, { method:'POST', headers: { 'Content-Type': 'application/json' }, body });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Unlock failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
