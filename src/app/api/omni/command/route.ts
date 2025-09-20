import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function envOr(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length) return v;
  }
  return undefined;
}

export async function POST(req: Request) {
  const base = (envOr("OMNI_BASE_URL", "NEXT_PUBLIC_OMNI_BASE_URL") || "https://api.gridwizapp.com").replace(/\/$/, "");
  const developerId = envOr("OMNI_DEVELOPER_ID", "NEXT_PUBLIC_OMNI_DEVELOPER_ID");
  const developerSecret = envOr("OMNI_DEVELOPER_SECRET", "NEXT_PUBLIC_OMNI_DEVELOPER_SECRET");

  if (!developerId || !developerSecret) {
    return NextResponse.json({ ok: false, error: "Missing developerId/developerSecret env" }, { status: 400 });
  }

  const incoming = await req.json().catch(() => ({}));
  const payload = { ...incoming };
  if (!payload.command) {
    return NextResponse.json({ ok: false, error: "Missing command in body" }, { status: 400 });
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const sign = crypto.createHmac("sha256", developerSecret).update(`${developerId}${ts}`).digest("hex");

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
    'X-Developer-Id': developerId,
    'X-Timestamp': ts,
    'X-Sign': sign,
  };

  const url = `${base}/prod-api/iot/api/v1/request`;
  let res: Response | null = null;
  let data: any = null;
  let raw: string | null = null;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      raw = await res.text().catch(() => null);
    }
    return NextResponse.json({ ok: res.ok, status: res.status, statusText: res.statusText, url, request: payload, response: data ?? undefined, raw: raw ?? undefined });
  } catch (e: any) {
    return NextResponse.json({ ok: false, url, error: e?.message || String(e), request: payload }, { status: 502 });
  }
}

