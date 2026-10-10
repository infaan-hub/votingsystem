import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { eligiblePositionsForUser } from "@/src/lib/services";
import { isVotingOpen, serializeElectionList, serializePosition } from "@/src/lib/serializers";

/**
 * Accepts either an integer id or a public slug in `[pk]`, so clients can
 * address an election the same way the public pages do. Invalid identifiers
 * simply match nothing and return the standard 404 model error.
 */
export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, params, state) => {
      const user = requireStateUser(state);
      const raw = (params.pk ?? "").trim();

      const election = await prisma.election.findFirst({
        where: raw && /^\d+$/.test(raw) ? { id: Number(raw), isPublished: true } : { slug: raw, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");

      const positions = await eligiblePositionsForUser(election.id, user);
      const votes = await prisma.vote.findMany({
        where: { voterId: user.id, electionId: election.id },
        select: { positionId: true },
        orderBy: { createdAt: "desc" },
      });

      return json({
        election: serializeElectionList(election),
        positions: await Promise.all(positions.map((position) => serializePosition(position))),
        voted_position_ids: votes.map((vote) => vote.positionId),
        is_voting_open: isVotingOpen(election),
      });
    },
  },
});