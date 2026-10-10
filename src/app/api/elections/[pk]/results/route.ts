import { json, makeRoute } from "@/src/lib/api";
import { forbidden, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { buildElectionStats, buildWinnerAnnouncement, resultsVisible } from "@/src/lib/services";
import { serializeElectionList } from "@/src/lib/serializers";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");
      if (!resultsVisible(election, state.user)) {
        throw forbidden("Results are hidden until the election closes.");
      }
      return json({
        election: serializeElectionList(election),
        stats: await buildElectionStats(election),
        winners: await buildWinnerAnnouncement(election),
      });
    },
  },
});
