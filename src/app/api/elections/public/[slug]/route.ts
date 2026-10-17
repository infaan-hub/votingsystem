import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { loadMyVote } from "@/src/lib/my-vote";
import { serializeElectionList, serializePosition } from "@/src/lib/serializers";
import { serializeElectionAdmin } from "@/src/lib/elections";
import { checkElectionEligibility } from "@/src/lib/eligibility";
import { officerCanManage } from "@/src/lib/officer";
import { resultsVisible } from "@/src/lib/services";

export const GET = makeRoute({
  handlers: {
    GET: async (req, params, state) => {
      const election = await prisma.election.findUnique({
        where: { slug: params.slug },
      });
      if (!election) throw notFoundModel("Election");

      const invite = new URL(req.url).searchParams.get("invite")?.trim() || "";
      const inviteValid =
        !!election.shareToken &&
        invite === election.shareToken &&
        !!election.shareTokenExpiry &&
        election.shareTokenExpiry > new Date();
      if (election.visibility === "private" && !inviteValid) throw notFoundModel("Election");

      // The public surface only carries elections that were actually
      // published, or were shared with a valid invite: drafts stay reachable
      // by their operator and admins so the console can preview them before
      // the announcement.
      const previewer = state.user ? await officerCanManage(election, state.user) : false;
      if ((!election.isPublished || election.status === "DRAFT") && !previewer && !inviteValid) {
        throw notFoundModel("Election");
      }

      const positions = await prisma.position.findMany({
        where: { electionId: election.id },
        include: { department: true, section: { include: { department: true } } },
        orderBy: { order: "asc" },
      });

      // The caller's own ballot record (never anyone else's) so the voter can
      // see what they chose while the results are still pending.
      const myVote = state.user
        ? await loadMyVote(election.id, state.user.id, election.timezone || "UTC")
        : null;

      return json({
        election: {
          ...serializeElectionList(election),
          has_voted: myVote?.has_voted ?? false,
        },
        detail: serializeElectionAdmin(election),
        positions: await Promise.all(
          positions.map((position) =>
            serializePosition(position, {
              includeTallies: resultsVisible(election, state.user),
            }),
          ),
        ),
        eligibility: state.user
          ? await checkElectionEligibility(election, state.user)
          : null,
        my_vote: myVote,
      });
    },
  },
});
