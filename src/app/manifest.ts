import type { MetadataRoute } from "next";

import tenant from "@/config/tenant";

/**
 * PWA manifest built from the tenant configuration, so the installed app
 * always carries the deployment's own name, colours and description (the
 * former static file in public/ had drifted from config/tenant.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: tenant.name,
    short_name: tenant.shortName,
    description: tenant.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#042F32",
    theme_color: tenant.themeColor,
    categories: ["productivity", "government", "utilities"],
    lang: tenant.defaultLocale,
    dir: tenant.direction,
    icons: [
      { src: "/nexvote_logo.jpeg", sizes: "1254x1254", type: "image/jpeg", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
