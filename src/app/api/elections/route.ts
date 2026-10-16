import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { votedElectionIds } from "@/src/lib/my-vote";
import { serializeElectionList } from "@/src/lib/serializers";

export const GET = makeRoute({
  handlers: {
    GET: async (_req, _params, state) => {
      const elections = await prisma.election.findMany({
        where: { isPublished: true },
        orderBy: { votingStartAt: "asc" },
      });
      // `has_voted` is per-caller: anonymous requests simply get false.
      const voted = state.user
        ? await votedElectionIds(
            state.user.id,
            elections.map((election) => election.id),
          )
        : new Set<number>();
      return json(
        elections.map((election) => ({
          ...serializeElectionList(election),
          has_voted: voted.has(election.id),
        })),
      );
    },
  },
});
