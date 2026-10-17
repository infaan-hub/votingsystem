import { prisma } from "@/src/lib/db";
import { DEFAULT_TIME_ZONE, formatDateTime, secondsUntil } from "@/src/lib/time";
import type {
  Announcement,
  Candidate,
  Department,
  Election,
  ElectionCategory,
  Position,
  Section,
  User,
} from "@/src/generated/prisma/client";
import type { UserWithRelations } from "@/src/lib/auth";
import { pythonTextCompare } from "@/src/lib/validation";
import { visibleAnnouncements } from "@/src/lib/services";

export function displayName(user: {
  username: string;
  firstName: string;
  lastName: string;
}): string {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.username;
}

export function serializeDepartment(department: Department | null | undefined) {
  if (!department) return null;
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
  };
}

export function serializeSection(
  section: (Section & { department: Department | null }) | null | undefined,
) {
  if (!section) return null;
  return {
    id: section.id,
    name: section.name,
    code: section.code,
    description: section.description,
    department: serializeDepartment(section.department),
  };
}

export function serializeUserSummary(user: UserWithRelations) {
  return {
    id: user.id,
    username: user.username,
    full_name: displayName(user),
    // Raw parts as well as the display name, so a profile editor can prefill
    // its fields without guessing how the full name was combined.
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    date_joined: formatDateTime(user.dateJoined),
    department: serializeDepartment(user.department),
    section: serializeSection(user.section),
    registration_number: user.registrationNumber,
    staff_id: user.staffId,
    phone_number: user.phoneNumber || null,
    auth_provider: user.authProvider,
    // `?v=` is the byte length so a replaced photo busts browser caches.
    photo_url:
      user.photoBytes && user.photoBytes.length
        ? `/api/users/${user.id}/photo/?v=${user.photoBytes.length}`
        : null,
  };
}

export function serializeCategory(
  category: ElectionCategory & { _count?: { elections: number } },
) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    is_active: category.isActive,
    is_system: category.isSystem,
    election_count: category._count?.elections ?? 0,
    created_at: formatDateTime(category.createdAt),
    updated_at: formatDateTime(category.updatedAt),
  };
}

export function electionStatus(
  election: Election,
  now: Date = new Date(),
): "upcoming" | "active" | "ended" {
  if (now < election.votingStartAt) return "upcoming";
  if (now >= election.votingStartAt && now <= election.votingEndAt) return "active";
  return "ended";
}

export function isVotingOpen(election: Election, now: Date = new Date()): boolean {
  return election.votingStartAt <= now && now <= election.votingEndAt;
}

export function isCampaignLive(election: Election, now: Date = new Date()): boolean {
  return election.campaignStartAt <= now && now <= election.campaignEndAt;
}

export const VOTER_GROUP_LABELS: Record<string, string> = {
  all: "All eligible voters",
  student: "Students",
  staff: "Staff",
  staff_and_officer: "Staff and Election Officers",
};

export function voterGroupLabel(voterGroup: string): string {
  return VOTER_GROUP_LABELS[voterGroup] ?? voterGroup;
}

export function candidatePhotoPath(candidate: {
  id: number;
  photoBytes: Buffer | Uint8Array | null;
  photo: string | null;
}): string | null {
  if (candidate.photoBytes && candidate.photoBytes.length) {
    return `/api/candidates/${candidate.id}/photo/`;
  }
  if (candidate.photo) return `/media/${candidate.photo}`;
  return null;
}

export function candidateVideoPath(candidate: {
  id: number;
  campaignVideoBytes: Buffer | Uint8Array | null;
  campaignVideo: string | null;
  campaignVideoUrl: string;
}): string | null {
  if (candidate.campaignVideoBytes && candidate.campaignVideoBytes.length) {
    return `/api/candidates/${candidate.id}/campaign-video/`;
  }
  if (candidate.campaignVideo) return `/media/${candidate.campaignVideo}`;
  if (candidate.campaignVideoUrl) return candidate.campaignVideoUrl;
  return null;
}

export function electionImagePath(election: {
  id: number;
  imageBytes: Buffer | Uint8Array | null;
  image: string | null;
}): string {
  if (election.imageBytes && election.imageBytes.length) {
    return `/api/elections/${election.id}/image/`;
  }
  if (election.image) return `/media/${election.image}`;
  return "";
}

type CandidateRow = Candidate & {
  user: User & { department: Department | null; section: (Section & { department: Department | null }) | null };
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
  party: { id: number; name: string; code: string; color: string } | null | undefined;
};

export function serializeCandidate(
  candidate: CandidateRow,
  voteTotal?: number,
) {
  const base = {
    id: candidate.id,
    user: {
      id: candidate.user.id,
      username: candidate.user.username,
      full_name: displayName(candidate.user),
      email: candidate.user.email,
      role: candidate.user.role,
      department: serializeDepartment(candidate.user.department),
      section: serializeSection(candidate.user.section),
      registration_number: candidate.user.registrationNumber,
      staff_id: candidate.user.staffId,
    },
    department: serializeDepartment(candidate.department),
    section: serializeSection(candidate.section),
    party: candidate.party
      ? {
          id: candidate.party.id,
          name: candidate.party.name,
          code: candidate.party.code,
          color: candidate.party.color,
        }
      : null,    slogan: candidate.slogan,
    manifesto: candidate.manifesto,
    campaign_video_url: candidateVideoPath(candidate),
    approved: candidate.approved,
    photo: candidatePhotoPath(candidate),
    photo_url: candidatePhotoPath(candidate),
  };

  // `vote_total` is always emitted so consumers (result bars, ballot clients)
  // can rely on it; it defaults to 0 when the caller has no ranking annotation.
  return { ...base, vote_total: voteTotal ?? 0 };
}

type PositionRow = Position & {
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
};

type CandidateWithCounts = CandidateRow & { _count: { votes: number } };

function sortCandidates<
  T extends { featuredOrder: number; user: { username: string } },
>(candidates: T[]): T[] {
  // Ordering: featured_order, then username.
  return candidates.sort((a, b) => {
    if (a.featuredOrder !== b.featuredOrder) return a.featuredOrder - b.featuredOrder;
    return pythonTextCompare(a.user.username, b.user.username);
  });
}

function serializePositionRow(position: PositionRow, candidates: CandidateWithCounts[]) {
  return {
    id: position.id,
    name: position.name,
    description: position.description,
    department: serializeDepartment(position.department),
    section: serializeSection(position.section),
    voter_group: position.voterGroup,
    voter_group_label: voterGroupLabel(position.voterGroup),
    max_winners: position.maxWinners,
    ballot_type: position.ballotType,
    max_selections: position.maxSelections,
    allow_write_in: position.allowWriteIn,
    candidates: sortCandidates(candidates).map((candidate) =>
      serializeCandidate(candidate, candidate._count.votes),
    ),
  };
}

const CANDIDATE_INCLUDE = {
  user: { include: { department: true, section: { include: { department: true } } } },
  department: true,
  section: { include: { department: true } },
  party: true,
  _count: { select: { votes: true } },
} as const;

export async function serializePosition(position: PositionRow) {
  const candidates = await prisma.candidate.findMany({
    where: { positionId: position.id, approved: true },
    include: CANDIDATE_INCLUDE,
  });

  return serializePositionRow(position, candidates);
}

export function serializeAnnouncement(
  announcement: Announcement,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  return {
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    announcement_type: announcement.announcementType,
    publish_at: formatDateTime(announcement.publishAt, timeZone),
    is_pinned: announcement.isPinned,
    is_visible: announcement.publishAt === null || announcement.publishAt <= now,
    created_at: formatDateTime(announcement.createdAt, timeZone),
  };
}

export function serializeElectionList(election: Election, now = new Date()) {
  const tz = election.timezone || DEFAULT_TIME_ZONE;
  return {
    id: election.id,
    slug: election.slug,
    title: election.title,
    description: election.description,
    image: electionImagePath(election),
    image_url: electionImagePath(election) || null,
    lifecycle_status: election.status,
    visibility: election.visibility,
    result_visibility: election.resultVisibility,
    category_id: election.categoryId,
    organization_id: election.organizationId,
    campaign_start_at: formatDateTime(election.campaignStartAt, tz),
    campaign_end_at: formatDateTime(election.campaignEndAt, tz),
    voting_start_at: formatDateTime(election.votingStartAt, tz),
    voting_end_at: formatDateTime(election.votingEndAt, tz),
    allow_live_results: election.allowLiveResults,
    announce_winners_automatically: election.announceWinnersAutomatically,
    result_published_at: formatDateTime(election.resultPublishedAt, tz),
    status: electionStatus(election, now),
    seconds_until_start: secondsUntil(election.votingStartAt, now),
    seconds_until_end: secondsUntil(election.votingEndAt, now),
  };
}

export async function serializeElectionDetail(election: Election, now = new Date()) {
  // One round-trip for every candidate in the election instead of one query
  // per position (the old N+1 shape).
  const [positions, announcements, candidates] = await Promise.all([
    prisma.position.findMany({
      where: { electionId: election.id },
      include: { department: true, section: { include: { department: true } } },
      orderBy: { name: "asc" },
    }),
    visibleAnnouncements(election.id, now),
    prisma.candidate.findMany({
      where: { electionId: election.id, approved: true },
      include: CANDIDATE_INCLUDE,
    }),
  ]);

  const byPosition = new Map<number, typeof candidates>();
  for (const candidate of candidates) {
    const bucket = byPosition.get(candidate.positionId);
    if (bucket) {
      bucket.push(candidate);
    } else {
      byPosition.set(candidate.positionId, [candidate]);
    }
  }

  const timeZone = election.timezone || DEFAULT_TIME_ZONE;
  return {
    ...serializeElectionList(election, now),
    positions: positions.map((position) =>
      serializePositionRow(position, byPosition.get(position.id) ?? []),
    ),
    announcements: announcements.map((announcement) =>
      serializeAnnouncement(announcement, now, timeZone),
    ),
  };
}

export function serializeVote(vote: {
  id: number;
  createdAt: Date;
  candidate: CandidateRow | null;
  ballotOption?: { label: string } | null;
  writeInText?: string;
  position: Position;
  election: Election;
}) {
  // The selection is a candidate, a ballot option, or a write-in. The legacy
  // `candidate` field keeps its name for contract compatibility but carries the
  // human-readable choice label regardless of kind.
  const choice = vote.candidate
    ? displayName(vote.candidate.user)
    : (vote.ballotOption?.label ?? vote.writeInText ?? "");
  return {
    id: vote.id,
    candidate: choice,
    position: vote.position.name,
    election: vote.election.title,
    created_at: formatDateTime(vote.createdAt, vote.election.timezone || DEFAULT_TIME_ZONE),
  };
}
