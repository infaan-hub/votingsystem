import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { serializeElectionDetail } from "@/src/lib/serializers";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");
      return json(await serializeElectionDetail(election));
    },
  },
});
