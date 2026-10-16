import { json, makeRoute } from "@/src/lib/api";
import { forbidden, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { officerCanManage } from "@/src/lib/officer";
import { buildElectionResultCard } from "@/src/lib/services";

/**
 * The published result card for one election, addressed by id or slug.
 *
 *  - published: anyone may read it (the notification target);
 *  - not published yet: only an officer who administers the election may read
 *    it, which powers the officer preview without exposing a live tally to
 *    voters before publication;
 *  - an unpublished election is indistinguishable from a missing one for
 *    everyone else.
 */
export const GET = makeRoute({
  handlers: {
    GET: async (_req, params, state) => {
      const raw = (params.pk ?? "").trim();
      const election = await prisma.election.findFirst({
        where: raw && /^\d+$/.test(raw) ? { id: Number(raw) } : { slug: raw },
      });
      if (!election) throw notFoundModel("Election");

      const previewer = state.user ? await officerCanManage(election, state.user) : false;
      if (!election.isPublished && !previewer) throw notFoundModel("Election");
      if (election.resultPublishedAt === null && !previewer) {
        throw forbidden("Results for this election have not been published yet.");
      }

      return json(await buildElectionResultCard(election));
    },
  },
});
