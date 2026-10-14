import { prisma } from "@/src/lib/db";
import type { Prisma } from "@/src/generated/prisma/client";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { deliverNotificationPushes, retryDuePushDeliveries } from "@/src/lib/push";
import { safeTargetUrl } from "@/src/lib/notifications/safe-url";

export type NotifyInput = {
  /** Users who should receive this notification. Empty = nothing happens. */
  recipientIds: number[];
  title: string;
  body?: string;
  /** Safe same-origin path, e.g. /elections/some-slug. */
  targetUrl?: string;
  tag?: string;
  /** e.g. announcement | election | request | officer | account. */
  category?: string;
  data?: Record<string, unknown>;
  /**
   * Stable key per logical event + recipient. Retrying the same event with
   * the same key never creates a duplicate notification.
   */
  idempotencyKey?: string;
  /** Skip Web Push delivery (in-app record only). */
  inAppOnly?: boolean;
};

export type NotifyOutcome = {
  createdIds: number[];
  duplicateOf: number[];
  deliveriesQueued: number;
  pushAttempted: boolean;
};

const MAX_TITLE = 180;
const MAX_BODY = 1000;
const INLINE_PUSH_LIMIT = 25;

/**
 * Persists one notification per recipient, schedules Web Push delivery from
 * the durable outbox, and (for small batches) attempts delivery inline before
 * returning. The push provider accepting a request does not prove the device
 * displayed it.
 */
export async function notify(input: NotifyInput): Promise<NotifyOutcome> {
  const title = (input.title ?? "").trim().slice(0, MAX_TITLE);
  const body = (input.body ?? "").trim().slice(0, MAX_BODY);
  const targetUrl = safeTargetUrl(input.targetUrl) ?? "";
  const tag = (input.tag ?? "").trim().slice(0, 80);
  const category = (input.category ?? "general").trim().slice(0, 40);
  const recipientIds = [...new Set(input.recipientIds.filter((id) => Number.isInteger(id) && id > 0))];

  const outcome: NotifyOutcome = {
    createdIds: [],
    duplicateOf: [],
    deliveriesQueued: 0,
    pushAttempted: false,
  };
  if (!title || !recipientIds.length) return outcome;

  const created: Array<{ id: number; recipientId: number }> = [];
  const duplicates: number[] = [];

  for (const recipientId of recipientIds) {
    const idempotencyKey = input.idempotencyKey
      ? `${input.idempotencyKey}:${recipientId}`.slice(0, 200)
      : null;
    try {
      const notification = await prisma.notification.create({
        data: {
          recipientId,
          title,
          body,
          category,
          targetUrl,
          tag,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
          idempotencyKey,
        },
      });
      created.push({ id: notification.id, recipientId });
    } catch (error) {
      if (isUniqueConstraintViolation(error) && idempotencyKey) {
        const existing = await prisma.notification.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          duplicates.push(existing.id);
          continue;
        }
      }
      throw error;
    }
  }

  outcome.createdIds = created.map((row) => row.id);
  outcome.duplicateOf = duplicates;

  if (!input.inAppOnly && created.length) {
    // Create one outbox row per (new notification × active subscription).
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipientIds }, disabledAt: null },
      select: { id: true, userId: true },
    });
    if (subscriptions.length) {
      const byUser = new Map<number, number[]>();
      for (const sub of subscriptions) {
        const list = byUser.get(sub.userId) ?? [];
        list.push(sub.id);
        byUser.set(sub.userId, list);
      }
      const rows: Array<{ notificationId: number; subscriptionId: number }> = [];
      for (const { id: notificationId, recipientId } of created) {
        for (const subscriptionId of byUser.get(recipientId) ?? []) {
          rows.push({ notificationId, subscriptionId });
        }
      }
      if (rows.length) {
        await prisma.pushDelivery.createMany({ data: rows, skipDuplicates: true });
        outcome.deliveriesQueued = rows.length;
      }
    }
  }

  // Attempt delivery inline for small batches; larger fan-outs rely on the
  // opportunistic retry pass so the API request is not held open.
  if (!input.inAppOnly && created.length) {
    outcome.pushAttempted = true;
    if (created.length <= INLINE_PUSH_LIMIT) {
      for (const { id: notificationId } of created) {
        await deliverNotificationPushes(notificationId).catch(() => undefined);
      }
    } else {
      void Promise.all(
        created.map(({ id: notificationId }) =>
          deliverNotificationPushes(notificationId).catch(() => undefined),
        ),
      );
    }
  }

  return outcome;
}

/** Notify many users with the same content and a shared idempotency prefix. */
export async function notifyUsers(
  recipientIds: number[],
  content: Omit<NotifyInput, "recipientIds">,
): Promise<NotifyOutcome> {
  return notify({ ...content, recipientIds });
}

/**
 * Kicks the opportunistic outbox drain. Safe to call from read paths; never
 * throws (delivery problems must not break list endpoints).
 */
export function schedulePushRetry(): void {
  void retryDuePushDeliveries().catch(() => undefined);
}
