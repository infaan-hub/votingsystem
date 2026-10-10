import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/**"],
  },
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/candidate/login", destination: "/login", permanent: true },
      { source: "/voter/login", destination: "/login", permanent: true },
      { source: "/voter/register", destination: "/register", permanent: true },
      { source: "/candidate/dashboad", destination: "/candidate/dashboard", permanent: true },
      { source: "/voter/dashboad", destination: "/voter/dashboard", permanent: true },
      { source: "/voter/compain", destination: "/voter/campaign", permanent: true },
      {
        source: "/voter/compain/:candidateId",
        destination: "/voter/campaign/:candidateId",
        permanent: true,
      },
      {
        source: "/candidate/compaindetails",
        destination: "/candidate/campaign-details",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
