import type { Metadata } from "next";
import type { ReactNode } from "react";

import AppShell from "@/src/components/AppShell";
import { AppProvider } from "@/src/components/AppProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Election Hub",
  description: "University voting and election management system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
