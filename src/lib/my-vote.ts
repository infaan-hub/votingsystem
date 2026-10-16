import { prisma } from "@/src/lib/db";
import { displayName } from "@/src/lib/serializers";
import { formatDateTime } from "@/src/lib/time";

/**
 * The signed-in voter's own recorded choices in one election.
 *
 * Only the caller's votes are ever read or returned — this is the voter's own
 * receipt, never another voter's ballot. The public tally stays governed by
 * the election's result-visibility policy; this payload is what lets a voter
 * see "what I voted" while the results themselves are still pending.
 */

export type MyVoteChoice = {
  position_id: number;
  position_name: string;
  /** Human-readable choice: candidate name, ballot-option label or write-in. */
  choice: string;
  candidate_id: number | null;
  party_code: string | null;
  cast_at: string | null;
};

export type MyVote = {
  has_voted: boolean;
  votes: MyVoteChoice[];
};

export async function loadMyVote(
  electionId: number,
  userId: number,
  timeZone: string = "UTC",
): Promise<MyVote> {
  const votes = await prisma.vote.findMany({
    where: { electionId, voterId: userId },
    include: {
      position: true,
      candidate: { include: { user: true, party: true } },
      ballotOption: true,
    },
    orderBy: { position: { order: "asc" } },
  });

  return {
    has_voted: votes.length > 0,
    votes: votes.map((vote) => {
      const raw = vote.candidate
        ? displayName(vote.candidate.user)
        : (vote.ballotOption?.label ?? vote.writeInText.trim());
      return {
        position_id: vote.positionId,
        position_name: vote.position.name,
        choice: raw || "Recorded",
        candidate_id: vote.candidateId,
        party_code: vote.candidate?.party?.code ?? null,
        cast_at: formatDateTime(vote.createdAt, timeZone),
      };
    }),
  };
}

/** Election ids (from the given list) the user has already voted in. */
export async function votedElectionIds(
  userId: number,
  electionIds: number[],
): Promise<Set<number>> {
  if (!electionIds.length) return new Set();
  const rows = await prisma.vote.findMany({
    where: { voterId: userId, electionId: { in: electionIds } },
    select: { electionId: true },
    distinct: ["electionId"],
  });
  return new Set(rows.map((row) => row.electionId));
}
