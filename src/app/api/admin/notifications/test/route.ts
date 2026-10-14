import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { notify, INLINE_PUSH_LIMIT } from "@/src/lib/notifications/notify";

/**
 * Administrator push-notification testing.
 *
 * GET  → readiness (audience size, VAPID configuration presence, outbox
 *        backlog, cooldown) or, with `?run=<id>`, the truthful delivery
 *        report for one test run.
 * POST → sends one clearly-labelled test notification through the existing
 *        notify() pipeline to the authoritative audience: every ACTIVE account
 *        that currently has a non-disabled push subscription. The client never
 *        supplies recipients.
 *
 * Status vocabulary is deliberately honest:
 *  - queued:     a durable outbox job exists;
 *  - accepted:   the push service accepted the request (not proof of display);
 *  - failed:     attempts are exhausted or permanent;
 *  - expired:    the provider reported the subscription gone (device removed).
 * A "device displayed / read" state is never reported because the platform
 * has no acknowledgement channel for it.
 *
 * There is no per-category notification preference system in this project;
 * the opt-out mechanism is removing/disabling the subscription (bell menu,
 * DELETE /api/notifications/subscribe), which this audience query honors via
 * `disabledAt: null` and `user.isActive`.
 */

const TEST_TAG = "nexvote-admin-push-test";
const TEST_TITLE = "NexVote Test Notification";
const TEST_BODY =
  "This is a test notification from NexVote. Your device is subscribed to push notifications.";
/** Cooldown between test runs by the same administrator. */
const COOLDOWN_MS = 60_000;

type DeliveryTallies = {
  pending: number;
  queued: number;
  accepted: number;
  failed: number;
  expired: number;
};

async function talliesFor(notificationIds: number[]): Promise<DeliveryTallies> {
  const empty: DeliveryTallies = { pending: 0, queued: 0, accepted: 0, failed: 0, expired: 0 };
  if (!notificationIds.length) return empty;
  const grouped = await prisma.pushDelivery.groupBy({
    by: ["status"],
    where: { notificationId: { in: notificationIds } },
    _count: { _all: true },
  });
  const out = { ...empty };
  for (const row of grouped) {
    if (row.status in out) {
      out[row.status as keyof DeliveryTallies] = row._count._all;
    }
  }
  return out;
}

function deliveryState(tallies: DeliveryTallies): "no-devices" | "complete" | "in-progress" {
  const total = tallies.pending + tallies.queued + tallies.accepted + tallies.failed + tallies.expired;
  if (total === 0) return "no-devices";
  if (tallies.pending + tallies.queued === 0) return "complete";
  return "in-progress";
}

const HONESTY_NOTE =
  "Queued means a delivery job exists; accepted means the push service accepted the request. " +
  "Neither confirms the device displayed the notification — this platform cannot observe that.";

async function vapidStatus(): Promise<{ configured: boolean; problem: string | null }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return { configured: false, problem: "missing" };
  // web-push requires mailto: or https: — anything else throws at first send
  // and the outbox rows would silently stay pending.
  const validSubject = /^mailto:[^@\s]+@[^@\s]+$/.test(subject) || /^https:\/\/[^\s]+$/.test(subject);
  if (!validSubject) return { configured: false, problem: "invalid_subject" };
  return { configured: true, problem: null };
}

/** Seconds this administrator must still wait before another test run. */
async function cooldownRemaining(actorId: number, now: Date): Promise<{ seconds: number; lastRunAt: Date | null }> {
  const last = await prisma.auditLog.findFirst({
    where: { actorId, action: "admin.notifications.test" },
    orderBy: { id: "desc" },
    select: { createdAt: true },
  });
  if (!last) return { seconds: 0, lastRunAt: null };
  const elapsed = now.getTime() - last.createdAt.getTime();
  const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
  return { seconds: remaining, lastRunAt: last.createdAt };
}

const route = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req, _params, state) => {
      const admin = requireStateAdmin(state);
      const url = new URL(req.url);
      const runId = url.searchParams.get("run");

      // ---- Status of one test run -------------------------------------
      if (runId) {
        if (!/^[A-Za-z0-9-]{8,64}$/.test(runId)) {
          return json({ detail: "Unknown test run." }, 404);
        }
        const notifications = await prisma.notification.findMany({
          where: { tag: TEST_TAG, data: { path: ["test_run_id"], equals: runId } },
          orderBy: { id: "asc" },
          select: { id: true, createdAt: true },
        });
        if (!notifications.length) return json({ detail: "Unknown test run." }, 404);
        const tallies = await talliesFor(notifications.map((row) => row.id));
        return json({
          run_id: runId,
          started_at: notifications[0]!.createdAt.toISOString(),
          targeted: notifications.length,
          delivery: tallies,
          deliveries_queued:
            tallies.pending + tallies.queued + tallies.accepted + tallies.failed + tallies.expired,
          state: deliveryState(tallies),
          note: HONESTY_NOTE,
        });
      }

      // ---- Readiness ---------------------------------------------------
      const [activeSubscriptions, subscribedUsers, activeUsers, outbox, cooldown, vapid] =
        await Promise.all([
          prisma.pushSubscription.count({ where: { disabledAt: null, user: { isActive: true } } }),
          prisma.pushSubscription.findMany({
            where: { disabledAt: null, user: { isActive: true } },
            distinct: ["userId"],
            select: { userId: true },
          }),
          prisma.user.count({ where: { isActive: true } }),
          prisma.pushDelivery.groupBy({
            by: ["status"],
            _count: { _all: true },
          }),
          cooldownRemaining(admin.id, new Date()),
          vapidStatus(),
        ]);

      const outboxCounts: Record<string, number> = {};
      for (const row of outbox) outboxCounts[row.status] = row._count._all;

      return json({
        vapid_configured: vapid.configured,
        vapid_problem: vapid.problem,
        audience: {
          eligible_subscriptions: activeSubscriptions,
          subscribed_users: subscribedUsers.length,
          active_users: activeUsers,
        },
        outbox: {
          pending: outboxCounts.pending ?? 0,
          queued: outboxCounts.queued ?? 0,
          accepted: outboxCounts.accepted ?? 0,
          failed: outboxCounts.failed ?? 0,
          expired: outboxCounts.expired ?? 0,
        },
        cooldown: {
          seconds_remaining: cooldown.seconds,
          last_run_at: cooldown.lastRunAt?.toISOString() ?? null,
        },
        audience_policy:
          "Active accounts with an enabled push subscription. Users opt out by removing their subscription from the notification bell.",
        note: HONESTY_NOTE,
      });
    },

    POST: async (_req, _params, state) => {
      const admin = requireStateAdmin(state);
      const startedAt = new Date();

      // Durable, server-side cooldown (AuditLog survives serverless restarts).
      const cooldown = await cooldownRemaining(admin.id, startedAt);
      if (cooldown.seconds > 0) {
        return json(
          {
            detail: `A test was already sent moments ago. Wait ${cooldown.seconds} second(s) before sending another.`,
            retry_after_seconds: cooldown.seconds,
          },
          429,
        );
      }

      // Authoritative audience: never from the request body.
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { disabledAt: null, user: { isActive: true } },
        select: { userId: true },
      });
      const recipientIds = [...new Set(subscriptions.map((row) => row.userId))];

      // Unique per run, so repeated tests are never suppressed by idempotency
      // while a retried request for the SAME run still deduplicates per user.
      const runId = crypto.randomUUID();

      const outcome = await notify({
        recipientIds,
        title: TEST_TITLE,
        body: TEST_BODY,
        targetUrl: "/admin/profile",
        tag: TEST_TAG,
        category: "test",
        idempotencyKey: `admin-push-test-${runId}`,
        data: { test_run_id: runId, kind: "admin-push-test" },
      });

      const tallies = await talliesFor(outcome.createdIds);
      const deferred = outcome.createdIds.length > INLINE_PUSH_LIMIT;

      await recordAudit({
        actorId: admin.id,
        action: "admin.notifications.test",
        entityType: "PushNotificationTest",
        entityId: runId,
        summary: `Push test run ${runId}: audience ${subscriptions.length} device(s), targeted ${outcome.createdIds.length}, queued ${outcome.deliveriesQueued}`,
        detail: {
          run_id: runId,
          audience_devices: subscriptions.length,
          audience_users: recipientIds.length,
          targeted: outcome.createdIds.length,
          deliveries_queued: outcome.deliveriesQueued,
          deferred,
        },
        ipAddress: clientIp(_req),
      });

      return json(
        {
          run_id: runId,
          started_at: startedAt.toISOString(),
          completed_at: new Date().toISOString(),
          audience: {
            eligible_subscriptions: subscriptions.length,
            subscribed_users: recipientIds.length,
          },
          targeted: outcome.createdIds.length,
          duplicates: outcome.duplicateOf.length,
          deliveries_queued: outcome.deliveriesQueued,
          delivery: tallies,
          deferred,
          state: deliveryState(tallies),
          // For large audiences delivery continues after this response; the
          // admin can poll the run status for the real outcome.
          status_url: `/api/admin/notifications/test?run=${runId}`,
          note: HONESTY_NOTE,
        },
        201,
      );
    },
  },
});

// One dispatcher handles GET/POST; Next.js needs each as a named export.
export { route as GET, route as POST };
