"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  getNotificationSupport,
  hasPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/src/lib/notifications/client";
import type { NotificationSupport } from "@/src/lib/notifications/types";
import { cn } from "@/src/lib/utils";

/**
 * Profile-page notification control: every signed-in user can turn push
 * notifications on or off for their own device here.
 *
 * All state is read from the real browser APIs and the subscription record —
 * browser permission state, whether this device has a registered subscription,
 * and whether registration actually succeeded. A website cannot grant
 * permission by itself, so "Turn on" only ever opens the browser's own
 * permission dialog from this deliberate click.
 */
type Feedback = { tone: "success" | "error" | "info"; text: string } | null;

const PERMISSION_LABEL: Record<string, string> = {
  granted: "granted",
  denied: "blocked",
  default: "not yet granted",
  unsupported: "unsupported",
};

export function NotificationSettings() {
  const { token, user } = useApp();
  const [support, setSupport] = useState<NotificationSupport | null>(null);
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const evaluate = useCallback(async () => {
    if (!token) return;
    setSupport(getNotificationSupport());
    setDeviceSubscribed(null);
    try {
      setDeviceSubscribed(await hasPushSubscription());
    } catch {
      setDeviceSubscribed(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    void evaluate();
  }, [token, user, evaluate]);

  const turnOn = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      // Deliberate click: this is the only place the permission dialog opens.
      const result = await subscribeToPush(token);
      if (result.ok) {
        setFeedback({
          tone: "success",
          text: "Notifications are on for this device. You'll get election alerts even when NexVote isn't open.",
        });
        await evaluate();
      } else {
        setFeedback({
          tone: "error",
          text: result.reason ?? "Could not turn notifications on for this device.",
        });
        // Permission state may have changed while the dialog was open.
        setSupport(getNotificationSupport());
      }
    } catch (caught) {
      setFeedback({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Could not turn notifications on.",
      });
    } finally {
      setBusy(false);
    }
  }, [token, busy, evaluate]);

  const turnOff = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await unsubscribeFromPush(token);
      if (result.ok) {
        setFeedback({
          tone: "info",
          text: "Notifications turned off for this device. You'll still see every alert in the bell menu.",
        });
        setDeviceSubscribed(false);
      } else {
        setFeedback({
          tone: "error",
          text: result.reason ?? "Could not turn notifications off for this device.",
        });
      }
    } catch (caught) {
      setFeedback({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Could not turn notifications off.",
      });
    } finally {
      setBusy(false);
    }
  }, [token, busy]);

  if (!token || !user) return null;

  const checking = deviceSubscribed === null;
  const subscribed = deviceSubscribed === true;
  const status = support?.status ?? "unsupported";

  const guidance = (() => {
    switch (status) {
      case "unsupported":
        return {
          icon: <TriangleAlert className="h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />,
          text:
            "This browser can't show push notifications, but you'll still see every alert inside NexVote from the bell in the header.",
        };
      case "requires-home-screen-install":
        return {
          icon: <Smartphone className="h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />,
          text: support?.detail ?? "",
        };
      case "permission-denied":
        return {
          icon: <BellOff className="h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />,
          text:
            support?.detail ??
            "Notifications are blocked. Allow them in your browser or system settings for this site, then use Check again below.",
        };
      default:
        return null;
    }
  })();

  return (
    <section aria-labelledby="notifications-heading" className="space-y-3">
      <div>
        <h2 id="notifications-heading" className="text-fluid-lg text-nv-ink">
          Notifications
        </h2>
        <p className="mt-1 text-[13px] text-nv-muted">
          Turn push notifications on or off for this device. When on, NexVote can
          alert you about elections, results, and updates even while the app is
          not open.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                subscribed
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-nv-primary-100 text-nv-primary",
              )}
            >
              {subscribed ? <BellRing /> : <Bell />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-nv-ink">
                {checking
                  ? "Checking this device…"
                  : subscribed
                    ? "Notifications are on for this device."
                    : "Notifications are off for this device."}
              </p>
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nv-muted">
                <div className="flex gap-1">
                  <dt>Browser permission:</dt>
                  <dd className="font-semibold text-nv-text">
                    {support ? PERMISSION_LABEL[support.permission] ?? support.permission : "—"}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Device subscription:</dt>
                  <dd className="font-semibold text-nv-text">
                    {checking ? "checking…" : subscribed ? "registered" : "not registered"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {guidance ? (
            <div className="flex items-start gap-2 rounded-nv-md border border-nv-line bg-white/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-nv-muted">
              {guidance.icon}
              <p>{guidance.text}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2" aria-live="polite">
            <Button
              type="button"
              onClick={() => (subscribed ? void turnOff() : void turnOn())}
              disabled={busy || checking || status === "unsupported" || status === "requires-home-screen-install" || status === "permission-denied"}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : subscribed ? (
                <BellOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bell className="h-4 w-4" aria-hidden="true" />
              )}
              {busy
                ? "Working…"
                : subscribed
                  ? "Turn off notifications"
                  : "Turn on notifications"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void evaluate()}
              disabled={busy}
            >
              <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} aria-hidden="true" />
              Check again
            </Button>
          </div>

          {feedback ? (
            <p
              role={feedback.tone === "error" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2 rounded-nv-md px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed",
                feedback.tone === "success" && "bg-emerald-50 text-emerald-700",
                feedback.tone === "error" && "bg-nv-primary-100 text-nv-primary",
                feedback.tone === "info" && "bg-nv-surface text-nv-muted",
              )}
            >
              {feedback.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : feedback.tone === "error" ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <BellOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {feedback.text}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
