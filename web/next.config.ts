import type { NextConfig } from "next";

// Prod: brauzer engine-ə eyni mənbədən (/engine) müraciət edir, Next.js isə sorğunu daxili engine-ə ötürür.
// Belə engine portu xaricə açılmır. Build zamanı: ENGINE_INTERNAL_URL=http://127.0.0.1:8000 NEXT_PUBLIC_ENGINE_URL=/engine
const ENGINE_INTERNAL = process.env.ENGINE_INTERNAL_URL;

const nextConfig: NextConfig = {
  // deck.gl interleaved overlay StrictMode-un ikiqat mount-u ilə eyni WebGL kontekstinə iki dəfə qoşulur
  reactStrictMode: false,
  async rewrites() {
    return ENGINE_INTERNAL ? [{ source: "/engine/:path*", destination: `${ENGINE_INTERNAL}/:path*` }] : [];
  },
};

export default nextConfig;
