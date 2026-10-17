import { useEffect, useRef } from "react";

/**
 * Live-update bus.
 *
 * One custom event carries every "something changed" signal the app produces:
 * the in-app notifier dispatches it when a fresh notification arrives over the
 * SSE stream (or fallback poll), and pages subscribe through
 * {@link useLiveRefresh} to re-fetch their data without a manual refresh.
 *
 * The hook also covers the two classic staleness windows: returning to a tab
 * that was left open, and an explicit safety-net interval for screens whose
 * data changes without a notification being emitted.
 */

export const LIVE_UPDATE_EVENT = "nexvote:live-update";

export type LiveUpdateSource = "notification" | "focus" | "interval" | "manual";

export type LiveUpdateDetail = { source: LiveUpdateSource };

/** Tell every mounted surface that server data may have changed. */
export function emitLiveUpdate(source: LiveUpdateSource = "manual"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { source } }));
}

export type UseLiveRefreshOptions = {
  /**
   * Safety-net polling cadence while the tab is visible, in milliseconds.
   * 0 (default) disables it — refreshes then come from live events and focus.
   */
  intervalMs?: number;
  /** Smallest gap between two refreshes so a burst collapses into one fetch. */
  minGapMs?: number;
  /** Refresh when the tab regains focus (default true). */
  refreshOnFocus?: boolean;
  /** Set false to detach the listeners (e.g. while data is not ready). */
  enabled?: boolean;
};

/**
 * Re-runs `refresh` whenever live data may have changed: a notification
 * arrived, the tab became visible again, the safety interval elapsed.
 *
 * The callback is kept in a ref, so callers can pass an inline function
 * without re-subscribing on every render. Refreshes are skipped while the tab
 * is hidden and throttled by `minGapMs`.
 */
export function useLiveRefresh(
  refresh: () => void,
  options: UseLiveRefreshOptions = {},
): void {
  const { intervalMs = 0, minGapMs = 1_000, refreshOnFocus = true, enabled = true } = options;
  const refreshRef = useRef(refresh);
  const lastRunRef = useRef(0);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    function run() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRunRef.current < minGapMs) return;
      lastRunRef.current = now;
      refreshRef.current();
    }

    const onLive = () => run();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // A tab that was hidden for a while should refresh even if a live
        // event fired just before it was hidden.
        lastRunRef.current = 0;
        run();
      }
    };

    window.addEventListener(LIVE_UPDATE_EVENT, onLive);
    document.addEventListener("visibilitychange", onVisible);
    if (refreshOnFocus) window.addEventListener("focus", onLive);
    const timer = intervalMs > 0 ? window.setInterval(run, intervalMs) : undefined;

    return () => {
      window.removeEventListener(LIVE_UPDATE_EVENT, onLive);
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshOnFocus) window.removeEventListener("focus", onLive);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [enabled, intervalMs, minGapMs, refreshOnFocus]);
}
