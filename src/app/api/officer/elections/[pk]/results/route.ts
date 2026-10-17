import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { serializeElectionAdmin } from "@/src/lib/elections";
import { notifyElectionResultsReady } from "@/src/lib/notifications/events";

const RESULT_ACTIONS = ["publish"] as const;

/**
 * Publishes the election result card.
 *
 * Deliberately separate from the admin lifecycle endpoint: publishing here
 * does not move the lifecycle status — it stamps `resultFinalizedAt` /
 * `resultPublishedAt` and notifies exactly the accounts that cast a ballot in
 * this election, opening the published card on their devices. Publishing again
 * is idempotent (no second notification).
 */
export const POST = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const pk = Number(params.pk);
      const election = await requireManagedElection(pk, officer);

      const payload = await readPayload(req);
      const c = new Collector();
      const action = choiceField(c, payload, "action", RESULT_ACTIONS)!;
      c.throwIfAny();

      // Publish is for elections whose voting has run: still OPEN but past its
      // window (the standard officer flow), CLOSED, or already published.
      // Draft and pre-voting states have nothing to publish yet.
      if (
        election.status !== "OPEN" &&
        election.status !== "CLOSED" &&
        election.status !== "RESULTS_PUBLISHED"
      ) {
        throw fieldErrors({ action: "Results can only be published once voting has finished." });
      }

      const now = new Date();
      if (election.votingEndAt > now) {
        throw fieldErrors({
          action: "Results can only be published after voting has ended.",
        });
      }

      const votes = await prisma.vote.count({ where: { electionId: pk } });
      if (votes === 0) {
        throw fieldErrors({ action: "There are no ballots in this election to publish." });
      }

      if (election.resultPublishedAt) {
        // Already published: return the stored state without re-notifying.
        return json(serializeElectionAdmin(election));
      }

      const updated = await prisma.election.update({
        where: { id: pk },
        data: {
          resultFinalizedAt: election.resultFinalizedAt ?? now,
          resultPublishedAt: now,
          isPublished: true,
        },
      });

      await recordAudit({
        actorId: officer.id,
        action: `officer.results.${action}`,
        entityType: "Election",
        entityId: pk,
        summary: `Result ${action} for "${updated.title}"`,
        detail: { action, votes },
        ipAddress: clientIp(req),
      });

      // Fires after the update committed; notifies only voters who cast a
      // ballot and never throws.
      await notifyElectionResultsReady(updated);

      return json(serializeElectionAdmin(updated));
    },
  },
});
