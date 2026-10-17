"use client";

import { useCallback, useEffect, useRef } from "react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { emitLiveUpdate } from "@/src/lib/live";
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
/** Safety-net cadence for a tab that follows another tab's stream. */
const FOLLOWER_POLL_MS = 15_000;
/** Newest notifications fetched per fallback check. */
const SCAN_LIMIT = 10;
/** Most fallback toasts shown for one burst; anything older stays in the bell. */
const MAX_TOASTS = 3;
/** In-app banners linger a little longer than ordinary toasts. */
const TOAST_MS = 8_000;
/** Stream reconnect backoff bounds. */
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
/** Cross-tab fan-out and the single-stream lock. */
const CHANNEL_NAME = "nexvote-notifications";
const STREAM_LOCK = "nexvote-notification-stream";

type ChannelMessage = { type: "notification"; row: NotificationRow };

/**
 * Web Locks + BroadcastChannel availability. When both exist, exactly one tab
 * per browser holds the SSE connection and fans rows out to the others; when
 * either is missing, every tab falls back to its own connection.
 */
function sharedStreamSupport(): { locks: LockManager | null; channel: typeof BroadcastChannel | null } {
  if (typeof window === "undefined") return { locks: null, channel: null };
  const locks = (navigator as Navigator & { locks?: LockManager }).locks ?? null;
  const channel = typeof BroadcastChannel === "function" ? BroadcastChannel : null;
  if (!locks || !channel) return { locks: null, channel: null };
  return { locks, channel };
}

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
 * Tabs coordinate: the first visible tab takes a Web Locks lock and owns the
 * single stream per browser, rebroadcasting each row over a BroadcastChannel
 * so the other tabs refresh their bells and page data without opening their
 * own connections (the shared localStorage cursor means a row toasts once per
 * browser either way). If Web Locks or BroadcastChannel is unavailable on the
 * device, each tab simply streams for itself — never going dark.
 *
 * If the stream cannot be established (proxy buffering, serverless limits,
 * older deployment), the tab falls back to polling the list endpoint every few
 * seconds while retrying the stream with backoff. Both modes share the
 * localStorage cursor, so a row is announced once per browser even if the mode
 * flips mid-delivery.
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
      const claimed = readNotificationCursor(userId);
      if (claimed !== null && row.id < claimed) return;
      toast({
        title: row.title,
        description: row.body || undefined,
        tone: "info",
        placement: "top",
        durationMs: TOAST_MS,
      });
      window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT));
      emitLiveUpdate("notification");
    },
    [toast, userId],
  );

  /**
   * Refresh surfaces for a row another tab already delivered. No banner: the
   * toast for this browser was shown (and the cursor written) by the tab that
   * holds the stream.
   */
  const touch = useCallback(
    (row: NotificationRow) => {
      if (userId === null) return;
      const cursor = readNotificationCursor(userId);
      if (cursor === null || row.id > cursor) writeNotificationCursor(userId, row.id);
      window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT));
      emitLiveUpdate("notification");
    },
    [userId],
  );

  useEffect(() => {
    if (!token || userId === null) return;
    // Narrowed once for the hoisted helpers below.
    const ownerId: number = userId;
    let cancelled = false;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let settleSleep: (() => void) | null = null;
    let pollTimer: number | undefined;
    let followerTimer: number | undefined;
    let takeoverTimer: number | undefined;
    let takeoverAttempts = 0;
    let attempts = 0;
    let streamOpen = false;
    let looping = false;
    let isLeader = false;

    const { locks, channel: ChannelCtor } = sharedStreamSupport();
    const shared = locks !== null && ChannelCtor !== null;
    const channel = shared ? new ChannelCtor!(CHANNEL_NAME) : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
        const message = event.data;
        if (cancelled || !message || message.type !== "notification") return;
        if (document.visibilityState !== "visible") return;
        touch(message.row);
      };
    }

    function stopPolling() {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }

    function startPolling(intervalMs: number) {
      if (pollTimer !== undefined) return;
      // A follower keeps a slow safety net; the stream owner polls faster
      // while its connection is down.
      pollTimer = window.setInterval(() => void poll(), intervalMs);
    }

    function stopFollower() {
      if (followerTimer !== undefined) {
        window.clearInterval(followerTimer);
        followerTimer = undefined;
      }
    }

    /** Followers poll slowly and keep trying to take over a dead leader. */
    function startFollower() {
      if (cancelled || document.visibilityState !== "visible") return;
      startPolling(FOLLOWER_POLL_MS);
      if (followerTimer === undefined) {
        followerTimer = window.setInterval(() => void openStream(), FOLLOWER_POLL_MS);
      }
    }

    /**
     * A leader that just closed may still be releasing the lock, so a refused
     * attempt retries quickly (a lock request is local — no network) with
     * backoff, making takeover prompt instead of waiting for the slow poll.
     */
    function scheduleTakeover() {
      if (cancelled || takeoverTimer !== undefined) return;
      const delay = Math.min(RETRY_MAX_MS, 500 * 2 ** Math.min(takeoverAttempts, 6));
      takeoverAttempts += 1;
      takeoverTimer = window.setTimeout(() => {
        takeoverTimer = undefined;
        void openStream();
      }, delay);
    }

    function clearTakeover() {
      takeoverAttempts = 0;
      if (takeoverTimer !== undefined) {
        window.clearTimeout(takeoverTimer);
        takeoverTimer = undefined;
      }
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        settleSleep = resolve;
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          settleSleep = null;
          resolve();
        }, ms);
      });
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
        emitLiveUpdate("notification");
      } catch {
        /* transient; the next tick retries */
      } finally {
        checkingRef.current = false;
      }
    }

    /**
     * Consumes the stream, reconnecting with backoff until the tab is hidden
     * or the component unmounts. While disconnected it polls so the tab still
     * notices notifications.
     */
    async function runStreamLoop() {
      while (!cancelled && document.visibilityState === "visible") {
        controller?.abort();
        controller = new AbortController();
        const signal = controller.signal;
        try {
          await consumeNotificationStream(
            token,
            {
              onNotification: (row) => {
                if (cancelled) return;
                announce(row);
                channel?.postMessage({ type: "notification", row } satisfies ChannelMessage);
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
          // reconnect with backoff so a runtime that closes immediately can
          // never turn into a hot loop. A stall resolves the same way.
        } catch {
          // Network failure or a non-OK response: same backoff below.
        }
        if (cancelled || signal.aborted || document.visibilityState !== "visible") return;
        streamOpen = false;
        attempts += 1;
        startPolling(FALLBACK_POLL_MS);
        await sleep(Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(attempts - 1, 4)));
      }
    }

    /** Opens (or reopens) the stream, taking the browser-wide lock if shared. */
    async function openStream() {
      if (cancelled || document.visibilityState !== "visible" || looping) return;
      looping = true;
      try {
        if (!shared) {
          await runStreamLoop();
          return;
        }
        await locks!.request(
          STREAM_LOCK,
          { mode: "exclusive", ifAvailable: true },
          async (lock) => {
            if (cancelled || document.visibilityState !== "visible") return;
            if (!lock) {
              // Another tab owns the stream; follow it and stay ready to take
              // over if that tab disappears.
              startFollower();
              scheduleTakeover();
              return;
            }
            isLeader = true;
            clearTakeover();
            stopFollower();
            stopPolling();
            try {
              await runStreamLoop();
            } finally {
              isLeader = false;
            }
          },
        );
        if (!cancelled && !isLeader && !followerTimer) startFollower();
      } catch {
        // Web Locks refused (sandboxed frame, policy): never go dark — fall
        // back to this tab's own connection.
        await runStreamLoop();
      } finally {
        looping = false;
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
        // Hidden tabs keep neither a connection nor a timer alive. A pending
        // reconnect sleep is cut short so the browser-wide lock is released
        // immediately rather than after the backoff.
        controller?.abort();
        controller = null;
        streamOpen = false;
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        retryTimer = undefined;
        settleSleep?.();
        settleSleep = null;
        if (takeoverTimer !== undefined) window.clearTimeout(takeoverTimer);
        takeoverTimer = undefined;
        stopPolling();
        stopFollower();
      }
    }

    onResume();
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      controller?.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      settleSleep?.();
      settleSleep = null;
      stopPolling();
      stopFollower();
      if (takeoverTimer !== undefined) window.clearTimeout(takeoverTimer);
      channel?.close();
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, userId, toast, announce, touch]);

  return null;
}
