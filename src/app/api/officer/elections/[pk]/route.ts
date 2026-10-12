import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { serializeElectionAdmin } from "@/src/lib/elections";
import { electionImagePath, serializePosition } from "@/src/lib/serializers";
import { secondsUntil } from "@/src/lib/time";

export const GET = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);

      const [positions, positionCounts, candidateCounts, voteCounts, campaignCounts, voterCounts] =
        await Promise.all([
          prisma.position.findMany({
            where: { electionId: election.id },
            include: { department: true, section: { include: { department: true } } },
            orderBy: { order: "asc" },
          }),
          prisma.position.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.candidate.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.vote.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.campaign.groupBy({
            by: ["electionId"],
            where: { electionId: election.id, status: "PUBLISHED" },
            _count: { _all: true },
          }),
          prisma.electionVoter.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
        ]);

      const countOf = (rows: { _count: { _all: number } }[]) => rows[0]?._count._all ?? 0;

      return json({
        election: {
          ...serializeElectionAdmin(election),
          image_url: electionImagePath(election) || null,
        },
        positions: await Promise.all(positions.map((position) => serializePosition(position))),
        counts: {
          positions: countOf(positionCounts),
          candidates: countOf(candidateCounts),
          votes: countOf(voteCounts),
          published_campaigns: countOf(campaignCounts),
          eligible_voters: countOf(voterCounts),
        },
        campaign: {
          seconds_until_start: secondsUntil(election.campaignStartAt),
          seconds_until_end: secondsUntil(election.campaignEndAt),
        },
        voting: {
          seconds_until_start: secondsUntil(election.votingStartAt),
          seconds_until_end: secondsUntil(election.votingEndAt),
        },
      });
    },
  },
});
