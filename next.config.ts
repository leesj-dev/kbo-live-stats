import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives inside a larger monorepo; pin the tracing root so Next
  // doesn't infer the parent directory from a stray lockfile.
  outputFileTracingRoot: __dirname,
  // Team emblem images are served from Naver's CDN.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sports-phinf.pstatic.net" },
    ],
  },
};

export default nextConfig;
