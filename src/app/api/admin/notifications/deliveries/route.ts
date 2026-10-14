import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";

/**
 * GET: operational view of recent push delivery attempts (admin only).
 * Statuses are what the outbox actually recorded: accepted means the push
 * service accepted the message — not that a device displayed it.
 */
export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const limitRaw = Number(url.searchParams.get("limit") ?? "100");
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
      const statusFilter = url.searchParams.get("status");

      const deliveries = await prisma.pushDelivery.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          notification: { select: { id: true, title: true, category: true, createdAt: true } },
          subscription: {
            select: {
              id: true,
              userId: true,
              userAgent: true,
              lastSuccessAt: true,
              lastFailureAt: true,
              disabledAt: true,
            },
          },
        },
      });

      const counts = await prisma.pushDelivery.groupBy({
        by: ["status"],
        _count: { _all: true },
      });

      return json({
        counts: Object.fromEntries(
          counts.map((row) => [row.status, row._count._all]),
        ) as Record<string, number>,
        results: deliveries.map((delivery) => ({
          id: delivery.id,
          status: delivery.status,
          attempt_count: delivery.attemptCount,
          last_attempt_at: delivery.lastAttemptAt?.toISOString() ?? null,
          next_attempt_at: delivery.nextAttemptAt?.toISOString() ?? null,
          error_code: delivery.errorCode,
          accepted_at: delivery.acceptedAt?.toISOString() ?? null,
          notification: {
            id: delivery.notification.id,
            title: delivery.notification.title,
            category: delivery.notification.category,
          },
          subscription: delivery.subscription
            ? {
                id: delivery.subscription.id,
                user_id: delivery.subscription.userId,
                user_agent: delivery.subscription.userAgent,
                is_disabled: delivery.subscription.disabledAt !== null,
              }
            : null,
        })),
      });
    },
  },
});
