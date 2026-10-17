"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { BrandLogo } from "@/src/components/brand-logo";
import { Button } from "@/src/components/ui/button";
import { dashboardPathFor } from "@/src/lib/auth-flow";
import {
  getNotificationSupport,
  hasPushSubscription,
  subscribeToPush,
  requestNotificationPermission,
} from "@/src/lib/notifications/client";
import { markOnboardingComplete } from "@/src/lib/onboarding";
import type { NotificationSupport } from "@/src/lib/notifications/types";
import tenant from "@/config/tenant";

const HIGHLIGHTS = [
  {
    icon: BellRing,
    text: "Sign-in codes arrive on the device asking for them.",
  },
  {
    icon: ShieldCheck,
    text: "Reminders while an election you can vote in is open.",
  },
  {
    icon: Smartphone,
    text: "Push reaches this device even when the app is closed.",
  },
] as const;

/**
 * First-run screen for a signed-in account that has not finished onboarding on
 * this device.
 *
 * Its reason to exist is the notification permission: browsers only open the
 * dialog from a user gesture, so a brand-new account is walked through it
 * once, deliberately, instead of hoping they find the bell later. "Continue"
 * always works — permission itself is the browser's call, never ours to force.
 */
export function OnboardingFlow() {
  const { token, user } = useApp();
  const router = useRouter();
  const [support, setSupport] = useState<NotificationSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-only browser capability check; SSR simply renders the neutral card.
  useEffect(() => {
    setSupport(getNotificationSupport());
    let active = true;
    void hasPushSubscription().then((subscribed) => {
      if (active && subscribed) setEnabled(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const finish = useCallback(() => {
    if (user) markOnboardingComplete(user.id);
    router.replace(dashboardPathFor(user?.role ?? "voter"));
  }, [router, user]);

  const enable = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Request notification permission if not already granted
      const support = getNotificationSupport();
      if (support.status === "permission-required" || support.status === "supported") {
        await requestNotificationPermission();
      }
      const result = await subscribeToPush(token);
      if (result.ok) {
        setEnabled(true);
      } else {
        setError(result.reason ?? "Could not enable notifications on this device.");
      }
    } catch {
      setError("Could not enable notifications on this device.");
    } finally {
      // Re-read the live permission state so a denial shows browser guidance.
      setSupport(getNotificationSupport());
      setBusy(false);
    }
  }, [busy, token]);

  const canRequest =
    support?.status === "permission-required" || support?.status === "supported";
  const firstName = user?.full_name.trim().split(/\s+/)[0] || user?.username || "there";

  return (
    <div className="nv-grad-hero relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="nv-dots pointer-events-none absolute inset-0 text-nv-primary"
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10 sm:px-8">
        <header className="flex items-center gap-2.5">
          <BrandLogo className="h-10 w-auto shrink-0" />
          <span className="text-[18px] font-extrabold tracking-tight text-nv-ink">
            {tenant.name}
          </span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10">
          <p className="text-[12px] font-bold uppercase tracking-[0.7px] text-nv-primary">
            Almost there
          </p>
          <h1 className="mt-2 text-display text-nv-ink">Welcome, {firstName}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-nv-muted">
            One quick step: turn on device notifications so nothing important is missed —
            login codes, election openings, and published results.
          </p>

          <section
            aria-label="Notifications"
            className="mt-8 rounded-nv-md border border-nv-line bg-nv-surface/95 p-5 shadow-nv-card backdrop-blur"
          >
            {enabled ? (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nv-success/15 text-nv-success">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-fluid-lg text-nv-ink">Notifications are on</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-nv-muted">
                    This device will receive alerts in the app and on your lock screen.
                  </p>
                </div>
              </div>
            ) : canRequest ? (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-nv-primary">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-fluid-lg text-nv-ink">Turn on notifications</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-nv-muted">
                    {support?.detail ?? "Allow election alerts on this device."}
                  </p>
                  {error ? (
                    <p role="alert" className="mt-2 text-[12.5px] text-destructive">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-status-ready/15 text-status-ready">
                  <TriangleAlert className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-fluid-lg text-nv-ink">Notifications need a hand</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-nv-muted">
                    {support?.detail ??
                      "Checking this device's notification support…"}
                  </p>
                </div>
              </div>
            )}
          </section>

          <ul className="mt-6 space-y-2.5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-2.5 text-[13.5px] text-nv-muted">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-nv-primary" aria-hidden="true" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </main>

        <footer className="flex flex-col gap-3 border-t border-nv-line pt-6">
          {enabled || !canRequest ? (
            <Button type="button" size="lg" className="w-full" onClick={finish}>
              Continue to {tenant.shortName}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void enable()}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Enabling…
                  </>
                ) : (
                  "Enable notifications"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="default"
                className="w-full"
                onClick={finish}
              >
                Continue without notifications
              </Button>
            </>
          )}
          <p className="text-center text-[12px] leading-relaxed text-nv-muted">
            You can turn notifications on at any time from the bell in the header.
          </p>
        </footer>
      </div>
    </div>
  );
}
