import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";

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

      const updated = await prisma.officerAssignment.update({
        where: { id: pk },
        data: { isActive: false },
      });

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
