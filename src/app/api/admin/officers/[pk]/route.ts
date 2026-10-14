import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { notifyOfficerRevoked } from "@/src/lib/notifications/events";

/**
 * DELETE: deactivate an officer assignment. The officer keeps their account
 * but loses the scope this assignment granted. Assignments are never hard
 * deleted — the audit trail depends on them remaining queryable.
 */
export const DELETE = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    DELETE: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = await prisma.officerAssignment.findUnique({
        where: { id: pk },
        include: { officer: { select: { id: true, username: true } } },
      });
      if (!existing) throw notFoundModel("OfficerAssignment");

      // Resolve the affected officer while the assignment still exists, and
      // only notify when this call actually revoked an active assignment —
      // a repeated DELETE must stay silent.
      const wasActive = existing.isActive;
      const revokedOfficer = { id: existing.id, officerId: existing.officerId };

      const updated = await prisma.officerAssignment.update({
        where: { id: pk },
        data: { isActive: false },
      });

      if (wasActive) {
        await notifyOfficerRevoked(revokedOfficer);
      }

      await recordAudit({
        actorId: admin.id,
        action: "admin.officer.revoke",
        entityType: "OfficerAssignment",
        entityId: pk,
        summary: `Officer ${existing.officer.username} assignment #${pk} revoked`,
        ipAddress: clientIp(req),
      });

      return json({ id: updated.id, is_active: updated.isActive });
    },
  },
});
