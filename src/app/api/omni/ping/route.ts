import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import crypto from "crypto";

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

export async function GET() {
  const base = (envOr("OMNI_BASE_URL", "NEXT_PUBLIC_OMNI_BASE_URL") || "https://api.gridwizapp.com").replace(/\/$/, "");
  const developerId = envOr("OMNI_DEVELOPER_ID", "NEXT_PUBLIC_OMNI_DEVELOPER_ID");
  const developerSecret = envOr("OMNI_DEVELOPER_SECRET", "NEXT_PUBLIC_OMNI_DEVELOPER_SECRET");

  const ts = Math.floor(Date.now() / 1000).toString();
  const usingDeveloper = !!(developerId && developerSecret);
  let sign = "demo";
  try {
    if (usingDeveloper) {
      sign = crypto.createHmac("sha256", developerSecret!).update(`${developerId}${ts}`).digest("hex");
    }
  } catch (e) {
    // ignore signing error, continue to test reachability
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (usingDeveloper) {
    headers["X-Developer-Id"] = developerId as string;
    headers["X-Timestamp"] = ts;
    headers["X-Sign"] = sign;
  }

  const url = new URL(`${base}/openapi/v2/ping`);
  // No query required for ping in this simplified flow

  let res: Response | null = null;
  let body: any = null;
  try {
    res = await fetch(url.toString(), { method: "GET", headers });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => null);
    }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: url.toString(),
      headersSent: {
        ...headers,
        ...(headers["X-Developer-Id"] ? { "X-Developer-Id": mask(headers["X-Developer-Id"])! } : {}),
        ...(headers["X-App-Id"] ? { "X-App-Id": mask(headers["X-App-Id"])! } : {}),
        ...(headers["X-Sign"] ? { "X-Sign": mask(headers["X-Sign"])! } : {}),
      },
      body,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      status: res?.status || 0,
      statusText: res?.statusText || "",
      url: url.toString(),
      headersSent: {
        ...headers,
        ...(headers["X-Developer-Id"] ? { "X-Developer-Id": mask(headers["X-Developer-Id"])! } : {}),
        ...(headers["X-App-Id"] ? { "X-App-Id": mask(headers["X-App-Id"])! } : {}),
        ...(headers["X-Sign"] ? { "X-Sign": mask(headers["X-Sign"])! } : {}),
      },
      error: e?.message || String(e),
    });
  }
}
