import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { managedElectionIds } from "@/src/lib/officer";
import { formatDateTime } from "@/src/lib/time";

type GroupedCount = { electionId: number; _count: { _all: number } };

function countMap(rows: GroupedCount[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.electionId, row._count._all);
  return map;
}

export const GET = makeRoute({
  permission: "officer",
  handlers: {
    GET: async (_req, _params, state) => {
      const officer = requireStateOfficer(state);
      const ids = await managedElectionIds(officer);
      const elections = await prisma.election.findMany({
        where: ids === null ? { status: { not: "ARCHIVED" } } : { id: { in: ids } },
        include: { category: true },
        orderBy: { votingStartAt: "desc" },
      });
      const scopeIds = elections.map((election) => election.id);

      const [positionCounts, candidateCounts, voteCounts, campaignCounts, voterCounts] =
        await Promise.all([
          prisma.position.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.candidate.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.vote.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.campaign.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds }, status: "PUBLISHED" },
            _count: { _all: true },
          }),
          prisma.electionVoter.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
        ]);

      const positions = countMap(positionCounts);
      const candidates = countMap(candidateCounts);
      const votes = countMap(voteCounts);
      const publishedCampaigns = countMap(campaignCounts);
      const eligibleVoters = countMap(voterCounts);

      return json(
        elections.map((election) => {
          const tz = election.timezone || "UTC";
          return {
            id: election.id,
            slug: election.slug,
            title: election.title,
            status: election.status,
            is_published: election.isPublished,
            visibility: election.visibility,
            voting_start_at: formatDateTime(election.votingStartAt, tz),
            voting_end_at: formatDateTime(election.votingEndAt, tz),
            category: election.category
              ? { id: election.category.id, name: election.category.name }
              : null,
            counts: {
              positions: positions.get(election.id) ?? 0,
              candidates: candidates.get(election.id) ?? 0,
              votes: votes.get(election.id) ?? 0,
              published_campaigns: publishedCampaigns.get(election.id) ?? 0,
              eligible_voters: eligibleVoters.get(election.id) ?? 0,
            },
          };
        }),
      );
    },
  },
});
