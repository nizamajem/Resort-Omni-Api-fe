import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat');
  const lng = req.nextUrl.searchParams.get('lng') || req.nextUrl.searchParams.get('lon');
  if (!lat || !lng) return new Response(JSON.stringify({ ok:false, error:'Missing lat/lng' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const base = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=14';
  const url = `${base}&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Gridwiz Resort Frontend' }, cache: 'no-store' });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return new Response(JSON.stringify({ ok:true, data: { displayName: json?.display_name, address: json?.address } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ ok:false, error:'Non-JSON from geocoder', raw: text.slice(0, 2000) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Fetch failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
