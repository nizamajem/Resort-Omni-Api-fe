import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url', { status: 400 });
  try {
    const res = await fetch(url, {
      // Avoid cookies; set a UA some providers expect
      headers: { 'User-Agent': 'Mozilla/5.0 (+https://gridwizapp.com)' },
      cache: 'no-store',
      // @ts-ignore
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const buf = await res.arrayBuffer();
    return new Response(Buffer.from(buf), { status: res.status, headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } });
  } catch (e: any) {
    return new Response('Failed to fetch image: ' + (e?.message || String(e)), { status: 502 });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
