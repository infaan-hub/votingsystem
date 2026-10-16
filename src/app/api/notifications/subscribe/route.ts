import crypto from "node:crypto";

import { json, makeRoute } from "@/src/lib/api";
import { Collector, strField } from "@/src/lib/fields";
import { clientIp } from "@/src/lib/audit";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import {
  MAX_ENDPOINT_LENGTH,
  registerPushSubscription,
  validateSubscription,
  type SubscribePayload,
} from "@/src/lib/notifications/subscription";

/**
 * Non-reversible fingerprint of an endpoint. The client compares it with the
 * fingerprint of its own browser subscription to tell whether this device
 * belongs to the signed-in account — the endpoint secret never leaves the
 * server.
 */
function hashEndpoint(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint, "utf8").digest("hex").slice(0, 32);
}

function serializeSubscription(subscription: {
  id: number;
  endpoint: string;
  userAgent: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  disabledAt: Date | null;
}) {
  return {
    id: subscription.id,
    endpoint_hash: hashEndpoint(subscription.endpoint),
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
    /**
     * Register (or refresh) a Push API subscription for the signed-in user.
     * A browser subscription left behind by another account moves over here;
     * registerPushSubscription audits that reassignment.
     */
    POST: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = (await readPayload(req)) as SubscribePayload;
      const { endpoint, p256dh, auth } = validateSubscription(payload);

      const { subscription, existing } = await registerPushSubscription({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
        ipAddress: clientIp(req),
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
