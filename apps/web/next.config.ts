import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @aaf/core and @aaf/ui ship untranspiled TS from workspace packages —
  // Next.js needs to transpile them itself rather than expecting pre-built JS.
  transpilePackages: ["@aaf/core", "@aaf/ui"],
  typedRoutes: true,
};

export default nextConfig;
