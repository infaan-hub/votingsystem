import { fieldErrors } from "@/src/lib/http";
import { Collector, strField } from "@/src/lib/fields";
import { recordAudit } from "@/src/lib/audit";
import { prisma } from "@/src/lib/db";

export const MAX_ENDPOINT_LENGTH = 1024;
export const MAX_KEY_LENGTH = 256;

export type SubscribePayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  expirationTime?: unknown;
};

export type ParsedSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Strict validation for push registrations: bad input becomes 400s. */
export function validateSubscription(payload: SubscribePayload): ParsedSubscription {
  const c = new Collector();
  const endpoint = strField(c, payload, "endpoint", { required: true, maxLength: MAX_ENDPOINT_LENGTH });
  const keys = (payload.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  const p256dhKey = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const authKey = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!p256dhKey) c.field("keys.p256dh", "This field is required.");
  else if (p256dhKey.length > MAX_KEY_LENGTH) c.field("keys.p256dh", "This value is too long.");
  if (!authKey) c.field("keys.auth", "This field is required.");
  else if (authKey.length > MAX_KEY_LENGTH) c.field("keys.auth", "This value is too long.");
  c.throwIfAny();

  if (endpoint && !/^https:\/\//i.test(endpoint)) {
    throw fieldErrors({ endpoint: "Push endpoints must be https URLs." });
  }
  return { endpoint: endpoint!, p256dh: p256dhKey, auth: authKey };
}

/**
 * Lenient variant for optional payloads — e.g. a device subscription attached
 * to a sign-in request. Anything invalid is ignored instead of failing the
 * request that carried it.
 */
export function tryParseSubscription(payload: unknown): ParsedSubscription | null {
  try {
    return validateSubscription((payload ?? {}) as SubscribePayload);
  } catch {
    return null;
  }
}

export type RegisterPushSubscriptionInput = {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  ipAddress?: string;
};

/**
 * Registers (or refreshes) a browser Push subscription for an account.
 *
 * A push endpoint belongs to the browser instance, not to an account: when the
 * same browser signs into a different account and enables notifications, the
 * registration moves to that account so it can receive alerts — and login
 * codes. The move is audited, so shared devices stay traceable.
 */
export async function registerPushSubscription(input: RegisterPushSubscriptionInput) {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
  });

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    },
    update: {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      disabledAt: null,
      lastFailureAt: null,
    },
  });

  if (existing && existing.userId !== input.userId) {
    await recordAudit({
      actorId: input.userId,
      action: "notification.subscription.reassigned",
      entityType: "PushSubscription",
      entityId: subscription.id,
      summary: "Browser push subscription reassigned to this account",
      detail: { previous_user_id: existing.userId },
      ipAddress: input.ipAddress,
    });
  }

  return { subscription, existing: Boolean(existing) };
}
