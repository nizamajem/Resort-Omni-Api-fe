import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';
const enableApiProxy = process.env.NEXT_ENABLE_API_PROXY === '1' || isDev;

const nextConfig: NextConfig = {
  // In dev (or when explicitly enabled), allow runtime API routes/proxy.
  // In static export mode, API routes are disabled.
  ...(enableApiProxy ? {} : { output: 'export' as const }),
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
