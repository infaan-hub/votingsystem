import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: "/api/**" }, { pathname: "/media/**" }],
  },
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/**"],
  },
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      // Legacy spellings kept out of the route tree on purpose: the pages are
      // gone, so old bookmarks and in-app links resolve at the edge.
      { source: "/explore", destination: "/elections", permanent: true },
      { source: "/feed", destination: "/elections", permanent: true },
      { source: "/election", destination: "/elections", permanent: true },
    ];
  },
};

export default nextConfig;
