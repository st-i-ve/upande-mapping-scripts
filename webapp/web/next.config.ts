import type { NextConfig } from "next";

/**
 * In development, proxy `/api/*` to the local FastAPI (uvicorn) server so the
 * frontend can call same-origin `/api`. In production nginx routes `/api/*`
 * to uvicorn directly, so this rewrite is dev-only.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
