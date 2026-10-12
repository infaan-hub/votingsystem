import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/time";

/**
 * Aggregate vote reporting for administrators.
 *
 * Secret-ballot rule: this endpoint never returns a voter's identity next to
 * a selection, and never returns per-vote rows. It exposes counts only â€”
 * totals per election, distinct voter counts, and tallies per question.
 */
export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const electionParam = url.searchParams.get("election_id");

      const where = electionParam && /^\d+$/.test(electionParam)
        ? { electionId: Number(electionParam) }
        : undefined;

      const [elections, totals] = await Promise.all([
        prisma.election.findMany({
          where: where ? { id: where.electionId } : undefined,
          select: { id: true, slug: true, title: true, status: true, votingEndAt: true },
          orderBy: { votingEndAt: "desc" },
          take: 200,
        }),
        prisma.vote.aggregate({ where, _count: { _all: true } }),
      ]);

      const results = [];
      for (const election of elections) {
        const [voteCount, distinctVoters, byPosition] = await Promise.all([
          prisma.vote.count({ where: { electionId: election.id } }),
          prisma.vote.findMany({
            where: { electionId: election.id },
            distinct: ["voterId"],
            select: { voterId: true },
          }),
          prisma.vote.groupBy({
            by: ["positionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
        ]);

        const positions = await prisma.position.findMany({
          where: { electionId: election.id },
          select: { id: true, name: true, ballotType: true, maxWinners: true },
        });

        const candidateTallies = await prisma.vote.groupBy({
          by: ["positionId", "candidateId"],
          where: { electionId: election.id, candidateId: { not: null } },
          _count: { _all: true },
        });
        const optionTallies = await prisma.vote.groupBy({
          by: ["positionId", "ballotOptionId"],
          where: { electionId: election.id, ballotOptionId: { not: null } },
          _count: { _all: true },
        });

        const candidateIds = candidateTallies
          .map((row) => row.candidateId)
          .filter((id): id is number => id !== null);
        const candidates = candidateIds.length
          ? await prisma.candidate.findMany({
              where: { id: { in: candidateIds } },
              select: {
                id: true,
                slogan: true,
                user: { select: { firstName: true, lastName: true, username: true } },
              },
            })
          : [];
        const candidateLabels = new Map(
          candidates.map((candidate) => [
            candidate.id,
            `${candidate.user.firstName} ${candidate.user.lastName}`.trim() || candidate.user.username,
          ]),
        );

        const optionIds = optionTallies
          .map((row) => row.ballotOptionId)
          .filter((id): id is number => id !== null);
        const options = optionIds.length
          ? await prisma.ballotOption.findMany({
              where: { id: { in: optionIds } },
              select: { id: true, label: true },
            })
          : [];
        const optionLabels = new Map(options.map((option) => [option.id, option.label]));

        results.push({
          election: {
            id: election.id,
            slug: election.slug,
            title: election.title,
            status: election.status,
            voting_end_at: formatDateTime(election.votingEndAt),
          },
          total_votes: voteCount,
          distinct_voters: distinctVoters.length,
          questions: positions.map((position) => {
            const positionVotes =
              byPosition.find((row) => row.positionId === position.id)?._count._all ?? 0;
            return {
              id: position.id,
              name: position.name,
              ballot_type: position.ballotType,
              max_winners: position.maxWinners,
              total_votes: positionVotes,
              tallies: [
                ...candidateTallies
                  .filter((row) => row.positionId === position.id && row.candidateId !== null)
                  .map((row) => ({
                    kind: "candidate" as const,
                    id: row.candidateId,
                    label: candidateLabels.get(row.candidateId!) ?? `Candidate #${row.candidateId}`,
                    votes: row._count._all,
                  })),
                ...optionTallies
                  .filter((row) => row.positionId === position.id && row.ballotOptionId !== null)
                  .map((row) => ({
                    kind: "option" as const,
                    id: row.ballotOptionId,
                    label: optionLabels.get(row.ballotOptionId!) ?? `Option #${row.ballotOptionId}`,
                    votes: row._count._all,
                  })),
              ],
            };
          }),
        });
      }

      return json({
        total_votes: totals._count._all,
        election_count: elections.length,
        results,
      });
    },
  },
});
