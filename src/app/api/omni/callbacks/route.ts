import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

function envOr(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length) return v;
  }
  return undefined;
}

function mask(val?: string) {
  if (!val) return undefined;
  if (val.length <= 6) return "***";
  return `${val.slice(0, 3)}***${val.slice(-3)}`;
}

export async function GET(req: Request) {
  const base = (envOr("OMNI_BASE_URL", "NEXT_PUBLIC_OMNI_BASE_URL") || "https://api.gridwizapp.com").replace(/\/$/, "");
  const developerId = envOr("OMNI_DEVELOPER_ID", "NEXT_PUBLIC_OMNI_DEVELOPER_ID");
  const developerSecret = envOr("OMNI_DEVELOPER_SECRET", "NEXT_PUBLIC_OMNI_DEVELOPER_SECRET");
  if (!developerId || !developerSecret) {
    return NextResponse.json({ ok: false, error: "Missing developer env" }, { status: 400 });
  }

  const u = new URL(req.url);
  const path = (u.searchParams.get('path') || '/prod-api/iot/api/v1/callback/list').replace(/^\//, '');
  const upstream = new URL(`${base}/${path}`);
  // Pass-through known filters
  ['from','to','page','size','limit','offset'].forEach((k) => {
    const v = u.searchParams.get(k);
    if (v) upstream.searchParams.set(k, v);
  });

  const ts = Math.floor(Date.now()/1000).toString();
  const sign = await (async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(developerSecret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${developerId}${ts}`));
    const bytes = new Uint8Array(sig);
    return Array.from(bytes).map((b)=>b.toString(16).padStart(2,'0')).join('');
  })();

  const headers: Record<string,string> = {
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    'X-Developer-Id': developerId,
    'X-Timestamp': ts,
    'X-Sign': sign,
  };

  let res: Response | null = null;
  try {
    res = await fetch(upstream.toString(), { method: 'GET', headers });
    const ct = res.headers.get('content-type') || '';
    let body: any = null;
    let raw: string | undefined = undefined;
    if (ct.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      raw = await res.text().catch(() => undefined);
    }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: upstream.toString(),
      headersSent: { 'X-Developer-Id': mask(developerId), 'X-Timestamp': ts, 'X-Sign': mask(sign) },
      body: body ?? undefined,
      raw,
    }, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, url: upstream.toString(), error: e?.message || String(e) }, { status: 502 });
  }
}

