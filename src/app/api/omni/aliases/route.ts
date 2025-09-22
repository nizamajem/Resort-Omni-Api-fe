import { NextRequest } from 'next/server';

function getBackendApiBase() {
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

export async function GET(_req: NextRequest) {
  const url = getBackendApiBase() + '/iot/omni/aliases';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    try { return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    catch { return new Response(JSON.stringify({ ok:false, error:'Backend not json', raw: txt.slice(0, 2000) }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Fetch failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function POST(req: NextRequest) {
  const url = getBackendApiBase() + '/iot/omni/aliases';
  const body = await req.text();
  try {
    const res = await fetch(url, { method:'POST', headers: { 'Content-Type': 'application/json' }, body });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Post failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  const url = getBackendApiBase() + '/iot/omni/aliases' + (req.nextUrl.search || '');
  try {
    const res = await fetch(url, { method:'DELETE' });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Delete failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
