import { makeRoute, noContent } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { recordAudit, clientIp } from "@/src/lib/audit";

export const DELETE = makeRoute({
  permission: "officer",
  intParams: ["pk", "voter_pk"],
  handlers: {
    DELETE: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const voterId = Number(params.voter_pk);
      const existing = await prisma.electionVoter.findFirst({
        where: { id: voterId, electionId: election.id },
      });
      if (!existing) throw notFoundModel("ElectionVoter");

      await prisma.electionVoter.delete({ where: { id: existing.id } });

      await recordAudit({
        actorId: officer.id,
        action: "officer.voter.remove",
        entityType: "Election",
        entityId: election.id,
        summary: `Removed eligible voter #${existing.id} from "${election.title}"`,
        detail: { voter_id: existing.id },
        ipAddress: clientIp(req),
      });

      return noContent();
    },
  },
});
