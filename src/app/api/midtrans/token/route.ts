import type { NextRequest } from "next/server";

const MIDTRANS_SANDBOX_BASE = "https://app.sandbox.midtrans.com";
const MIDTRANS_PROD_BASE = "https://app.midtrans.com";

// Minimal Snap transaction creator. Adjust to your payload shape.
export async function POST(req: NextRequest) {
  try {
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      return Response.json({ error: "Missing MIDTRANS_SERVER_KEY in env" }, { status: 500 });
    }

    const baseUrl = isProduction ? MIDTRANS_PROD_BASE : MIDTRANS_SANDBOX_BASE;
    const url = `${baseUrl}/snap/v1/transactions`;

    const body = await req.json();
    // Basic validation so Midtrans doesn't 400 on empty payload
    const hasTx = body?.transaction_details?.order_id && body?.transaction_details?.gross_amount;
    if (!hasTx) {
      return Response.json({ error: "Invalid payload: missing transaction_details" }, { status: 400 });
    }
    const auth = Buffer.from(`${serverKey}:`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
      // Avoid caching token responses
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      // Pass-through midtrans error for easier debugging on FE
      return Response.json({ error: text || `Midtrans error ${res.status}` }, { status: res.status });
    }
    try {
      const data = JSON.parse(text);
      return Response.json(data);
    } catch {
      return Response.json({ error: "Invalid JSON from Midtrans" }, { status: 502 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
