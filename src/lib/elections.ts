import { prisma } from "@/src/lib/db";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { slugify } from "@/src/lib/slug";
import { serializeElectionList } from "@/src/lib/serializers";
import { formatDateTime } from "@/src/lib/time";
import type { Election } from "@/src/generated/prisma/client";

/** Stored `Election.status` state machine. */
export const LEGAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["NOMINATIONS", "ARCHIVED"],
  NOMINATIONS: ["READY", "ARCHIVED"],
  READY: ["OPEN", "ARCHIVED"],
  OPEN: ["CLOSED"],
  CLOSED: ["RESULTS_PUBLISHED"],
  RESULTS_PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

/** Statuses in which voting can actually accept ballots. */
export const VOTING_STATES = new Set(["READY", "OPEN"]);

export async function uniqueElectionSlug(base: string, excludeId?: number): Promise<string> {
  const root = slugify(base);
  const existing = await prisma.election.findMany({
    where: { slug: { startsWith: root }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function serializeElectionAdmin(election: Election, now = new Date()) {
  const tz = election.timezone || "UTC";
  return {
    ...serializeElectionList(election, now),
    slug: election.slug,
    lifecycle_status: election.status,
    eligibility_policy: election.eligibilityPolicy,
    result_visibility: election.resultVisibility,
    secret_ballot: election.secretBallot,
    timezone: election.timezone,
    allow_admins_to_vote: election.allowAdminsToVote,
    is_published: election.isPublished,
    visibility: election.visibility,
    rules_text: election.rulesText,
    voter_id_method: election.voterIdMethod,
    voter_id_label: election.voterIdLabel,
    capacity_mode: election.capacityMode,
    max_voters: election.maxVoters,
    registration_start_at: formatDateTime(election.registrationStartAt, tz),
    registration_end_at: formatDateTime(election.registrationEndAt, tz),
    nomination_start_at: formatDateTime(election.nominationStartAt, tz),
    nomination_end_at: formatDateTime(election.nominationEndAt, tz),
    result_finalized_at: formatDateTime(election.resultFinalizedAt, tz),
    result_published_at: formatDateTime(election.resultPublishedAt, tz),
    category_id: election.categoryId,
    organization_id: election.organizationId,
    created_by: election.createdBy,
    archived_at: formatDateTime(election.archivedAt, tz),
  };
}

export type PublishBlocker = { field: string; message: string };

/**
 * Server-side readiness gate run before an election can leave DRAFT.
 * Returns every problem at once so the officer builder can show them all.
 */
export async function publishBlockers(election: Election): Promise<PublishBlocker[]> {
  const blockers: PublishBlocker[] = [];

  if (!election.title?.trim()) blockers.push({ field: "title", message: "An election title is required." });
  if (!election.categoryId) blockers.push({ field: "category_id", message: "Select an election category." });
  if (!election.description?.trim()) {
    blockers.push({ field: "description", message: "Describe the election so voters know what it decides." });
  }

  const now = Date.now();
  if (election.campaignStartAt.getTime() >= election.campaignEndAt.getTime()) {
    blockers.push({ field: "campaign_end_at", message: "Campaign end must be after campaign start." });
  }
  if (election.votingStartAt.getTime() >= election.votingEndAt.getTime()) {
    blockers.push({ field: "voting_end_at", message: "Voting end must be after voting start." });
  }
  if (election.votingStartAt.getTime() < election.campaignEndAt.getTime()) {
    blockers.push({ field: "voting_start_at", message: "Voting must start after the campaign ends." });
  }
  if (election.votingEndAt.getTime() <= now) {
    blockers.push({ field: "voting_end_at", message: "Voting must end in the future before the election can be published." });
  }

  const [positionCount, candidateCount] = await Promise.all([
    prisma.position.count({ where: { electionId: election.id } }),
    prisma.candidate.count({ where: { electionId: election.id, approved: true } }),
  ]);
  if (positionCount === 0) {
    blockers.push({ field: "positions", message: "Add at least one position or seat." });
  }
  if (positionCount > 0 && candidateCount === 0) {
    blockers.push({ field: "candidates", message: "Add at least one approved candidate." });
  }

  if (!election.eligibilityPolicy) {
    blockers.push({ field: "eligibility_policy", message: "Choose who is eligible to vote." });
  }
  if (election.eligibilityPolicy === "voter_list") {
    const voterCount = await prisma.electionVoter.count({ where: { electionId: election.id } });
    if (voterCount === 0) {
      blockers.push({
        field: "eligibility_policy",
        message: "Add eligible voters before publishing a voter-list election.",
      });
    }
  }
  if (!election.voterIdMethod) {
    blockers.push({ field: "voter_id_method", message: "Choose the identification method voters will use." });
  }
  if (election.voterIdMethod === "custom" && !election.voterIdLabel?.trim()) {
    blockers.push({ field: "voter_id_label", message: "Name the custom identifier voters must provide." });
  }
  if (election.capacityMode === "restricted" && election.maxVoters !== null && election.maxVoters <= 0) {
    blockers.push({ field: "max_voters", message: "Maximum voters must be greater than zero, or left blank." });
  }
  if (!election.rulesText?.trim()) {
    blockers.push({ field: "rules_text", message: "Write the eligibility rules voters must satisfy." });
  }

  return blockers;
}

/** Throws a 400 containing every publish blocker, or returns cleanly. */
export async function assertPublishable(election: Election): Promise<void> {
  const blockers = await publishBlockers(election);
  if (!blockers.length) return;
  const body: Record<string, string[]> = {};
  for (const blocker of blockers) {
    (body[blocker.field] ??= []).push(blocker.message);
  }
  body.non_field_errors ??= ["Fix the highlighted problems before publishing this election."];
  throw fieldErrors(body);
}

/**
 * Applies a lifecycle transition after re-checking the state machine and,
 * for OPEN, the voting window. Returns the updated row.
 */
export async function transitionElection(
  election: Election,
  target: string,
  now = new Date(),
): Promise<Election> {
  const allowed = LEGAL_TRANSITIONS[election.status] ?? [];
  if (!allowed.includes(target)) {
    throw fieldErrors({
      status: `Cannot transition from ${election.status} to ${target}. Allowed: ${allowed.join(", ") || "none"}.`,
    });
  }

  if (target === "OPEN" && !(election.votingStartAt <= now && now <= election.votingEndAt)) {
    throw fieldErrors({
      status: "Voting is not scheduled to be open right now. Check the voting dates first.",
    });
  }
  if (target === "PUBLISHED") {
    await assertPublishable(election);
  }

  const updates: Record<string, unknown> = { status: target };
  if (target === "ARCHIVED") updates.archivedAt = now;
  if (target === "OPEN") updates.isPublished = true;
  if (target === "CLOSED") updates.resultFinalizedAt = election.resultFinalizedAt ?? now;
  if (target === "RESULTS_PUBLISHED") updates.resultPublishedAt = now;

  return prisma.election.update({
    where: { id: election.id },
    data: updates,
    include: { category: true, organization: true },
  });
}

/** True when ballots may be accepted right now (lifecycle + wall clock). */
export function votingIsOpen(election: Election, now = new Date()): boolean {
  if (!election.isPublished) return false;
  if (election.status !== "OPEN") return false;
  return election.votingStartAt <= now && now <= election.votingEndAt;
}

/** 404 helper shared by dynamic election routes. */
export function electionNotFound(): never {
  throw notFoundModel("Election");
}
