import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/src/lib/db";
import { ApiError, fieldErrors, serviceUnavailable } from "@/src/lib/http";
import { isUniqueConstraintViolation, isUserEligible } from "@/src/lib/services";
import type { Election } from "@/src/generated/prisma/client";
import type { UserWithRelations } from "@/src/lib/auth";

/** At most this many questions may be answered in one submission request. */
export const MAX_QUESTIONS_PER_SUBMISSION = 20;

export type NormalizedSelection = {
  positionId: number;
  positionName: string;
  candidateIds: number[];
};

export type BallotSubmissionResult = {
  receiptCode: string;
  castAt: Date;
  replayed: boolean;
};

/** Deterministic digest of one question's normalized choices. */
function entryFingerprint(entry: NormalizedSelection): string {
  const ids = [...entry.candidateIds].sort((a, b) => a - b).join(",");
  return createHash("sha256").update(`${entry.positionId}:${ids}`).digest("hex");
}

/**
 * Validates the submitted selections against the election and the voter's own
 * per-question eligibility. Returns one normalized entry per question.
 *
 * Throws field errors (400) for every rejection, so a malformed or ineligible
 * ballot never reaches the insert.
 */
export async function normalizeBallotSelections(
  election: Election,
  user: UserWithRelations,
  raw: unknown,
): Promise<NormalizedSelection[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fieldErrors({ selections: "Submit at least one selection." });
  }
  if (raw.length > MAX_QUESTIONS_PER_SUBMISSION) {
    throw fieldErrors({
      selections: `A ballot may contain at most ${MAX_QUESTIONS_PER_SUBMISSION} questions.`,
    });
  }

  const requested = new Map<number, number[]>();
  for (const entry of raw) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const positionId = Number(record.position_id);
    if (!Number.isInteger(positionId) || positionId <= 0) {
      throw fieldErrors({ selections: "Each selection needs a valid position_id." });
    }
    if (requested.has(positionId)) {
      throw fieldErrors({ selections: `Question ${positionId} was submitted twice.` });
    }

    const ids = Array.isArray(record.candidate_ids) ? record.candidate_ids : [];
    const candidateIds = ids.map((value) => Number(value));
    if (candidateIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw fieldErrors({ selections: "Each selected option must be a numeric id." });
    }
    if (candidateIds.length === 0) {
      throw fieldErrors({ selections: `No option selected for question ${positionId}.` });
    }
    if (new Set(candidateIds).size !== candidateIds.length) {
      throw fieldErrors({ selections: `Duplicate option for question ${positionId}.` });
    }
    requested.set(positionId, candidateIds);
  }

  // Two batched lookups cover every question and option in the submission.
  const positions = await prisma.position.findMany({
    where: { id: { in: [...requested.keys()] }, electionId: election.id },
  });
  const positionById = new Map(positions.map((position) => [position.id, position]));

  const allCandidateIds = [...new Set([...requested.values()].flat())];
  const candidates = allCandidateIds.length
    ? await prisma.candidate.findMany({
        where: { id: { in: allCandidateIds }, electionId: election.id, approved: true },
        select: { id: true, positionId: true },
      })
    : [];
  const candidatePosition = new Map(
    candidates.map((candidate) => [candidate.id, candidate.positionId]),
  );

  const entries: NormalizedSelection[] = [];
  for (const [positionId, candidateIds] of requested) {
    const position = positionById.get(positionId);
    if (!position) {
      throw fieldErrors({ selections: `Question ${positionId} is not part of this election.` });
    }
    if (!isUserEligible(position, user)) {
      throw fieldErrors({ selections: `You are not eligible to vote for "${position.name}".` });
    }
    const max = Math.max(1, position.maxSelections);
    if (candidateIds.length > max) {
      throw fieldErrors({
        selections: `"${position.name}" allows at most ${max} selection(s).`,
      });
    }
    for (const candidateId of candidateIds) {
      if (candidatePosition.get(candidateId) !== positionId) {
        throw fieldErrors({
          selections: `One or more options in "${position.name}" are not valid for that question.`,
        });
      }
    }
    entries.push({ positionId, positionName: position.name, candidateIds });
  }

  return entries;
}

export type ReplayOutcome =
  | { kind: "none" }
  | { kind: "conflict" }
  | { kind: "match"; receiptCode: string; castAt: Date };

/**
 * Looks for a previous submission carrying this retry key. A match means the
 * original response was lost and can be replayed; a conflict means the key was
 * reused for genuinely different content and must not be honored.
 */
export async function lookupIdempotentReplay(
  userId: number,
  electionId: number,
  entries: NormalizedSelection[],
  idempotencyKey: string,
): Promise<ReplayOutcome> {
  const stored = await prisma.voteSubmission.findMany({
    where: { voterId: userId, electionId, idempotencyKey },
    orderBy: { id: "asc" },
  });
  if (stored.length === 0) return { kind: "none" };
  if (stored.length !== entries.length) return { kind: "conflict" };

  for (const entry of entries) {
    const match = stored.find((row) => row.positionId === entry.positionId);
    if (!match || match.selectionsHash !== entryFingerprint(entry)) {
      return { kind: "conflict" };
    }
  }
  const first = stored[0];
  return { kind: "match", receiptCode: first.receiptCode, castAt: first.createdAt };
}

export function alreadyVotedError(positionName?: string): ApiError {
  return fieldErrors({
    __all__: positionName
      ? `You have already voted for "${positionName}" in this election.`
      : "You have already voted for this position in this election.",
  });
}

/**
 * The duplicate guard, in two layers: submissions (new rows) and legacy vote
 * rows created before submissions existed. Both count as "already voted".
 */
export async function assertNoExistingVotes(
  userId: number,
  electionId: number,
  entries: NormalizedSelection[],
): Promise<void> {
  const positionIds = entries.map((entry) => entry.positionId);
  const [submissions, legacyVotes] = await Promise.all([
    prisma.voteSubmission.findMany({
      where: { voterId: userId, electionId, positionId: { in: positionIds } },
      select: { positionId: true, position: { select: { name: true } } },
    }),
    prisma.vote.findMany({
      where: { voterId: userId, electionId, positionId: { in: positionIds } },
      select: { positionId: true },
    }),
  ]);

  const nameByPosition = new Map(entries.map((entry) => [entry.positionId, entry.positionName]));
  if (submissions.length > 0) {
    throw alreadyVotedError(submissions[0].position.name);
  }
  if (legacyVotes.length > 0) {
    throw alreadyVotedError(nameByPosition.get(legacyVotes[0].positionId));
  }
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

/**
 * Casts a ballot: one submission row per question (the race-safe duplicate
 * guard) plus one vote row per selected option. Capacity is re-checked inside
 * the transaction under serializable isolation, so two voters cannot slip past
 * the last slot together.
 */
export async function submitBallot(options: {
  user: UserWithRelations;
  election: Election;
  entries: NormalizedSelection[];
  idempotencyKey?: string | null;
}): Promise<BallotSubmissionResult> {
  const { user, election, entries } = options;
  const idempotencyKey = options.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const replay = await lookupIdempotentReplay(user.id, election.id, entries, idempotencyKey);
    if (replay.kind === "match") {
      return { receiptCode: replay.receiptCode, castAt: replay.castAt, replayed: true };
    }
    if (replay.kind === "conflict") {
      throw new ApiError(409, {
        detail: "This retry key was already used with different selections.",
      });
    }
  }

  await assertNoExistingVotes(user.id, election.id, entries);

  const receiptCode = randomBytes(12).toString("hex").toUpperCase();
  const fingerprintByPosition = new Map(
    entries.map((entry) => [entry.positionId, entryFingerprint(entry)]),
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const castAt = await prisma.$transaction(
        async (tx) => {
          if (election.capacityMode === "restricted" && election.maxVoters !== null) {
            const participants = await tx.vote.findMany({
              where: { electionId: election.id },
              select: { voterId: true },
              distinct: ["voterId"],
            });
            const alreadyCounted = participants.some((row) => row.voterId === user.id);
            if (!alreadyCounted && participants.length >= election.maxVoters) {
              throw fieldErrors({ election: "This election has reached its voter capacity." });
            }
          }

          let firstCastAt: Date | null = null;
          for (const entry of entries) {
            const submission = await tx.voteSubmission.create({
              data: {
                voterId: user.id,
                electionId: election.id,
                positionId: entry.positionId,
                idempotencyKey,
                selectionsHash: fingerprintByPosition.get(entry.positionId) ?? "",
                receiptCode,
              },
            });
            if (!firstCastAt) firstCastAt = submission.createdAt;

            await tx.vote.createMany({
              data: entry.candidateIds.map((candidateId) => ({
                voterId: user.id,
                electionId: election.id,
                positionId: entry.positionId,
                candidateId,
                receiptCode,
                submissionId: submission.id,
              })),
            });
          }
          return firstCastAt ?? new Date();
        },
        { isolationLevel: "Serializable" },
      );

      return { receiptCode, castAt, replayed: false };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        if (idempotencyKey) {
          const replay = await lookupIdempotentReplay(user.id, election.id, entries, idempotencyKey);
          if (replay.kind === "match") {
            return { receiptCode: replay.receiptCode, castAt: replay.castAt, replayed: true };
          }
        }
        // A concurrent submission won the race for one of these questions.
        await assertNoExistingVotes(user.id, election.id, entries);
        throw alreadyVotedError();
      }
      if (isSerializationConflict(error)) {
        if (attempt === 0) continue;
        throw serviceUnavailable("Please try again.");
      }
      throw error;
    }
  }

  throw serviceUnavailable("Please try again.");
}
