import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { notify, schedulePushRetry } from "@/src/lib/notifications/notify";
import { serializeNotification } from "@/src/lib/notifications/serialize";
import { safeTargetUrl } from "@/src/lib/notifications/safe-url";

const MAX_TITLE = 180;
const MAX_BODY = 1000;
const MAX_URL = 500;
const RATE_LIMIT_PER_MINUTE = 30;

/**
 * POST: create a notification. By default the recipient is the signed-in
 * user (used by the client `notify()` helper to reach all of their devices).
 * Only administrators may target other users.
 */
const route = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);
      const c = new Collector();
      const title = strField(c, payload, "title", { required: true, maxLength: MAX_TITLE });
      const body = strField(c, payload, "body", {
        required: false, allowBlank: true, maxLength: MAX_BODY,
      });
      const targetUrlRaw = strField(c, payload, "target_url", {
        required: false, allowBlank: true, maxLength: MAX_URL,
      });
      const tag = strField(c, payload, "tag", { required: false, allowBlank: true, maxLength: 80 });
      const category = strField(c, payload, "category", {
        required: false, allowBlank: true, maxLength: 40,
      });
      const idempotencyKey = strField(c, payload, "idempotency_key", {
        required: false, allowBlank: true, maxLength: 180,
      });
      const recipientIdsRaw = payload.recipient_ids;
      if (
        recipientIdsRaw !== undefined &&
        (!Array.isArray(recipientIdsRaw) ||
          recipientIdsRaw.some((id) => !Number.isInteger(id) || Number(id) <= 0))
      ) {
        c.field("recipient_ids", "Recipient ids must be a list of positive integers.");
      }
      c.throwIfAny();

      const targetUrl = safeTargetUrl(targetUrlRaw);
      if (targetUrl === null) {
        throw fieldErrors({ target_url: "Only same-origin paths like /elections are allowed." });
      }

      let recipientIds: number[];
      if (Array.isArray(recipientIdsRaw) && recipientIdsRaw.length) {
        if (user.role !== "admin") {
          throw new ApiError(403, {
            detail: "Only administrators may send notifications to other users.",
          });
        }
        if (recipientIdsRaw.length > 500) {
          throw fieldErrors({ recipient_ids: "At most 500 recipients per request." });
        }
        recipientIds = recipientIdsRaw.map(Number);
      } else {
        recipientIds = [user.id];
      }

      // Lightweight per-user throttle; a full rate limiter belongs at the edge.
      const recent = await prisma.notification.count({
        where: { recipientId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (recent >= RATE_LIMIT_PER_MINUTE) {
        throw new ApiError(429, { detail: "Too many notifications. Try again in a minute." });
      }

      const outcome = await notify({
        recipientIds,
        title: title!,
        body: body ?? "",
        targetUrl: targetUrl ?? "",
        tag: tag ?? "",
        category: category || "general",
        idempotencyKey: idempotencyKey || undefined,
      });

      if (!outcome.createdIds.length && outcome.duplicateOf.length) {
        const duplicateId = outcome.duplicateOf[0];
        const existing = duplicateId
          ? await prisma.notification.findUnique({ where: { id: duplicateId } })
          : null;
        return json(
          { notification: existing ? serializeNotification(existing) : null, duplicate: true },
          200,
        );
      }

      const created = outcome.createdIds.length
        ? await prisma.notification.findUnique({ where: { id: outcome.createdIds[0]! } })
        : null;
      return json(
        {
          notification: created ? serializeNotification(created) : null,
          queued: outcome.deliveriesQueued,
          recipients: outcome.createdIds.length,
        },
        201,
      );
    },

    /** GET: the signed-in user's notifications, newest first. */
    GET: async (req, _params, state) => {
      const user = requireStateUser(state);
      const url = new URL(req.url);
      const limitRaw = Number(url.searchParams.get("limit") ?? "50");
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100);
      const unreadOnly = url.searchParams.get("unread") === "1";

      schedulePushRetry();

      const notifications = await prisma.notification.findMany({
        where: { recipientId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return json(notifications.map(serializeNotification));
    },
  },
});

export { route as GET, route as POST };
