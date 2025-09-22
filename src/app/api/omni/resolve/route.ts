import { NextRequest } from 'next/server';

function getBackendApiBase() {
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

export async function GET(req: NextRequest) {
  const ebike = req.nextUrl.searchParams.get('ebike') || '';
  const url = getBackendApiBase() + '/iot/omni/resolve?ebike=' + encodeURIComponent(ebike);
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Resolve failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
