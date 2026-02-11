import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dmbk-world/api"],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["reshaped"],
  },
};

export default nextConfig;
