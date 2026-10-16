"use client";

import { useCallback, useEffect, useRef } from "react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { fetchNotifications } from "@/src/lib/notifications/client";
import {
  IN_APP_NOTIFICATION_EVENT,
  pickFreshNotifications,
  readNotificationCursor,
  writeNotificationCursor,
} from "@/src/lib/notifications/in-app";
import { consumeNotificationStream } from "@/src/lib/notifications/stream";
import type { NotificationRow } from "@/src/lib/notifications/types";

/** Poll cadence while the live stream is down. */
const FALLBACK_POLL_MS = 3_000;
/** Newest notifications fetched per fallback check. */
const SCAN_LIMIT = 10;
/** Most fallback toasts shown for one burst; anything older stays in the bell. */
const MAX_TOASTS = 3;
/** In-app banners linger a little longer than ordinary toasts. */
const TOAST_MS = 8_000;
/** Stream reconnect backoff bounds. */
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * In-app notification surface.
 *
 * A visible tab holds a real-time connection to `/api/notifications/stream`,
 * so a notification shows up as a banner at the top of the app within a
 * second or two of being created — the in-app twin of the Web Push banner the
 * same event sends to every subscribed device. Web Push keeps firing
 * unchanged, so the user is reached both inside the app and on their locked/
 * background devices.
 *
 * If the stream cannot be established (proxy buffering, serverless limits,
 * older deployment), the component falls back to polling the list endpoint
 * every few seconds and keeps retrying the stream in the background. Both
 * modes share the localStorage cursor, so a row is announced once per browser
 * even if the mode flips mid-delivery.
 *
 * Renders nothing; mounted once inside the app shell.
 */
export function InAppNotifier() {
  const { token, user } = useApp();
  const { toast } = useToast();
  const userId = user?.id ?? null;
  const checkingRef = useRef(false);

  /** Show one banner and refresh every notification surface at once. */
  const announce = useCallback(
    (row: NotificationRow) => {
      if (userId === null) return;
      const cursor = readNotificationCursor(userId);
      // Already surfaced in this browser — another tab beat us to it.
      if (cursor !== null && row.id <= cursor) return;
      writeNotificationCursor(userId, row.id);
      toast({
        title: row.title,
        description: row.body || undefined,
        tone: "info",
        placement: "top",
        durationMs: TOAST_MS,
      });
      window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT));
    },
    [toast, userId],
  );

  useEffect(() => {
    if (!token || userId === null) return;
    // Narrowed once for the hoisted helpers below.
    const ownerId: number = userId;
    let cancelled = false;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let pollTimer: number | undefined;
    let attempts = 0;
    let streamOpen = false;

    function stopPolling() {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }

    function startPolling() {
      if (pollTimer === undefined) {
        pollTimer = window.setInterval(() => void poll(), FALLBACK_POLL_MS);
      }
    }

    function scheduleRetry(delay: number) {
      if (cancelled) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void openStream();
      }, delay);
    }

    /**
     * Fallback poll: the localStorage cursor keeps it from re-announcing rows
     * already surfaced, and a first look in a fresh browser sets a baseline
     * instead of toasting the existing backlog.
     */
    async function poll() {
      if (cancelled || checkingRef.current || document.visibilityState !== "visible") return;
      checkingRef.current = true;
      try {
        const rows = await fetchNotifications(token, { limit: SCAN_LIMIT });
        if (cancelled || rows.length === 0) return;
        const newestId = rows[0]!.id;
        const cursor = readNotificationCursor(ownerId);
        if (cursor === null) {
          writeNotificationCursor(ownerId, newestId);
          return;
        }
        if (newestId <= cursor) return;
        writeNotificationCursor(ownerId, newestId);
        const fresh = pickFreshNotifications(rows, cursor, MAX_TOASTS);
        if (fresh.length === 0) return;
        for (const row of fresh) {
          toast({
            title: row.title,
            description: row.body || undefined,
            tone: "info",
            placement: "top",
            durationMs: TOAST_MS,
          });
        }
        window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT));
      } catch {
        /* transient; the next tick retries */
      } finally {
        checkingRef.current = false;
      }
    }

    async function openStream() {
      if (cancelled || document.visibilityState !== "visible") return;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        await consumeNotificationStream(
          token,
          {
            onNotification: (row) => {
              if (!cancelled) announce(row);
            },
            onOpen: () => {
              attempts = 0;
              streamOpen = true;
              stopPolling();
            },
          },
          signal,
        );
        // The server closed the connection (deploy, serverless time limit):
        // reconnect with the same backoff so a runtime that closes immediately
        // can never turn into a hot loop.
        if (cancelled || signal.aborted) return;
        streamOpen = false;
        attempts += 1;
        startPolling();
        scheduleRetry(Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(attempts - 1, 4)));
      } catch {
        if (cancelled || signal.aborted) return;
        streamOpen = false;
        attempts += 1;
        startPolling();
        scheduleRetry(Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(attempts - 1, 4)));
      }
    }

    /** A visible tab polls once and makes sure the stream is connected. */
    function onResume() {
      if (document.visibilityState !== "visible") return;
      void poll();
      if (!streamOpen) void openStream();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        onResume();
      } else {
        // Hidden tabs keep neither a connection nor a timer alive.
        controller?.abort();
        controller = null;
        streamOpen = false;
        stopPolling();
      }
    }

    onResume();
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      controller?.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      stopPolling();
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, userId, toast, announce]);

  return null;
}
