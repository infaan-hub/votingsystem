"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SEEN_KEY = "nv-onboarding-seen";

/**
 * Sends a first-time visitor from the home page to /onboarding exactly once.
 * Returning visitors (or anyone who has completed onboarding) stay on the
 * home page. Rendered only from the server-rendered home page.
 */
export function FirstVisitOnboarding() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) {
        window.localStorage.setItem(SEEN_KEY, "1");
        router.replace("/onboarding");
      }
    } catch {
      // Storage unavailable (private mode etc.) — never block the home page.
    }
  }, [router]);
  return null;
}
