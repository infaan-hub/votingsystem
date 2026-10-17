import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { findPublishedElection } from "@/src/lib/elections";
import { checkElectionEligibility } from "@/src/lib/eligibility";
import { eligiblePositionsForUser } from "@/src/lib/services";
import { isAcceptingVotes, serializeElectionList, serializePosition } from "@/src/lib/serializers";

/**
 * Accepts either an integer id or a public slug in `[pk]`, so clients can
 * address an election the same way the public pages do. Invalid identifiers
 * simply match nothing and return the standard 404 model error.
 *
 * The response carries the voter's eligibility decision so the ballot can
 * prompt for an identifier when the election needs one — the cast route
 * enforces the exact same rule.
 */
export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, params, state) => {
      const user = requireStateUser(state);

      const election = await findPublishedElection(params.pk ?? "");
      if (!election) throw notFoundModel("Election");

      const [positions, votes, eligibility] = await Promise.all([
        eligiblePositionsForUser(election.id, user),
        prisma.vote.findMany({
          where: { voterId: user.id, electionId: election.id },
          select: { positionId: true },
          orderBy: { createdAt: "desc" },
        }),
        checkElectionEligibility(election, user, null),
      ]);

      return json({
        election: serializeElectionList(election),
        positions: await Promise.all(positions.map((position) => serializePosition(position))),
        voted_position_ids: votes.map((vote) => vote.positionId),
        is_voting_open: isAcceptingVotes(election),
        eligibility: {
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          requires_identifier: eligibility.requiresIdentifier,
          identifier_label: eligibility.identifierLabel,
          identifier_verified: eligibility.identifierVerified,
        },
        // Google-only accounts have no password to confirm with, so the
        // client hides the password field instead of faking a check.
        account_has_password: Boolean(user.password),
      });
    },
  },
});
