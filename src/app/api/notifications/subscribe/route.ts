import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";

const MAX_ENDPOINT_LENGTH = 1024;
const MAX_KEY_LENGTH = 256;

type SubscribePayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  expirationTime?: unknown;
};

function validateSubscription(payload: SubscribePayload) {
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

function serializeSubscription(subscription: {
  id: number;
  userAgent: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  disabledAt: Date | null;
}) {
  return {
    id: subscription.id,
    user_agent: subscription.userAgent,
    created_at: subscription.createdAt.toISOString(),
    last_success_at: subscription.lastSuccessAt?.toISOString() ?? null,
    last_failure_at: subscription.lastFailureAt?.toISOString() ?? null,
    is_disabled: subscription.disabledAt !== null,
  };
}

const route = makeRoute({
  permission: "authenticated",
  handlers: {
    /** Register (or refresh) a Push API subscription for the signed-in user. */
    POST: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = (await readPayload(req)) as SubscribePayload;
      const { endpoint, p256dh, auth } = validateSubscription(payload);

      // The same endpoint may only belong to one account.
      const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
      if (existing && existing.userId !== user.id) {
        throw new ApiError(403, {
          detail: "This browser subscription is registered to a different account.",
        });
      }

      const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300);
      const subscription = await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: user.id, endpoint, p256dh, auth, userAgent },
        update: {
          userId: user.id,
          p256dh,
          auth,
          userAgent,
          disabledAt: null,
          lastFailureAt: null,
        },
      });
      return json(serializeSubscription(subscription), existing ? 200 : 201);
    },

    /** Remove a subscription by endpoint (used when the user disables push). */
    DELETE: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = (await readPayload(req)) as { endpoint?: unknown };
      const c = new Collector();
      const endpoint = strField(c, payload, "endpoint", { required: true, maxLength: MAX_ENDPOINT_LENGTH });
      c.throwIfAny();

      const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: endpoint! } });
      if (!existing || existing.userId !== user.id) {
        // Idempotent: removing an unknown/foreign endpoint is a no-op success.
        return json({ removed: 0 });
      }
      await prisma.pushSubscription.delete({ where: { id: existing.id } });
      return json({ removed: 1 });
    },

    /** The signed-in user's own devices (no endpoint secrets exposed). */
    GET: async (_req, _params, state) => {
      const user = requireStateUser(state);
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      return json(subscriptions.map(serializeSubscription));
    },
  },
});

// One dispatcher handles GET/POST/DELETE; Next.js needs each as a named export.
export { route as GET, route as POST, route as DELETE };
