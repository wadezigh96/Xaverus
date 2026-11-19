import type { NextConfig } from "next";
// NEXT_DIST_DIR lets the route tests build a second copy of the app (with
// a placeholder Privy App ID baked in) without touching the main .next
// build: `next start` reads the same setting, so it serves that copy.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;