import { NextRequest } from 'next/server';

// Simple server-side image proxy to bypass hosts that block hotlinking
// Usage: /api/image-proxy?url=<encoded image url>
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url', { status: 400 });
  try {
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return new Response(`Upstream ${upstream.status}: ${text?.slice(0, 200)}`, { status: 502 });
    }
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    const buf = await upstream.arrayBuffer();
    return new Response(Buffer.from(buf), {
      status: 200,
      headers: {
        'Content-Type': ct,
        // Allow short caching to reduce load but keep fresh
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e: any) {
    return new Response(e?.message || 'Proxy error', { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

