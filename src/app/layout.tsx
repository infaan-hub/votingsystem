import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import AppShell from "@/src/components/AppShell";
import { AppProvider } from "@/src/components/AppProvider";
import { ToastProvider } from "@/src/components/ui/toast";
import tenant from "@/config/tenant";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--nv-font",
});

export const metadata: Metadata = {
  title: {
    default: `${tenant.name} — ${tenant.tagline}`,
    template: `%s · ${tenant.name}`,
  },
  description: tenant.tagline,
  manifest: "/manifest.webmanifest",
  applicationName: tenant.name,
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/nexvote_logo.jpeg", sizes: "1254x1254", type: "image/jpeg" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    // iOS ignores SVG apple-touch-icons: the Home Screen icon must be PNG.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: tenant.shortName,
  },
};

/** Edge-to-edge so `env(safe-area-inset-*)` resolves on notched devices. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ color: tenant.themeColor }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={tenant.defaultLocale} dir={tenant.direction}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}