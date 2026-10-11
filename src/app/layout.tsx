import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import AppShell from "@/src/components/AppShell";
import { AppProvider } from "@/src/components/AppProvider";
import { ToastProvider } from "@/src/components/ui/toast";
import tenant, { t } from "@/config/tenant";
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
    icon: [{ url: tenant.logo, type: "image/svg+xml" }],
    apple: [{ url: tenant.logo, type: "image/svg+xml" }],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tenant.themeColor },
    { media: "(prefers-color-scheme: dark)", color: "#0F1020" },
  ],
};

/**
 * Applies the stored or OS theme before first paint so there is no flash, and
 * seeds the requested-contrast class.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("election-hub-theme");
    var explicit = localStorage.getItem("election-hub-theme-explicit");
    var dark = explicit && stored ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("hc", window.matchMedia("(prefers-contrast: more)").matches);
    root.style.colorScheme = dark ? "dark" : "light";
    root.lang = "${t.locales[0]}";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={tenant.defaultLocale} dir={tenant.direction} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
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