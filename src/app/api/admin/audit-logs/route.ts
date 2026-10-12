import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/time";

/**
 * Append-only activity feed. Administrators only; there is deliberately no
 * POST, PATCH or DELETE — audit rows are written by server code alone.
 */
export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const action = url.searchParams.get("action")?.trim() || undefined;
      const entityType = url.searchParams.get("entity_type")?.trim() || undefined;
      const actorId = url.searchParams.get("actor_id");
      const limitParam = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
      const offsetParam = Number(url.searchParams.get("offset") ?? 0);
      const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;

      const where = {
        ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
        ...(entityType ? { entityType } : {}),
        ...(actorId && /^\d+$/.test(actorId) ? { actorId: Number(actorId) } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { actor: { select: { id: true, username: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return json({
        total,
        count: rows.length,
        results: rows.map((row) => ({
          id: row.id,
          action: row.action,
          entity_type: row.entityType,
          entity_id: row.entityId,
          summary: row.summary,
          detail: row.detail,
          ip_address: row.ipAddress,
          created_at: formatDateTime(row.createdAt),
          actor: row.actor
            ? {
                id: row.actor.id,
                username: row.actor.username,
                full_name: `${row.actor.firstName} ${row.actor.lastName}`.trim(),
              }
            : null,
        })),
      });
    },
  },
});
