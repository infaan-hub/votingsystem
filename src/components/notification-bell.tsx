"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check, CheckCheck, Trash2 } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  getNotificationSupport,
  hasPushSubscription,
  markAllNotificationsRead,
  markNotificationRead,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/src/lib/notifications/client";
import type { NotificationRow, NotificationSupport } from "@/src/lib/notifications/types";

/**
 * Header notification bell: unread badge, recent-notification panel, and the
 * explicit Enable notifications flow (permission is only requested from this
 * deliberate click, never on page load).
 */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { token, user } = useApp();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [support, setSupport] = useState<NotificationSupport | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [list, count] = await Promise.all([
        fetchNotifications(token, { limit: 20 }),
        fetchUnreadCount(token),
      ]);
      setRows(list);
      setUnread(count);
    } catch {
      /* panel stays as-is on transient errors */
    }
  }, [token]);

  useEffect(() => {
    setSupport(getNotificationSupport());
    if (!token) return;
    void refresh();
    void hasPushSubscription().then(setPushOn);
    // Best-effort service-worker registration so push is ready to subscribe.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      registerServiceWorker().catch(() => undefined);
    }
  }, [token, refresh]);

  // Close the panel on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!token || !user) return null;

  const enablePush = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (pushOn) {
        const result = await unsubscribeFromPush(token);
        setPushOn(!result.ok ? pushOn : false);
        setMessage(result.ok ? "Push notifications turned off." : result.reason ?? null);
      } else {
        const result = await subscribeToPush(token);
        setPushOn(result.ok);
        setSupport(getNotificationSupport());
        setMessage(
          result.ok
            ? "This device will receive election alerts."
            : result.reason ?? "Could not enable notifications.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const openRow = async (row: NotificationRow) => {
    if (!row.is_read) {
      try {
        await markNotificationRead(token, row.id);
        setRows((prev) =>
          prev.map((item) =>
            item.id === row.id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item,
          ),
        );
        setUnread((count) => Math.max(0, count - 1));
      } catch {
        /* still navigate */
      }
    }
    if (row.target_url) {
      window.location.assign(row.target_url);
    }
  };

  const markAll = async () => {
    await markAllNotificationsRead(token);
    setRows((prev) =>
      prev.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() })),
    );
    setUnread(0);
  };

  const removeRow = async (id: number) => {
    await deleteNotification(token, id);
    setRows((prev) => prev.filter((item) => item.id !== id));
  };

  const showEnable =
    support !== null && support.status !== "supported" && support.status !== "unsupported";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void refresh();
        }}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-lg text-nv-muted transition-colors duration-200 hover:bg-nv-primary-100 hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary",
          compact && "h-9 w-9",
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-nv-primary px-1 text-[10px] font-bold leading-[18px] text-white"
            aria-hidden="true"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-nv-line bg-nv-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-nv-line px-3 py-2">
            <p className="text-[13px] font-bold text-nv-ink">Notifications</p>
            {unread > 0 ? (
              <Button variant="ghost" size="dense" className="h-8 px-2 text-[12px]" onClick={() => void markAll()}>
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </div>

          {showEnable ? (
            <div className="border-b border-nv-line px-3 py-2.5">
              <div className="flex items-start gap-2">
                {support?.status === "permission-denied" || support?.status === "unsupported" ? (
                  <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />
                ) : (
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-nv-primary" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-snug text-nv-ink">
                    {support?.status === "requires-home-screen-install"
                      ? "Install on your Home Screen"
                      : support?.status === "permission-denied"
                        ? "Notifications are blocked"
                        : "Enable notifications"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-nv-muted">
                    {support?.detail}
                  </p>
                  {support?.status === "permission-required" ||
                  support?.status === "requires-home-screen-install" ? (
                    <Button
                      variant="primary"
                      size="dense"
                      className="mt-2 h-8 px-3 text-[12px]"
                      disabled={busy}
                      onClick={() => void enablePush()}
                    >
                      {busy ? "Working…" : "Enable notifications"}
                    </Button>
                  ) : null}
                  {message ? (
                    <p className="mt-1.5 text-[11.5px] leading-snug text-nv-muted">{message}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <ul className="max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <li className="px-3 py-6 text-center text-[12.5px] text-nv-muted">
                No notifications yet.
              </li>
            ) : (
              rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "group flex items-start gap-2 border-b border-nv-line/60 px-3 py-2.5 last:border-b-0",
                    !row.is_read && "bg-nv-primary-100/40",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openRow(row)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary rounded"
                  >
                    <p
                      className={cn(
                        "truncate text-[12.5px] leading-snug text-nv-ink",
                        !row.is_read ? "font-bold" : "font-medium",
                      )}
                    >
                      {row.title}
                    </p>
                    {row.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-nv-muted">
                        {row.body}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10.5px] text-nv-muted/80">
                      {new Date(row.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {!row.is_read ? (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(token, row.id).then(refresh)}
                        aria-label="Mark as read"
                        title="Mark as read"
                        className="grid h-8 w-8 place-items-center rounded-md text-nv-muted transition-colors hover:bg-nv-primary-100 hover:text-nv-primary"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void removeRow(row.id)}
                      aria-label="Delete notification"
                      title="Delete"
                      className="grid h-8 w-8 place-items-center rounded-md text-nv-muted transition-colors hover:bg-nv-primary-100 hover:text-nv-primary"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
