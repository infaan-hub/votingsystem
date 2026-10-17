import { json, makeRoute } from "@/src/lib/api";
import { badRequest, forbidden, notFoundModel, serviceUnavailable } from "@/src/lib/http";
import { findPublishedElection } from "@/src/lib/elections";
import { checkElectionEligibility } from "@/src/lib/eligibility";
import { isAcceptingVotes } from "@/src/lib/serializers";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { pushDeliveryConfigured } from "@/src/lib/otp";
import { issueVoteCode, OTP_LENGTH, voteCodeRequired } from "@/src/lib/vote-confirm";

/**
 * POST /api/elections/[pk]/vote/code — called when the voter taps
 * "Confirm your vote".
 *
 * Returns `requires_code: false` when the notification pipeline cannot reach
 * this voter (no VAPID / no subscribed device): the client then uses the
 * password step, so nobody is ever blocked from voting.
 *
 * When a code IS required it is only issued to a voter who is allowed to
 * vote in this election — the very same eligibility decision the cast route
 * makes, identifier included. The notification carries the code (push to the
 * voter's devices plus the in-app record readable from the bell).
 *
 * `fresh: true` rotates the code even when a live challenge exists (used when
 * the previous one was locked, used or expired), bounded by the durable
 * per-(voter, election) issuance window.
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

      const eligibility = await checkElectionEligibility(election, user, identifier);
      if (!eligibility.eligible) {
        // Identifier-based refusals are retryable: the voter may have typed
        // the wrong value, so the client shows the input again.
        if (eligibility.requiresIdentifier) {
          throw badRequest({
            detail: eligibility.reason,
            identifier_required: true,
            identifier_label: eligibility.identifierLabel,
          });
        }
        throw forbidden(eligibility.reason);
      }

      if (!(await voteCodeRequired(user.id))) {
        return json({
          requires_code: false,
          reason: pushDeliveryConfigured() ? "no_subscribed_device" : "push_not_configured",
        });
      }

      const issued = await issueVoteCode(user.id, election, { fresh: payload.fresh === true });
      if (!issued.ok) {
        throw serviceUnavailable(
          "Too many codes requested. Please wait a few minutes and try again.",
        );
      }

      return json({
        requires_code: true,
        code_length: OTP_LENGTH,
        challenge_id: issued.challengeId,
        expires_at: issued.expiresAt.toISOString(),
        expires_in: Math.max(0, Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000)),
        send_count: issued.sendCount,
        created: issued.created,
        message: "We sent a verification code to your notifications.",
      });
    },
  },
});
