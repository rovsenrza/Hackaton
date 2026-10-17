import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deck.gl interleaved overlay StrictMode-un ikiqat mount-u ilə eyni WebGL kontekstinə iki dəfə qoşulur
  reactStrictMode: false,
};

export default nextConfig;
