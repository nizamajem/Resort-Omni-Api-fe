import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';

function envOr(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length) return v;
  }
  return undefined;
}

export async function GET() {
  const base = (envOr("OMNI_BASE_URL", "NEXT_PUBLIC_OMNI_BASE_URL") || "https://api.gridwizapp.com").replace(/\/$/, "");
  const developerSecret = envOr("OMNI_DEVELOPER_SECRET", "NEXT_PUBLIC_OMNI_DEVELOPER_SECRET");

  if (!developerSecret) {
    return NextResponse.json({ ok: false, error: "Missing developer secret (OMNI_DEVELOPER_SECRET)" }, { status: 400 });
  }

  const url = `${base}/prod-api/iot/api/v1/param/list/${encodeURIComponent(developerSecret)}`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      // no-cors is not needed server-side
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e), url }, { status: 502 });
  }

  let body: any = null;
  let rawText: string | undefined = undefined;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = await res.json(); } catch (e: any) { rawText = e?.message || "json parse error"; }
  } else {
    try { rawText = await res.text(); } catch {}
  }

  const payload: any = {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    url,
    contentType: ct,
  };
  if (body !== null) payload.body = body;
  if (rawText !== undefined) payload.raw = rawText;

  return NextResponse.json(payload, { status: res.status });
}
