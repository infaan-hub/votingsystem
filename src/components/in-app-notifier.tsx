"use client";

import { useEffect, useRef } from "react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { fetchNotifications } from "@/src/lib/notifications/client";
import {
  IN_APP_NOTIFICATION_EVENT,
  pickFreshNotifications,
  readNotificationCursor,
  writeNotificationCursor,
} from "@/src/lib/notifications/in-app";

/**
 * How often a visible tab checks for fresh notifications. Short enough that an
 * in-app alert lands at the same time as the Web Push banner it pairs with,
 * while the tab is hidden polling stops entirely.
 */
const POLL_MS = 5_000;
/** Newest notifications fetched per check. */
const SCAN_LIMIT = 10;
/** Most toasts shown for one burst; anything older stays in the bell. */
const MAX_TOASTS = 3;

/**
 * In-app notification surface: while the tab is visible, watches for fresh
 * notifications and announces each one with a toast — the in-app counterpart
 * of the Web Push banner, delivered for the same event. Web Push keeps firing
 * unchanged, so the user is informed both inside the app and on their other
 * (or backgrounded) devices, with or without the OS notification permission.
 *
 * A notification that arrived while the app was closed is announced when the
 * user comes back, so an in-app alert is never lost just because the tab was
 * gone at the moment the event happened.
 *
 * Renders nothing; mount once inside the app shell.
 */
export function InAppNotifier() {
  const { token, user } = useApp();
  const { toast } = useToast();
  const userId = user?.id ?? null;
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!token || userId === null) return;
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      // Overlapping triggers (interval + focus) must not double-announce.
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const rows = await fetchNotifications(token, { limit: SCAN_LIMIT });
        if (cancelled || rows.length === 0) return;
        const newestId = rows[0]!.id;
        const cursor = readNotificationCursor(userId);

        if (cursor === null) {
          // First look in this browser: existing items are not "new".
          writeNotificationCursor(userId, newestId);
          return;
        }
        if (newestId <= cursor) return;

        // Move the cursor first so a concurrent check can never re-announce
        // the same rows; rows read on another device advance it silently.
        writeNotificationCursor(userId, newestId);
        const fresh = pickFreshNotifications(rows, cursor, MAX_TOASTS);
        if (fresh.length === 0) return;

        for (const row of fresh) {
          toast({
            title: row.title,
            description: row.body || undefined,
            tone: "info",
          });
        }

        // The bell (and anything else listening) refreshes right away
        // instead of waiting for its own slower poll.
        window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT));
      } catch {
        /* transient errors are ignored; the next check retries */
      } finally {
        checkingRef.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onFocus = () => void tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, userId, toast]);

  return null;
}
