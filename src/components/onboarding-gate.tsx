"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useApp } from "@/src/components/AppProvider";
import { isOnboardingComplete } from "@/src/lib/onboarding";

/**
 * Keeps the first-run onboarding mandatory: a signed-in account that has not
 * finished it on this device is sent to /onboarding from anywhere in the app
 * shell. Rendered by AppShell, so immersive routes (where the shell — and this
 * gate — do not exist) are never affected.
 */
export function OnboardingGate() {
  const { token, user } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!token || !user) return;
    if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return;
    if (isOnboardingComplete(user.id)) return;
    router.replace("/onboarding");
  }, [token, user, pathname, router]);

  return null;
}
