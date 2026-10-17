import { json, makeRoute } from "@/src/lib/api";
import { forbidden, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { buildElectionStats, resultsVisible } from "@/src/lib/services";

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
        throw forbidden("Statistics are not published yet.");
      }
      return json(await buildElectionStats(election));
    },
  },
});
