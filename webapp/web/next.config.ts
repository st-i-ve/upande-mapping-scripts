import type { NextConfig } from "next";

/**
 * In development, proxy `/api/*` to the local FastAPI (uvicorn) server so the
 * frontend can call same-origin `/api`. In production nginx routes `/api/*`
 * to uvicorn directly, so this rewrite is dev-only.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8765";

// Optional path prefix so the app can be previewed under nginx `/next` without
// disturbing the live vanilla app at `/`. Empty for the eventual root cutover.
const BASE_PATH = process.env.NEXT_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
