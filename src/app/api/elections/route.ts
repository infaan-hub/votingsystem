import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { serializeElectionList } from "@/src/lib/serializers";

export const GET = makeRoute({
  handlers: {
    GET: async () => {
      const elections = await prisma.election.findMany({
        where: { isPublished: true },
        orderBy: { votingStartAt: "asc" },
      });
      return json(elections.map((election) => serializeElectionList(election)));
    },
  },
});
