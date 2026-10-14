"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCircle2, Loader2, Smartphone, TriangleAlert, X } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import {
  getNotificationSupport,
  hasPushSubscription,
  subscribeToPush,
} from "@/src/lib/notifications/client";
import {
  promptDecision,
  readDismissedAt,
  writeDismissedAt,
  type PromptDecision,
} from "@/src/lib/notifications/prompt";
import type { NotificationSupport } from "@/src/lib/notifications/types";
import { cn } from "@/src/lib/utils";

/**
 * Compact glassmorphism card that explains and requests browser notification
 * permission — only ever from an explicit button press (the browser controls
 * permission; a site cannot grant it silently).
 *
 * States it renders:
 *  - "enable":              permission to request, or permission granted but
 *                           this device still needs a push subscription;
 *  - "denied-guidance":     blocked by the browser → settings instructions,
 *                           never another permission request;
 *  - "install-guidance":    iOS Home Screen requirement;
 *  - "unsupported-info":    honest compatibility message;
 *  - enabled confirmation:  shown after a successful subscribe, auto-hides.
 *
 * "Not Now" persists a dismissal (30 days) so the prompt does not interrupt
 * the user on every page load. Mounted once by AppShell for signed-in users.
 */
const ENABLED_VISIBLE_MS = 8_000;

export function NotificationPermissionPrompt() {
  const { token, user } = useApp();
  const [support, setSupport] = useState<NotificationSupport | null>(null);
  const [decision, setDecision] = useState<PromptDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const recompute = useCallback(async () => {
    if (!token || !user) {
      setDecision(null);
      return;
    }
    const current = getNotificationSupport();
    setSupport(current);
    let hasSubscription = false;
    try {
      hasSubscription = await hasPushSubscription();
    } catch {
      hasSubscription = false;
    }
    setDecision(
      promptDecision({
        supportStatus: current.status,
        hasSubscription,
        dismissedAt: readDismissedAt(),
      }),
    );
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) {
      setDecision(null);
      return;
    }
    void recompute();
  }, [token, user, recompute]);

  const onEnable = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Genuine user gesture: the permission dialog may only open here.
      const result = await subscribeToPush(token);
      if (result.ok) {
        setEnabled(true);
        setDecision("hidden");
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setEnabled(false), ENABLED_VISIBLE_MS);
      } else {
        setError(result.reason ?? "Could not enable notifications on this device.");
        // The permission state may have changed (e.g. blocked) — re-evaluate
        // so we show guidance instead of offering a button that cannot work.
        await recompute();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enable notifications.");
      await recompute();
    } finally {
      setBusy(false);
    }
  }, [token, busy, recompute]);

  const onDismiss = useCallback(() => {
    writeDismissedAt();
    setDecision("hidden");
    setError(null);
  }, []);

  if (!token || !user) return null;

  // Success confirmation: no notification is sent, purely a UI acknowledgement.
  if (enabled) {
    return (
      <aside
        role="status"
        aria-label="Notifications enabled"
        className={cn(
          "fixed right-3 bottom-above-nav z-40 w-[min(20.5rem,calc(100vw_-_1.5rem))] p-3.5 md:right-4 md:bottom-6",
          "glass-surface",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-nv-ink">Notifications are on</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-nv-muted">
              This device is subscribed to NexVote push notifications.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  if (decision === null || decision === "hidden") return null;

  const detail = support?.detail ?? "";

  const content = (() => {
    switch (decision) {
      case "enable":
        return {
          icon: <BellRing className="h-4.5 w-4.5" aria-hidden="true" />,
          title: "Enable NexVote Notifications",
          body: "Get notified about election openings, results, and updates even when NexVote is not open in your browser.",
          showEnable: true,
          enableLabel: busy ? "Requesting…" : "Enable Notifications",
          dismissLabel: "Not Now",
        };
      case "denied-guidance":
        return {
          icon: <Bell className="h-4.5 w-4.5" aria-hidden="true" />,
          title: "Notifications are blocked",
          body: `${detail} Open your browser's site settings for this site (or your device's notification settings) and allow notifications, then reload the page.`,
          showEnable: false,
          dismissLabel: "Got it",
        };
      case "install-guidance":
        return {
          icon: <Smartphone className="h-4.5 w-4.5" aria-hidden="true" />,
          title: "Add NexVote to your Home Screen",
          body: detail,
          showEnable: false,
          dismissLabel: "Got it",
        };
      case "unsupported-info":
        return {
          icon: <Bell className="h-4.5 w-4.5" aria-hidden="true" />,
          title: "Notifications aren't supported here",
          body: `${detail} You can still see every notification inside NexVote from the bell in the header.`,
          showEnable: false,
          dismissLabel: "Got it",
        };
      default:
        return null;
    }
  })();

  if (!content) return null;

  return (
    <aside
      role="region"
      aria-label="Notification permission"
      className={cn(
        "fixed right-3 bottom-above-nav z-40 w-[min(20.5rem,calc(100vw_-_1.5rem))] p-3.5 md:right-4 md:bottom-6",
        "glass-surface",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-nv-primary"
        >
          {content.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-5 text-nv-ink">{content.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-nv-muted">{content.body}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification prompt"
          className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-nv-muted transition-colors hover:bg-nv-primary-100 hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-lg bg-nv-primary-100/70 px-2.5 py-2 text-[12px] font-semibold leading-snug text-nv-primary"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {content.showEnable ? (
          <Button type="button" size="dense" onClick={() => void onEnable()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {content.enableLabel}
          </Button>
        ) : null}
        <Button type="button" variant={content.showEnable ? "subtle" : "outline"} size="dense" onClick={onDismiss}>
          {content.dismissLabel}
        </Button>
      </div>
    </aside>
  );
}
