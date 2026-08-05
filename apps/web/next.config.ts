import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@itqanak/config", "@itqanak/db", "@itqanak/observability", "@itqanak/ui"],
};

export default nextConfig;
