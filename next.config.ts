import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/**"],
  },
};

export default nextConfig;
