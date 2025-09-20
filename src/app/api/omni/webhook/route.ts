import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "omni-callbacks.json");

async function ensureFile() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { await fs.access(FILE_PATH); }
  catch { await fs.writeFile(FILE_PATH, "[]", "utf8"); }
}

export async function GET() {
  await ensureFile();
  const raw = await fs.readFile(FILE_PATH, "utf8");
  let arr: any[] = [];
  try { arr = JSON.parse(raw); } catch { arr = []; }
  return NextResponse.json({ ok: true, count: arr.length, data: arr.slice(-500).reverse() });
}

export async function POST(req: Request) {
  await ensureFile();
  const bodyText = await req.text();
  let json: any = null; try { json = JSON.parse(bodyText); } catch {}
  const headers: Record<string, string> = {};
  // capture only a few headers
  ["content-type","user-agent","x-forwarded-for","x-real-ip"].forEach((k) => {
    const v = req.headers.get(k);
    if (v) headers[k] = v;
  });
  const entry = { at: new Date().toISOString(), headers, body: json ?? bodyText };
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const arr = JSON.parse(raw || "[]");
    arr.push(entry);
    await fs.writeFile(FILE_PATH, JSON.stringify(arr), "utf8");
  } catch {}
  return NextResponse.json({ ok: true });
}

