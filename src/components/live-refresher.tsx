"use client";

import { useRouter } from "next/navigation";

import { useLiveRefresh } from "@/src/lib/live";

/**
 * Re-renders the current route's server components when a live update lands,
 * so server-rendered screens (home, category pages, candidate profiles)
 * refresh in place instead of waiting for a manual reload. Client-rendered
 * pages wire their own `useLiveRefresh` callbacks.
 *
 * Refreshes are throttled and only run while the tab is visible.
 */
export function LiveRefresher() {
  const router = useRouter();
  useLiveRefresh(() => router.refresh(), { minGapMs: 5_000, refreshOnFocus: false });
  return null;
}
