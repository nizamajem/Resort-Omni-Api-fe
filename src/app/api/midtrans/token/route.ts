import type { NextRequest } from "next/server";

const MIDTRANS_SANDBOX_BASE = "https://app.sandbox.midtrans.com";
const MIDTRANS_PROD_BASE = "https://app.midtrans.com";

// Minimal Snap transaction creator. Adjust to your payload shape.
export async function POST(req: NextRequest) {
  try {
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      return Response.json(
        { error: "Missing MIDTRANS_SERVER_KEY in env" },
        { status: 500 }
      );
    }

    const baseUrl = isProduction ? MIDTRANS_PROD_BASE : MIDTRANS_SANDBOX_BASE;
    const url = `${baseUrl}/snap/v1/transactions`;

    const body = await req.json();
    const auth = Buffer.from(`${serverKey}:`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
      // Next runtime/node: outbound fetch allowed by default; adjust if needed
      // cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data }, { status: res.status });
    }
    return Response.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
