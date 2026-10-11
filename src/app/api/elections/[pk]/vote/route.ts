import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, intField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { serializeElectionList } from "@/src/lib/serializers";
import crypto from "node:crypto";

/**
 * Casts a ballot for the authenticated voter.
 *
 * Body: `{ selections: [{ position_id, candidate_ids: number[] }], reauth: {...} }`
 *
 * Integrity rules enforced here:
 *  - the election must exist, be published, and be open for voting;
 *  - every candidate must belong to the election and the question it is
 *    submitted for (cross-election / cross-question selections are rejected);
 *  - the number of selections cannot exceed the question's limit;
 *  - the one-vote-per-question guarantee comes from the database unique
 *    constraint, so two concurrent submissions cannot both persist;
 *  - a `Idempotency-Key` header makes a retried request replay the original
 *    receipt instead of casting a second ballot.
 */
export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (req, params, state) => {
      const user = requireStateUser(state);
      const pk = params.pk ?? "";
      const election = await prisma.election.findFirst({
        where: pk && /^\d+$/.test(pk) ? { id: Number(pk), isPublished: true } : { slug: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");

      const now = new Date();
      if (election.status !== "OPEN" || election.votingStartAt > now || election.votingEndAt < now) {
        throw fieldErrors({ election: "Voting is not open for this election." });
      }

      const payload = await readPayload(req);
      const rawSelections = Array.isArray(payload.selections) ? payload.selections : [];
      if (rawSelections.length === 0) {
        throw fieldErrors({ selections: "Submit at least one selection." });
      }

      // Validate every selection against the election and its own question.
      const rows: Array<{ positionId: number; candidateId: number }> = [];
      const perPosition = new Map<number, number[]>();

      for (const entry of rawSelections) {
        const record = (entry ?? {}) as Record<string, unknown>;
        const c = new Collector();
        const positionId = intField(c, { position_id: record.position_id }, "position_id")!;
        const ids = Array.isArray(record.candidate_ids) ? record.candidate_ids : [];
        const candidateIds = ids.map((value) => Number(value)).filter((value) => Number.isInteger(value));
        c.throwIfAny();

        const position = await prisma.position.findFirst({
          where: { id: positionId, electionId: election.id },
        });
        if (!position) {
          throw fieldErrors({ selections: `Question ${positionId} is not part of this election.` });
        }
        if (candidateIds.length === 0) {
          throw fieldErrors({ selections: `No option selected for "${position.name}".` });
        }
        if (candidateIds.length > Math.max(1, position.maxSelections)) {
          throw fieldErrors({
            selections: `"${position.name}" allows at most ${position.maxSelections} selection(s).`,
          });
        }
        if (new Set(candidateIds).size !== candidateIds.length) {
          throw fieldErrors({ selections: `Duplicate selection for "${position.name}".` });
        }

        // Reject candidates that belong to a different election or question.
        const valid = await prisma.candidate.findMany({
          where: {
            id: { in: candidateIds },
            electionId: election.id,
            positionId: position.id,
            approved: true,
          },
          select: { id: true },
        });
        if (valid.length !== candidateIds.length) {
          throw fieldErrors({
            selections: `One or more options in "${position.name}" are not valid for that question.`,
          });
        }

        perPosition.set(positionId, candidateIds);
        for (const candidateId of candidateIds) rows.push({ positionId, candidateId });
      }

      // Idempotent replay: a retried request returns the first receipt rather
      // than recording a second ballot.
      const idempotencyKey = req.headers.get("Idempotency-Key");
      if (idempotencyKey) {
        const replay = await prisma.vote.findFirst({
          where: {
            voterId: user.id,
            electionId: election.id,
            idempotencyKey,
          },
          orderBy: { createdAt: "asc" },
        });
        if (replay) {
          return json({
            receipt_code: replay.receiptCode,
            cast_at: replay.createdAt,
            election: serializeElectionList(election),
            replayed: true,
          });
        }
      }

      // Already-voted questions are reported as duplicates, matching the single
      // message used everywhere else for this failure.
      const alreadyVoted = await prisma.vote.findMany({
        where: {
          voterId: user.id,
          electionId: election.id,
          positionId: { in: [...perPosition.keys()] },
        },
        select: { positionId: true },
      });
      if (alreadyVoted.length > 0) {
        throw fieldErrors({ __all__: "You have already voted for this position in this election." });
      }

      const receiptCode = crypto.randomBytes(12).toString("hex").toUpperCase();
      const keyToStore = idempotencyKey;

      try {
        const created = await prisma.$transaction(async (tx) => {
          const votes = [];
          for (const row of rows) {
            votes.push(
              await tx.vote.create({
                data: {
                  voterId: user.id,
                  electionId: election.id,
                  positionId: row.positionId,
                  candidateId: row.candidateId,
                  receiptCode,
                  idempotencyKey: keyToStore,
                },
              }),
            );
          }
          return votes;
        });

        return json(
          {
            receipt_code: receiptCode,
            cast_at: created[0]?.createdAt ?? new Date(),
            election: serializeElectionList(election),
          },
          201,
        );
      } catch (error) {
        // The unique constraint is the authoritative duplicate guard, so a race
        // loser surfaces here rather than at the pre-check above.
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ __all__: "You have already voted for this position in this election." });
        }
        throw error;
      }
    },
  },
});
