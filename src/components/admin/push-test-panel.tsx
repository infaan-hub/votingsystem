"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, RefreshCw, Send, ShieldAlert, TriangleAlert } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/lib/utils";

/**
 * Push Notification Testing panel (admin only).
 *
 * Talks to /api/admin/notifications/test: readiness + run status on GET, one
 * real test run on POST. Every number shown is what the server actually
 * recorded — queued jobs, provider-accepted requests, failures, expired
 * subscriptions. The panel never claims a device displayed a notification and
 * never exposes subscription endpoints, keys, or provider error bodies.
 */

const API = "/api/admin/notifications/test";
/** Audiences at or above this many devices require an explicit confirmation. */
const CONFIRM_ABOVE = 5;

type Readiness = {
  vapid_configured: boolean;
  audience: { eligible_subscriptions: number; subscribed_users: number; active_users: number };
  outbox: { pending: number; queued: number; accepted: number; failed: number; expired: number };
  cooldown: { seconds_remaining: number; last_run_at: string | null };
  audience_policy: string;
  note: string;
};

type RunReport = {
  run_id: string;
  started_at: string;
  completed_at?: string;
  audience?: { eligible_subscriptions: number; subscribed_users: number };
  targeted: number;
  duplicates?: number;
  deliveries_queued: number;
  delivery: { pending: number; queued: number; accepted: number; failed: number; expired: number };
  deferred: boolean;
  state: "no-devices" | "complete" | "in-progress";
  status_url?: string;
  note: string;
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Token ${token}`, "Content-Type": "application/json" };
}

function Stat({ label, value, loading }: { label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-nv-md border border-nv-line bg-white/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-14" />
      ) : (
        <p className="nums-tabular mt-1 text-[22px] font-extrabold leading-7 text-nv-ink">{value}</p>
      )}
    </div>
  );
}

export function PushTestPanel() {
  const { token, user } = useApp();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshingRun, setRefreshingRun] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RunReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const loadReadiness = useCallback(async () => {
    if (!token) return;
    setLoadingReadiness(true);
    try {
      const response = await fetch(API, { headers: authHeaders(token), cache: "no-store" });
      if (!response.ok) throw new Error("Could not load notification readiness.");
      const data = (await response.json()) as Readiness;
      setReadiness(data);
      setCooldown(data.cooldown.seconds_remaining);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load readiness.");
    } finally {
      setLoadingReadiness(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user || user.role !== "admin") return;
    void loadReadiness();
  }, [token, user, loadReadiness]);

  // Local cooldown ticker so the button disables between runs.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendTest = useCallback(async () => {
    if (!token) return;
    setConfirming(false);
    setSending(true);
    setError(null);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as (RunReport & { detail?: string; retry_after_seconds?: number }) | null;
      if (!response.ok) {
        if (typeof data?.retry_after_seconds === "number") setCooldown(data.retry_after_seconds);
        throw new Error(data?.detail ?? "The test could not be sent.");
      }
      setResult(data as RunReport);
      void loadReadiness();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The test could not be sent.");
    } finally {
      setSending(false);
    }
  }, [token, loadReadiness]);

  const currentRunId = result?.run_id ?? null;

  const refreshRun = useCallback(async () => {
    if (!token || !currentRunId) return;
    setRefreshingRun(true);
    try {
      const response = await fetch(`${API}?run=${encodeURIComponent(currentRunId)}`, {
        headers: authHeaders(token),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not refresh the test result.");
      const data = (await response.json()) as RunReport;
      setResult((previous) => ({ ...(previous as RunReport), ...data }));
      void loadReadiness();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh the test result.");
    } finally {
      setRefreshingRun(false);
    }
  }, [token, currentRunId, loadReadiness]);

  if (!token || !user || user.role !== "admin") return null;

  const audience = readiness?.audience.eligible_subscriptions ?? 0;
  const busy = sending || refreshingRun;

  const onSendClick = () => {
    if (cooldown > 0 || sending) return;
    if (audience >= CONFIRM_ABOVE) setConfirming(true);
    else void sendTest();
  };

  return (
    <Card aria-labelledby="push-testing-heading">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-nv-primary"
          >
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="push-testing-heading" className="text-[16px] font-bold text-nv-ink">
              Push Notification Testing
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-nv-muted">
              Send a real test push through the production notification pipeline to{" "}
              <strong className="font-semibold text-nv-ink">
                every active account with an enabled push subscription
              </strong>{" "}
              — the same devices that receive election alerts. There is no narrower audience and no
              per-category opt-out; users unsubscribe from the notification bell.
            </p>
          </div>
        </div>

        {/* ---------------- Readiness stats ---------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Eligible subscribed devices" value={audience} loading={loadingReadiness} />
          <Stat
            label="Subscribed users"
            value={readiness?.audience.subscribed_users ?? 0}
            loading={loadingReadiness}
          />
          <Stat
            label="Queued deliveries (outbox)"
            value={(readiness?.outbox.pending ?? 0) + (readiness?.outbox.queued ?? 0)}
            loading={loadingReadiness}
          />
          <div className="rounded-nv-md border border-nv-line bg-white/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
              Push service configured
            </p>
            {loadingReadiness ? (
              <Skeleton className="mt-1.5 h-7 w-14" />
            ) : (
              <p
                className={cn(
                  "mt-1 text-[15px] font-bold",
                  readiness?.vapid_configured ? "text-emerald-600" : "text-nv-primary",
                )}
              >
                {readiness?.vapid_configured ? "Yes" : "No (VAPID missing)"}
              </p>
            )}
          </div>
        </div>

        {!loadingReadiness && readiness && !readiness.vapid_configured ? (
          <p className="rounded-nv-md border border-nv-primary/30 bg-nv-primary-100/60 p-3 text-[12.5px] leading-relaxed text-nv-ink">
            <ShieldAlert className="mr-1.5 inline h-4 w-4 -translate-y-0.5 text-nv-primary" aria-hidden="true" />
            Web Push is not configured on this deployment (VAPID keys are missing), so a test would
            create in-app notifications but no device push. Set the VAPID environment variables and
            redeploy.
          </p>
        ) : null}

        {/* ---------------- Actions ---------------- */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadReadiness()}
            disabled={loadingReadiness || busy}
          >
            <RefreshCw className={cn("h-4 w-4", loadingReadiness && "animate-spin")} aria-hidden="true" />
            Check Notification Readiness
          </Button>
          <Button type="button" onClick={onSendClick} disabled={busy || cooldown > 0}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {sending
              ? "Sending…"
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : `Send Test Notification${audience > 0 ? ` (${audience})` : ""}`}
          </Button>
        </div>

        {/* ---------------- Confirmation dialog ---------------- */}
        {confirming ? (
          <div
            role="alertdialog"
            aria-labelledby="push-confirm-heading"
            aria-describedby="push-confirm-body"
            className="rounded-nv-md border border-nv-line bg-white/90 p-4 shadow-nv-card backdrop-blur"
          >
            <p id="push-confirm-heading" className="text-[14px] font-bold text-nv-ink">
              Send a real test to {audience} subscribed device{audience === 1 ? "" : "s"}?
            </p>
            <p id="push-confirm-body" className="mt-1 text-[12.5px] leading-relaxed text-nv-muted">
              Every active account with an enabled push subscription will receive{" "}
              <strong className="font-semibold text-nv-ink">“NexVote Test Notification”</strong> on
              their devices. A cooldown applies between runs.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void sendTest()} disabled={sending}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Yes, send the test
              </Button>
              <Button type="button" variant="subtle" onClick={() => setConfirming(false)} disabled={sending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---------------- Errors ---------------- */}
        {error ? (
          <p
            role="alert"
            className="rounded-nv-md border border-nv-primary/40 bg-nv-primary-100/60 p-3 text-[12.5px] font-semibold leading-relaxed text-nv-primary"
          >
            <TriangleAlert className="mr-1.5 inline h-4 w-4 -translate-y-0.5" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {/* ---------------- Latest result ---------------- */}
        {result ? (
          <div className="rounded-nv-md border border-nv-line bg-white/80 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-bold text-nv-ink">Latest test result</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  result.state === "complete"
                    ? "bg-emerald-50 text-emerald-700"
                    : result.state === "in-progress"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-nv-surface text-nv-muted",
                )}
              >
                {result.state === "complete" ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {result.state === "complete"
                  ? "Delivery attempts finished"
                  : result.state === "in-progress"
                    ? "Delivery in progress"
                    : "No subscribed devices"}
              </span>
              <span className="ml-auto text-[11.5px] text-nv-muted">
                {new Date(result.started_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {[
                ["Run ID", result.run_id.slice(0, 8)],
                ["Targeted users", result.targeted],
                ["Delivery jobs queued", result.deliveries_queued],
                ["Provider accepted", result.delivery.accepted],
                ["Awaiting retry", result.delivery.pending + result.delivery.queued],
                ["Failed", result.delivery.failed],
                ["Expired subscriptions", result.delivery.expired],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
                    {label}
                  </dt>
                  <dd className="nums-tabular text-[14px] font-bold text-nv-ink">{String(value)}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[12px] leading-relaxed text-nv-muted">{result.note}</p>

            {result.state === "in-progress" ? (
              <Button
                type="button"
                variant="subtle"
                size="dense"
                className="mt-3"
                onClick={() => void refreshRun()}
                disabled={refreshingRun}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshingRun && "animate-spin")} aria-hidden="true" />
                {refreshingRun ? "Refreshing…" : "Refresh result"}
              </Button>
            ) : null}

            {result.state === "complete" && result.delivery.failed > 0 ? (
              <p className="mt-2 text-[12px] font-semibold leading-relaxed text-amber-700">
                Partial success: {result.delivery.failed} delivery attempt
                {result.delivery.failed === 1 ? "" : "s"} failed after retries. Failures are recorded
                in the delivery outbox and never retried beyond the attempt limit.
              </p>
            ) : null}
            {result.state === "complete" && result.delivery.failed === 0 && result.targeted > 0 ? (
              <p className="mt-2 text-[12px] font-semibold leading-relaxed text-emerald-700">
                All {result.delivery.accepted} delivery attempt
                {result.delivery.accepted === 1 ? " was" : "s were"} accepted by the push services.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
