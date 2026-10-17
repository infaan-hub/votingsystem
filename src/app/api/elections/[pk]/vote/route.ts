import { json, makeRoute } from "@/src/lib/api";
import { ApiError, badRequest, notFoundModel } from "@/src/lib/http";
import { findPublishedElection } from "@/src/lib/elections";
import { checkElectionEligibility } from "@/src/lib/eligibility";
import { isAcceptingVotes, serializeElectionList } from "@/src/lib/serializers";
import { readPayload } from "@/src/lib/request";
import { requireStateUser, type UserWithRelations } from "@/src/lib/auth";
import { verifyPassword } from "@/src/lib/password";
import {
  assertNoExistingVotes,
  lookupIdempotentReplay,
  normalizeBallotSelections,
  submitBallot,
} from "@/src/lib/vote-submit";
import {
  consumeVoteCode,
  voteCodeRequired,
  type VoteCodeVerifyFailure,
} from "@/src/lib/vote-confirm";
import type { Election } from "@/src/generated/prisma/client";

const CODE_DETAIL: Record<VoteCodeVerifyFailure, string> = {
  unknown_challenge: "This verification code is not valid. Please try again.",
  already_used: "This code was already used. Please confirm your vote with a new code.",
  expired: "This code has expired. Please confirm your vote with a new code.",
  locked: "Too many incorrect attempts. Please confirm your vote with a new code.",
  wrong_code: "That code is not correct.",
};

/**
 * The confirmation step, checked LAST so a rejected ballot never burns a valid
 * code. Voters the notification pipeline can reach confirm with the code from
 * their devices; everyone else confirms with their account password (checked
 * server-side — a missing password on Google-only accounts is the one case
 * where possession of the session is the whole proof).
 */
async function verifyConfirmation(
  election: Election,
  user: UserWithRelations,
  payload: Record<string, unknown>,
): Promise<void> {
  if (await voteCodeRequired(user.id)) {
    const confirm = (payload.confirm_code ?? {}) as Record<string, unknown>;
    const challengeId = Number(confirm.challenge_id);
    const code = typeof confirm.code === "string" ? confirm.code.trim() : "";
    if (!Number.isInteger(challengeId) || challengeId <= 0 || !code) {
      throw badRequest({
        detail: "Enter the verification code from your notifications to confirm your vote.",
        code_required: true,
      });
    }

    const verification = await consumeVoteCode(challengeId, code, user.id, election.id);
    if (!verification.ok) {
      throw badRequest({
        detail: CODE_DETAIL[verification.reason],
        attempts_remaining:
          verification.reason === "wrong_code" ? verification.attemptsRemaining : 0,
        needs_new_code: verification.reason !== "wrong_code",
      });
    }
    return;
  }

  if (!user.password) return;

  const reauth = (payload.reauth ?? {}) as Record<string, unknown>;
  const password = typeof reauth.password === "string" ? reauth.password : "";
  if (!password) {
    throw badRequest({
      detail: "Enter your account password to confirm your vote.",
      password_required: true,
    });
  }
  if (!verifyPassword(password, user.password)) {
    throw badRequest({
      detail: "That password is not correct.",
      password_required: true,
    });
  }
}

/**
 * Casts a ballot for the authenticated voter.
 *
 * Body: `{ selections: [{ position_id, candidate_ids: number[] }],
 *          identifier?, confirm_code?: { challenge_id, code },
 *          reauth?: { password } }`
 *
 * Integrity rules enforced here, in order:
 *  - the election must exist, be published, and be open for voting (status
 *    OPEN inside its window — the same predicate the ballot uses);
 *  - eligibility is checked on EVERY path, including identifier-based
 *    methods: the voter must supply the matching identifier when the election
 *    asks for one, and list/capacity/role rules always apply;
 *  - every question and option must belong to this election, and the voter
 *    must be eligible for that specific question (department/section/group);
 *  - a `Idempotency-Key` header replays the original receipt instead of
 *    casting a second ballot;
 *  - one submission per (voter, election, question) is enforced by a database
 *    unique constraint, so concurrent submissions cannot both persist;
 *  - the confirmation code / password is consumed last and only after the
 *    ballot would otherwise be accepted.
 */
export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (req, params, state) => {
      const user = requireStateUser(state);

      const election = await findPublishedElection(params.pk ?? "");
      if (!election) throw notFoundModel("Election");
      if (!isAcceptingVotes(election)) {
        throw badRequest({ detail: "Voting is not open for this election." });
      }

      const payload = await readPayload(req);
      const identifier = typeof payload.identifier === "string" ? payload.identifier.trim() : "";

      // 1. Election-level eligibility — never skipped, whatever the
      //    confirmation channel turns out to be.
      const eligibility = await checkElectionEligibility(election, user, identifier);
      if (!eligibility.eligible) {
        throw badRequest({
          detail: eligibility.reason,
          identifier_required: eligibility.requiresIdentifier,
          identifier_label: eligibility.identifierLabel,
        });
      }

      // 2. Selections: real questions, real options, per-question eligibility.
      const entries = await normalizeBallotSelections(election, user, payload.selections);

      // 3. Retry replay, then the (indexed, non-race-safe) duplicate pre-check.
      const idempotencyKey = (req.headers.get("Idempotency-Key") ?? "").trim() || null;
      if (idempotencyKey) {
        const replay = await lookupIdempotentReplay(user.id, election.id, entries, idempotencyKey);
        if (replay.kind === "conflict") {
          throw new ApiError(409, {
            detail: "This retry key was already used with different selections.",
          });
        }
        if (replay.kind === "match") {
          return json({
            receipt_code: replay.receiptCode,
            cast_at: replay.castAt,
            election: serializeElectionList(election),
            replayed: true,
          });
        }
      }
      await assertNoExistingVotes(user.id, election.id, entries);

      // 4. Confirmation, then the transaction (replays a race winner too).
      await verifyConfirmation(election, user, payload);
      const result = await submitBallot({ user, election, entries, idempotencyKey });

      return json(
        {
          receipt_code: result.receiptCode,
          cast_at: result.castAt,
          election: serializeElectionList(election),
          replayed: result.replayed,
        },
        result.replayed ? 200 : 201,
      );
    },
  },
});
