import { prisma } from "@/src/lib/db";
import { ValidationError, pythonTextCompare } from "@/src/lib/validation";
import { electionStatus, isVotingOpen, voterGroupLabel } from "@/src/lib/serializers";
import { secondsUntil } from "@/src/lib/time";
import type { UserWithRelations } from "@/src/lib/auth";
import type {
  Announcement,
  Candidate,
  Department,
  Election,
  Position,
  Section,
  User,
} from "@/src/generated/prisma/client";

export const VOTING_ROLES = ["voter", "officer"];

type PositionRow = Position & {
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
};

function eligibleUsersWhere(position: PositionRow) {
  const where: Record<string, unknown> = {
    isActive: true,
    role: { in: VOTING_ROLES },
  };

  // Stored voterGroup values are legacy ("student"/"staff") but every
  // non-admin voter now shares the single "voter" role.
  if (position.voterGroup === "staff_and_officer") {
    where.role = { in: ["voter", "officer"] };
  } else if (position.voterGroup === "student" || position.voterGroup === "staff") {
    where.role = "voter";
  }

  if (position.departmentId) where.departmentId = position.departmentId;
  if (position.sectionId) where.sectionId = position.sectionId;

  return where;
}

export async function eligibleUserIdsForPosition(position: PositionRow): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: eligibleUsersWhere(position),
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export function isUserEligible(position: PositionRow, user: UserWithRelations | User): boolean {
  if (!user || !("isActive" in user) || !user.isActive) return false;
  if (user.role === "admin") return false;
  if (
    (position.voterGroup === "student" || position.voterGroup === "staff") &&
    user.role !== "voter"
  ) {
    return false;
  }
  if (position.voterGroup === "staff_and_officer" && !["voter", "officer"].includes(user.role)) {
    return false;
  }
  if (position.departmentId && user.departmentId !== position.departmentId) return false;
  if (position.sectionId && user.sectionId !== position.sectionId) return false;
  return true;
}

export async function eligiblePositionsForUser(
  electionId: number,
  user: UserWithRelations,
): Promise<PositionRow[]> {
  const positions = await prisma.position.findMany({
    where: { electionId },
    include: { department: true, section: { include: { department: true } } },
    orderBy: { name: "asc" },
  });
  return positions.filter((position) => isUserEligible(position, user));
}

export async function visibleAnnouncements(
  electionId: number,
  now: Date = new Date(),
): Promise<Announcement[]> {
  return prisma.announcement.findMany({
    where: {
      electionId,
      OR: [{ publishAt: null }, { publishAt: { lte: now } }],
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export function resultsVisible(election: Election, user?: UserWithRelations | null): boolean {
  const status = electionStatus(election);
  const policy = election.resultVisibility;

  // Final states always publish to everyone.
  if (status === "ended") return true;
  if (policy === "public" || policy === "published") return true;
  if (policy === "live") return true; // live aggregate during voting
  if (policy === "hidden") return false;

  if (!user) return false;
  if (policy === "admin_only") return user.role === "admin";
  if (policy === "officers") return user.role === "admin" || user.role === "officer";

  // Legacy fallback: honor the old allowLiveResults flag when resultVisibility
  // is unrecognized. This keeps pre-migration elections working.
  return election.allowLiveResults || user.role === "admin" || user.role === "officer";
}

export async function castVote(voter: UserWithRelations, candidate: Candidate) {
  const [election, position] = await Promise.all([
    prisma.election.findUnique({ where: { id: candidate.electionId } }),
    prisma.position.findUnique({
      where: { id: candidate.positionId },
      include: { department: true, section: { include: { department: true } } },
    }),
  ]);

  if (!election || !position) {
    throw ValidationError.fromMessage(
      "A vote must be linked to a valid election position.",
    );
  }

  if (!candidate.approved) {
    throw ValidationError.fromDict({
      candidate: "This candidate is not approved for voting yet.",
    });
  }

  if (!isVotingOpen(election)) {
    throw ValidationError.fromDict({
      election: "Voting is not currently open for this election.",
    });
  }

  if (!isUserEligible(position, voter)) {
    throw ValidationError.fromDict({
      voter: "You are not eligible to vote for this department or section position.",
    });
  }

  const existing = await prisma.vote.findFirst({
    where: { voterId: voter.id, electionId: election.id, positionId: position.id },
  });
  if (existing) {
    throw ValidationError.fromDict({
      __all__: "You have already voted for this position in this election.",
    });
  }

  try {
    // The (voterId, electionId, positionId) unique constraint is the
    // authoritative duplicate guard: two concurrent submissions cannot both
    // persist, so the loser surfaces here as a P2002 uniqueness violation.
    return await prisma.vote.create({
      data: {
        voterId: voter.id,
        candidateId: candidate.id,
        electionId: election.id,
        positionId: position.id,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw ValidationError.fromDict({
        __all__: "You have already voted for this position in this election.",
      });
    }
    throw error;
  }
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export type RankingEntry = {
  candidate_id: number;
  candidate_name: string;
  user_id: number;
  department: string | null;
  section: string | null;
  slogan: string;
  vote_total: number;
  rank: number;
  is_winner: boolean;
  photo_url: string | null;
};

export async function buildPositionRanking(position: PositionRow): Promise<RankingEntry[]> {
  const candidates = await prisma.candidate.findMany({
    where: { positionId: position.id, approved: true },
    include: {
      user: { include: { department: true, section: { include: { department: true } } } },
      department: true,
      section: { include: { department: true } },
      _count: { select: { votes: true } },
    },
  });

  // Ranking order: -total_votes, featured_order, user__first_name, user__username
  candidates.sort((a, b) => {
    const votes = b._count.votes - a._count.votes;
    if (votes !== 0) return votes;
    if (a.featuredOrder !== b.featuredOrder) return a.featuredOrder - b.featuredOrder;
    const byFirstName = pythonTextCompare(a.user.firstName, b.user.firstName);
    if (byFirstName !== 0) return byFirstName;
    return pythonTextCompare(a.user.username, b.user.username);
  });

  const winnerIds = new Set(
    candidates.slice(0, Math.max(position.maxWinners, 0)).map((candidate) => candidate.id),
  );

  const results: RankingEntry[] = [];
  let lastTotal: number | null = null;
  let currentRank = 0;

  candidates.forEach((candidate, index) => {
    const totalVotes = candidate._count.votes;
    if (lastTotal !== totalVotes) {
      currentRank = index + 1;
      lastTotal = totalVotes;
    }
    results.push({
      candidate_id: candidate.id,
      candidate_name: `${candidate.user.firstName ?? ""} ${candidate.user.lastName ?? ""}`.trim() ||
        candidate.user.username,
      user_id: candidate.userId,
      department: candidate.department?.name ?? null,
      section: candidate.section?.name ?? null,
      slogan: candidate.slogan,
      vote_total: totalVotes,
      rank: currentRank,
      is_winner: winnerIds.has(candidate.id),
      photo_url: candidatePhotoUrl(candidate),
    });
  });

  return results;
}

function candidatePhotoUrl(candidate: { id: number; photoBytes: Uint8Array | null; photo: string | null }) {
  if (candidate.photoBytes && candidate.photoBytes.length) {
    return `/api/candidates/${candidate.id}/photo/`;
  }
  if (candidate.photo) return `/media/${candidate.photo}`;
  return null;
}

async function votesGroupedBy(electionId: number, groupBy: "department" | "section") {
  const votes = await prisma.vote.findMany({
    where: {
      electionId,
      candidate:
        groupBy === "department"
          ? { departmentId: { not: null } }
          : { sectionId: { not: null } },
    },
    select: {
      candidate: {
        select: {
          department: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });

  const totals = new Map<string, number>();
  for (const vote of votes) {
    const label =
      groupBy === "department"
        ? vote.candidate?.department?.name
        : vote.candidate?.section?.name;
    if (!label) continue;
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }

  return [...totals.entries()]
    .map(([label, total_votes]) => ({ label, total_votes }))
    .sort((a, b) => {
      if (b.total_votes !== a.total_votes) return b.total_votes - a.total_votes;
      return pythonTextCompare(a.label, b.label);
    });
}

export async function buildElectionStats(election: Election, now = new Date()) {
  const [positions, votes] = await Promise.all([
    prisma.position.findMany({
      where: { electionId: election.id },
      include: { department: true, section: { include: { department: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.vote.findMany({
      where: { electionId: election.id },
      select: { voterId: true },
    }),
  ]);

  const registeredVoterIdSet = new Set<number>();
  for (const position of positions) {
    const ids = await eligibleUserIdsForPosition(position);
    for (const id of ids) registeredVoterIdSet.add(id);
  }
  const registeredVoters = registeredVoterIdSet.size;
  const turnoutVoters = new Set(votes.map((vote) => vote.voterId)).size;
  const turnoutPercentage = registeredVoters
    ? Number(((turnoutVoters / registeredVoters) * 100).toFixed(2))
    : 0;

  const positionSummaries = [];
  for (const position of positions) {
    const ranking = await buildPositionRanking(position);
    const leader = ranking.length ? ranking[0] : null;
    const [votesCast, registeredForPosition] = await Promise.all([
      prisma.vote.count({ where: { positionId: position.id } }),
      eligibleUserIdsForPosition(position),
    ]);
    positionSummaries.push({
      id: position.id,
      name: position.name,
      department: position.department?.name ?? null,
      section: position.section?.name ?? null,
      max_winners: position.maxWinners,
      voter_group: voterGroupLabel(position.voterGroup),
      votes_cast: votesCast,
      registered_voters: registeredForPosition.length,
      leader,
      results: ranking,
    });
  }

  const [approvedCandidates, positionCount, votesByDepartment, votesBySection] =
    await Promise.all([
      prisma.candidate.count({ where: { electionId: election.id, approved: true } }),
      prisma.position.count({ where: { electionId: election.id } }),
      votesGroupedBy(election.id, "department"),
      votesGroupedBy(election.id, "section"),
    ]);

  return {
    election_id: election.id,
    status: electionStatus(election, now),
    allow_live_results: election.allowLiveResults,
    registered_voters: registeredVoters,
    votes_cast: votes.length,
    turnout_voters: turnoutVoters,
    turnout_percentage: turnoutPercentage,
    candidate_count: approvedCandidates,
    position_count: positionCount,
    seconds_until_start: secondsUntil(election.votingStartAt, now),
    seconds_until_end: secondsUntil(election.votingEndAt, now),
    positions: positionSummaries,
    votes_by_department: votesByDepartment,
    votes_by_section: votesBySection,
  };
}

export async function buildWinnerAnnouncement(election: Election) {
  const positions = await prisma.position.findMany({
    where: { electionId: election.id },
    include: { department: true, section: { include: { department: true } } },
    orderBy: { name: "asc" },
  });

  const announcements = [];
  for (const position of positions) {
    const ranking = await buildPositionRanking(position);
    const winners = ranking.filter((entry) => entry.is_winner);
    if (!winners.length) continue;
    const scope =
      position.section?.name ?? position.department?.name ?? "Campus";
    announcements.push({
      position: position.name,
      scope,
      winner_names: winners.map((winner) => winner.candidate_name).join(", "),
    });
  }
  return announcements;
}

export async function serializeStatsEvent(election: Election, now = new Date()) {
  const [stats, winners] = await Promise.all([
    buildElectionStats(election, now),
    buildWinnerAnnouncement(election),
  ]);
  return JSON.stringify({ stats, winners });
}
