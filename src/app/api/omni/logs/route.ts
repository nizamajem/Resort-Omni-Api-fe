import { NextRequest } from 'next/server';

function getBackendApiBase() {
  const rawA = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const rawB = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const chosen = rawA || rawB || 'http://localhost:4000';
  return chosen.replace(/\/$/, '') + '/api';
}

export async function GET(_req: NextRequest) {
  const url = getBackendApiBase() + '/iot/omni/logs';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Non-JSON from backend', raw: text.slice(0, 2000) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Failed to fetch logs' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

