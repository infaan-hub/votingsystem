import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";

import AppShell from "@/src/components/AppShell";
import { AppProvider } from "@/src/components/AppProvider";
import { ToastProvider } from "@/src/components/ui/toast";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Election Hub",
  description:
    "Configurable election platform for organizations, associations, companies, communities, unions, clubs, boards, and schools.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-maskable.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Election Hub",
  },
};

/**
 * `viewportFit: "cover"` is required before `env(safe-area-inset-*)` resolves to
 * a non-zero value on notched iPhones — the app draws edge-to-edge and the
 * `*-safe` utility classes add the inset back where needed.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

/** Applies the stored (or OS) theme before first paint so there is no flash. */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("election-hub-theme");
    var dark = stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var contrast = window.matchMedia("(prefers-contrast: more)").matches;
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("hc", contrast);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${manrope.variable} font-sans antialiased`}>
        <AppProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}