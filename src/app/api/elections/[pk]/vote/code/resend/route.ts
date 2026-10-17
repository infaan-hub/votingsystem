import { json, makeRoute } from "@/src/lib/api";
import { ApiError, badRequest, notFoundModel } from "@/src/lib/http";
import { findPublishedElection } from "@/src/lib/elections";
import { isAcceptingVotes } from "@/src/lib/serializers";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import {
  OTP_RESEND_COOLDOWN_MS,
  resendVoteCode,
  type VoteCodeResendFailure,
} from "@/src/lib/vote-confirm";

const FAILURE_DETAIL: Record<VoteCodeResendFailure, string> = {
  unknown_challenge: "This verification attempt could not be found. Close this dialog and try again.",
  already_used: "This code was already used. Please confirm your vote with a new code.",
  expired: "This code has expired. Please confirm your vote with a new code.",
  locked: "Too many incorrect attempts. Request a fresh code.",
  max_sends: "Maximum resends reached. Request a fresh code.",
  cooldown: "Please wait before requesting another code.",
  wrong_owner: "This verification attempt could not be found.",
};

/**
 * POST /api/elections/[pk]/vote/code/resend — rotates the code on the SAME
 * challenge (fresh expiry, same attempt budget) and delivers it again.
 * The cooldown and send-cap live on the row, so they are durable across
 * serverless invocations.
 *
 * Eligibility is not re-checked here: the challenge only exists because the
 * voter passed it at issuance, and the cast route re-checks it (identifier
 * included) before any vote is stored.
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
      const challengeId = Number(payload.challenge_id);
      if (!Number.isInteger(challengeId) || challengeId <= 0) {
        throw badRequest({ detail: "Missing challenge. Close this dialog and try again." });
      }

      const result = await resendVoteCode(challengeId, user.id, election);
      if (!result.ok) {
        // The cooldown is expected during normal use — 429 tells the client
        // exactly how long to wait; the other reasons end this attempt.
        if (result.reason === "cooldown") {
          throw new ApiError(429, {
            detail: FAILURE_DETAIL.cooldown,
            retry_after_seconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
          });
        }
        throw badRequest({
          detail: FAILURE_DETAIL[result.reason],
          // Terminal states: the client should request a brand-new code.
          needs_new_code: true,
        });
      }

      return json({
        challenge_id: result.challengeId,
        expires_at: result.expiresAt.toISOString(),
        expires_in: Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)),
        send_count: result.sendCount,
        message: "We sent a new verification code to your notifications.",
      });
    },
  },
});
