import { prisma } from "@/src/lib/db";
import { pythonTextCompare } from "@/src/lib/validation";
import { electionStatus, voterGroupLabel } from "@/src/lib/serializers";
import { DEFAULT_TIME_ZONE, formatDateTime, secondsUntil } from "@/src/lib/time";
import type { UserWithRelations } from "@/src/lib/auth";
import type {
  Announcement,
  Department,
  Election,
  Position,
  Section,
  User,
} from "@/src/generated/prisma/client";

export const VOTING_ROLES = ["voter", "officer", "candidate"];

type PositionRow = Position & {
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
};

/**
 * The scalar subset of a position that decides who may vote on it. Casting
 * loads only the position row, so eligibility takes this shape instead of the
 * fully hydrated PositionRow.
 */
export type PositionScope = Pick<Position, "voterGroup" | "departmentId" | "sectionId">;

function eligibleUsersWhere(position: PositionScope) {
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

export function isUserEligible(
  position: PositionScope,
  user: UserWithRelations | User,
): boolean {
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

/**
 * Whether the caller may see tallies. Explicit publication is the only public
 * gate: an unpublished tally must never reach voters, however liberal the
 * preview policy is. Before publication `resultVisibility` decides which staff
 * roles may preview the running numbers — "live"/"public" are preview scopes,
 * not voter features — and the legacy `allowLiveResults` flag covers rows from
 * before the policy column existed.
 */
export function resultsVisible(election: Election, user?: UserWithRelations | null): boolean {
  if (election.resultPublishedAt !== null) return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "officer") return false;

  const policy = election.resultVisibility;
  if (policy === "hidden" || policy === "admin_only") return false;
  if (policy === "officers" || policy === "live" || policy === "public" || policy === "published") {
    return true;
  }

  // Legacy fallback for pre-migration rows with an unrecognized policy.
  return election.allowLiveResults;
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

  // A seat is only won with at least one vote: a zero-turnout slate must not
  // advertise a winner.
  const winnerIds = new Set(
    candidates
      .filter((candidate) => candidate._count.votes > 0)
      .slice(0, Math.max(position.maxWinners, 0))
      .map((candidate) => candidate.id),
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

export type ResultCardCandidate = {
  candidate_id: number;
  name: string;
  photo_url: string | null;
  slogan: string;
  position_name: string;
  votes: number;
  percentage: number;
};

/**
 * One card-shaped view of an election's tally: the election-wide leader plus
 * every approved candidate with their totals and share of all votes cast in
 * the election. The officer preview and the published voter page render this
 * exact payload, so what an officer previews is exactly what voters receive.
 */
export async function buildElectionResultCard(election: Election) {
  const positions = await prisma.position.findMany({
    where: { electionId: election.id },
    include: { department: true, section: { include: { department: true } } },
    orderBy: { name: "asc" },
  });

  const candidates: ResultCardCandidate[] = [];
  for (const position of positions) {
    for (const entry of await buildPositionRanking(position)) {
      candidates.push({
        candidate_id: entry.candidate_id,
        name: entry.candidate_name,
        photo_url: entry.photo_url,
        slogan: entry.slogan,
        position_name: position.name,
        votes: entry.vote_total,
        percentage: 0,
      });
    }
  }

  const totalVotes = candidates.reduce((sum, row) => sum + row.votes, 0);
  for (const row of candidates) {
    row.percentage = totalVotes
      ? Number(((row.votes / totalVotes) * 100).toFixed(2))
      : 0;
  }
  candidates.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return pythonTextCompare(a.name, b.name);
  });

  const timeZone = election.timezone || DEFAULT_TIME_ZONE;
  return {
    election: {
      id: election.id,
      slug: election.slug,
      title: election.title,
      status: electionStatus(election),
      lifecycle_status: election.status,
      voting_end_at: formatDateTime(election.votingEndAt, timeZone),
      published: election.resultPublishedAt !== null,
      result_published_at: formatDateTime(election.resultPublishedAt, timeZone),
    },
    // Only a candidate with at least one vote can be presented as the winner.
    winner: candidates.find((row) => row.votes > 0) ?? null,
    candidates,
    totals: { votes: totalVotes, candidates: candidates.length },
  };
}
