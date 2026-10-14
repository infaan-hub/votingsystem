import webpush from "web-push";
import { prisma } from "@/src/lib/db";

/**
 * Server-side Web Push delivery. VAPID credentials come from environment
 * variables and never leave the server. The push provider accepting a request
 * means the message was queued by the browser vendor — it does not prove the
 * end device displayed it.
 *
 * Delivery model on a serverless host (Vercel): every send writes a durable
 * PushDelivery outbox row inside the notify() transaction; attempts then run
 * inline with bounded concurrency. Retryable failures get a nextAttemptAt and
 * are retried opportunistically by later notify()/list calls
 * (`retryDuePushDeliveries`), so no separate always-on worker is required.
 */

const MAX_ATTEMPTS = 4;
const INLINE_CONCURRENCY = 6;

let configured = false;

export class PushConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new PushConfigError(
      `Missing ${name}. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to enable Web Push.`,
    );
  }
  return value.trim();
}

function ensureVapidConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    requireEnv("VAPID_SUBJECT"),
    requireEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY"),
  );
  configured = true;
}

export type PushErrorKind = "expired" | "auth" | "retryable" | "fatal";

/** Classifies a web-push failure so callers can update the outbox correctly. */
export function classifyPushError(error: unknown): { kind: PushErrorKind; code: string } {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : NaN;
  const body =
    typeof error === "object" && error !== null && "body" in error
      ? String((error as { body?: unknown }).body ?? "")
      : "";

  if (statusCode === 404 || statusCode === 410) {
    return { kind: "expired", code: `http_${statusCode}` };
  }
  if (statusCode === 401 || statusCode === 403) {
    // VAPID/endpoint auth problems are not fixed by blind retries.
    return { kind: "auth", code: `http_${statusCode}` };
  }
  if (statusCode === 413) {
    return { kind: "fatal", code: "payload_too_large" };
  }
  if (!Number.isNaN(statusCode) && statusCode >= 400 && statusCode < 500) {
    return { kind: "fatal", code: `http_${statusCode}` };
  }
  if (error instanceof Error && /timeout|ECONNRESET|ENOTFOUND|socket/i.test(error.message)) {
    return { kind: "retryable", code: "network" };
  }
  // 5xx and unknown transport failures: retry with backoff.
  return { kind: "retryable", code: body ? `http_${statusCode || 500}` : "unknown" };
}

function backoffMs(attemptCount: number): number {
  // 30s, 2m, 8m, 30m — capped, no jitter needed at this scale.
  const steps = [30_000, 120_000, 480_000, 1_800_000];
  return steps[Math.min(attemptCount, steps.length - 1)] ?? 1_800_000;
}

export type PushPayload = {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  url?: string;
  category?: string;
  notificationId?: number;
  data?: Record<string, unknown>;
};

type DeliveryRow = {
  id: number;
  notificationId: number;
  attemptCount: number;
  /** Null after the device subscription was deleted (expired/unsubscribed). */
  subscription: {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    userId: number;
  } | null;
  notification: { title: string; body: string; tag: string; targetUrl: string; category: string };
};

async function sendOne(row: DeliveryRow, payload: PushPayload) {
  const subscription = row.subscription;
  if (!subscription) {
    // The device is gone; nothing to send to. Record the terminal state.
    await prisma.pushDelivery.update({
      where: { id: row.id },
      data: { status: "expired", errorCode: "subscription_missing", nextAttemptAt: null },
    });
    return "expired" as const;
  }
  ensureVapidConfigured();
  const now = new Date();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, urgency: "normal" },
    );
    await prisma.pushDelivery.update({
      where: { id: row.id },
      data: {
        status: "accepted",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        acceptedAt: now,
        nextAttemptAt: null,
        errorCode: "",
      },
    });
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { lastSuccessAt: now, lastFailureAt: null, disabledAt: null },
    });
    return "accepted" as const;
  } catch (error) {
    const { kind, code } = classifyPushError(error);
    const attemptCount = row.attemptCount + 1;

    if (kind === "expired") {
      // Permanent provider expiration: remove the subscription entirely so it
      // can never be targeted again. The delivery row survives (SET NULL) and
      // keeps the terminal "expired" state for auditing.
      await prisma.pushDelivery.update({
        where: { id: row.id },
        data: {
          status: "expired",
          attemptCount,
          lastAttemptAt: now,
          nextAttemptAt: null,
          errorCode: code,
        },
      });
      await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
      return "expired" as const;
    }

    const exhausted = kind !== "retryable" || attemptCount >= MAX_ATTEMPTS;
    await prisma.pushDelivery.update({
      where: { id: row.id },
      data: {
        status: exhausted ? "failed" : "queued",
        attemptCount,
        lastAttemptAt: now,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffMs(attemptCount)),
        errorCode: code,
      },
    });
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: {
        lastFailureAt: now,
        ...(kind === "auth" ? { disabledAt: now } : {}),
      },
    });
    return exhausted ? ("failed" as const) : ("queued" as const);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) break;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Attempts delivery for every non-terminal outbox row of a notification.
 * Safe to call more than once; already-accepted rows are skipped.
 */
export async function deliverNotificationPushes(
  notificationId: number,
  options: { concurrency?: number } = {},
): Promise<{ accepted: number; failed: number; expired: number; queued: number }> {
  const rows = (await prisma.pushDelivery.findMany({
    where: { notificationId, status: { in: ["pending", "queued"] } },
    include: { subscription: true, notification: true },
  })) as unknown as DeliveryRow[];

  const summary = { accepted: 0, failed: 0, expired: 0, queued: 0 };
  if (!rows.length) return summary;

  const payloadFor = (row: DeliveryRow): PushPayload => ({
    title: row.notification.title,
    body: row.notification.body,
    tag: row.notification.tag || `n-${row.notificationId}`,
    url: row.notification.targetUrl || "/notifications",
    category: row.notification.category,
    notificationId: row.notificationId,
  });

  await runWithConcurrency(rows, options.concurrency ?? INLINE_CONCURRENCY, async (row) => {
    const outcome = await sendOne(row, payloadFor(row));
    summary[outcome] += 1;
  });
  return summary;
}

/**
 * Opportunistically retries due queued/failed deliveries. Called from list and
 * notify paths so a serverless deployment still drains the outbox over time.
 */
export async function retryDuePushDeliveries(limit = 25): Promise<number> {
  const due = await prisma.pushDelivery.findMany({
    where: {
      status: "queued",
      nextAttemptAt: { lte: new Date() },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    include: { subscription: true, notification: true },
  });
  if (!due.length) return 0;

  await runWithConcurrency(due as unknown as DeliveryRow[], INLINE_CONCURRENCY, async (row) => {
    await sendOne(row, {
      title: row.notification.title,
      body: row.notification.body,
      tag: row.notification.tag || `n-${row.notificationId}`,
      url: row.notification.targetUrl || "/notifications",
      category: row.notification.category,
      notificationId: row.notificationId,
    });
  });
  return due.length;
}
