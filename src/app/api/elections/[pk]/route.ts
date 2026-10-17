import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { officerCanManage } from "@/src/lib/officer";
import { serializeElectionDetail } from "@/src/lib/serializers";
import { resultsVisible } from "@/src/lib/services";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");

      // Drafts stay previewable by their operator and admins, never by the
      // public; tallies only appear once the results were published.
      const previewer = state.user ? await officerCanManage(election, state.user) : false;
      if (election.status === "DRAFT" && !previewer) throw notFoundModel("Election");

      return json(
        await serializeElectionDetail(election, new Date(), {
          includeTallies: resultsVisible(election, state.user),
        }),
      );
    },
  },
});
