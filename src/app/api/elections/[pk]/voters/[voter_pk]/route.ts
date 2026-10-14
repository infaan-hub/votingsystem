import { makeRoute, noContent } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { electionRecipientIds, notifyVoterRemoved } from "@/src/lib/notifications/events";

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

      // Capture the account while the row still exists, then re-resolve
      // eligibility AFTER the delete so the wording reflects real remaining
      // rights (position or other rules may still qualify this user).
      const removedUserId = existing.userId;
      await prisma.electionVoter.delete({ where: { id: existing.id } });

      if (removedUserId !== null) {
        const stillEligible = (await electionRecipientIds(election)).includes(removedUserId);
        await notifyVoterRemoved(election, removedUserId, stillEligible);
      }

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
