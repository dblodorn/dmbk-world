import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dmbk-world/api"],
  experimental: {
    optimizePackageImports: ["reshaped"],
  },
};

export default nextConfig;
