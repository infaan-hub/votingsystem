import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/**"],
  },
  async redirects() {
    return [{ source: "/home", destination: "/", permanent: true }];
  },
};

export default nextConfig;
