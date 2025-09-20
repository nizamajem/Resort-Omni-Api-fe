export type OmniEnv = {
  baseUrl?: string;
  developerId?: string;
  developerSecret?: string;
};

export function getOmniEnv(): OmniEnv {
  return {
    baseUrl: process.env.NEXT_PUBLIC_OMNI_BASE_URL,
    developerId: process.env.NEXT_PUBLIC_OMNI_DEVELOPER_ID,
    developerSecret: process.env.NEXT_PUBLIC_OMNI_DEVELOPER_SECRET,
  };
}

// Dummy connectivity and signature helpers (frontend-only, no backend change)
export async function dummyConnectivityCheck(env = getOmniEnv()) {
  const now = new Date().toISOString();
  const hasAll = !!(env.baseUrl && env.developerId && env.developerSecret);
  // Simulate a result payload that resembles a simple ping
  return {
    ok: hasAll,
    checkedAt: now,
    url: env.baseUrl || '-',
    note: hasAll ? 'Env vars present. Ready to connect.' : 'Missing required env vars.',
    sampleRequest: {
      method: 'GET',
      url: `${env.baseUrl || 'https://example.omni.iot'}/openapi/v2/ping`,
      headers: {
        'X-Developer-Id': env.developerId || 'DEVELOPER_ID',
        'X-Timestamp': '1699999999',
        'X-Sign': 'HMAC_SHA256(signature)',
      },
      query: {},
    },
  } as const;
}

export function buildDummySignature(developerId: string, developerSecret: string, timestamp: string) {
  // Placeholder; in real use, compute HMAC over `developerId+timestamp` with `developerSecret`.
  // Done on backend for security; here we just show a sample string.
  const short = (developerId || '').slice(0, 4) + ':' + (timestamp || '').slice(-4);
  return `demo-sign(${short})`;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const bytes = new Uint8Array(sig);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback demo value if WebCrypto not available (still allows connectivity test with expected 401)
    return 'deadbeef';
  }
}

export async function liveConnectivityTest(env = getOmniEnv()) {
  const base = (env.baseUrl || '').replace(/\/$/, '');
  const url = `${base || 'https://api.gridwizapp.com'}/openapi/v2/ping`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const usingDeveloper = !!(env.developerId && env.developerSecret);
  let sign = 'demo';
  if (usingDeveloper) {
    sign = await hmacSha256Hex(env.developerSecret!, `${env.developerId}${ts}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (usingDeveloper) {
    headers['X-Developer-Id'] = env.developerId as string;
    headers['X-Timestamp'] = ts;
    headers['X-Sign'] = sign;
  }

  const full = url;

  let res: Response | null = null;
  let bodyText: string | null = null;
  try {
    res = await fetch(full, { method: 'GET', headers, mode: 'cors', credentials: 'omit' });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      bodyText = JSON.stringify(await res.json().catch(() => ({})));
    } else {
      bodyText = await res.text().catch(() => null);
    }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: full,
      headersSent: headers,
      corsBlocked: false,
      body: bodyText,
    } as const;
  } catch (e: any) {
    const msg = e?.message || String(e);
    const corsLike = typeof window !== 'undefined' && /Failed to fetch|NetworkError|TypeError/i.test(msg);
    return {
      ok: false,
      status: res?.status || 0,
      statusText: res?.statusText || '',
      url: full,
      headersSent: headers,
      corsBlocked: corsLike,
      error: msg,
      body: bodyText,
    } as const;
  }
}
