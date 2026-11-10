import type { NextConfig } from "next";

/**
 * Static export configuration.
 *
 * The admin panel is a pure client-side SPA that talks to Supabase.
 * It is deployed to Cloudflare Pages (or any static host) as plain
 * HTML/CSS/JS — no Node.js runtime required.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
};

export default nextConfig;
