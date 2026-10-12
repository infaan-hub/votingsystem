import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { serializeElectionList, serializePosition } from "@/src/lib/serializers";
import { serializeElectionAdmin } from "@/src/lib/elections";
import { checkElectionEligibility } from "@/src/lib/eligibility";

export const GET = makeRoute({
  handlers: {
    GET: async (req, params, state) => {
      const election = await prisma.election.findUnique({
        where: { slug: params.slug },
      });
      if (!election) throw notFoundModel("Election");

      if (election.visibility === "private") {
        const invite = new URL(req.url).searchParams.get("invite")?.trim() || "";
        const valid =
          !!election.shareToken &&
          invite === election.shareToken &&
          !!election.shareTokenExpiry &&
          election.shareTokenExpiry > new Date();
        if (!valid) throw notFoundModel("Election");
      }

      const positions = await prisma.position.findMany({
        where: { electionId: election.id },
        include: { department: true, section: { include: { department: true } } },
        orderBy: { order: "asc" },
      });

      return json({
        election: serializeElectionList(election),
        detail: serializeElectionAdmin(election),
        positions: await Promise.all(
          positions.map((position) => serializePosition(position)),
        ),
        eligibility: state.user
          ? await checkElectionEligibility(election, state.user)
          : null,
      });
    },
  },
});
