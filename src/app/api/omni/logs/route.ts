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
  const base = (envOr("OMNI_LOG_BASE_URL") || envOr("OMNI_BASE_URL", "NEXT_PUBLIC_OMNI_BASE_URL") || "https://api.gridwizapp.com").replace(/\/$/, "");
  const developerId = envOr("OMNI_DEVELOPER_ID", "NEXT_PUBLIC_OMNI_DEVELOPER_ID");
  const developerSecret = envOr("OMNI_DEVELOPER_SECRET", "NEXT_PUBLIC_OMNI_DEVELOPER_SECRET");
  if (!developerId || !developerSecret) {
    return NextResponse.json({ ok: false, error: "Missing developer env" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as any));
  const equipmentId: string | undefined = body.equipmentId;
  const pageSize = Number(body.pageSize || 10);
  const pageNum = Number(body.pageNum || 1);
  const startTimeRaw = body.startTime; // seconds or ms
  const endTimeRaw = body.endTime;
  // Normalize epoch to seconds
  const toSec = (v: any) => {
    if (!v) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    if (!isFinite(n)) return undefined;
    return n > 1e12 ? Math.floor(n/1000) : Math.floor(n);
  };
  const startTime = toSec(startTimeRaw) ?? Math.floor(Date.now()/1000) - 3600;
  const endTime = toSec(endTimeRaw) ?? Math.floor(Date.now()/1000);

  if (!equipmentId) {
    return NextResponse.json({ ok: false, error: "equipmentId required" }, { status: 400 });
  }

  // Signature guess: HMAC-SHA256 over developerId + equipmentId + startTime + endTime
  // If the platform requires a different canonical string, adjust here after confirmation.
  const canonical = `${developerId}${equipmentId}${startTime}${endTime}`;
  const sign = crypto.createHmac('sha256', developerSecret).update(canonical).digest('hex');

  const url = `${base}/prod-api/iot/api/v2/log?pageSize=${encodeURIComponent(String(pageSize))}&pageNum=${encodeURIComponent(String(pageNum))}`;
  const payload = { equipmentId, developerId, startTime: String(startTime), endTime: String(endTime), sign };

  let res: Response | null = null;
  let data: any = null; let raw: string | undefined;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' }, body: JSON.stringify(payload) });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      raw = await res.text().catch(() => undefined);
    }
    return NextResponse.json({ ok: res.ok, status: res.status, statusText: res.statusText, url, request: payload, response: data ?? undefined, raw }, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, url, error: e?.message || String(e), request: payload }, { status: 502 });
  }
}

