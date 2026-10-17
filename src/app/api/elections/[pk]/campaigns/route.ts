import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { serializeElectionList, serializePosition } from "@/src/lib/serializers";
import { resultsVisible } from "@/src/lib/services";

export const GET = makeRoute({
  handlers: {
    GET: async (_req, params, state) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");
      const positions = await prisma.position.findMany({
        where: { electionId: election.id },
        include: { department: true, section: { include: { department: true } } },
        orderBy: { name: "asc" },
      });
      return json({
        election: serializeElectionList(election),
        positions: await Promise.all(
          positions.map((position) =>
            serializePosition(position, {
              includeTallies: resultsVisible(election, state.user),
            }),
          ),
        ),
      });
    },
  },
});
