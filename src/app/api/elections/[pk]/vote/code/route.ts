import { json, makeRoute } from "@/src/lib/api";
import { badRequest, forbidden, notFoundModel, serviceUnavailable } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { readPayload } from "@/src/lib/request";
import { checkElectionEligibility } from "@/src/lib/eligibility";
import { pushDeliveryConfigured } from "@/src/lib/otp";
import {
  issueVoteCode,
  OTP_LENGTH,
  voteCodeRequired,
} from "@/src/lib/vote-confirm";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

/**
 * POST /api/elections/[pk]/vote/code — called when the voter taps
 * "Confirm your vote".
 *
 * Returns `requires_code: false` when the notification pipeline cannot reach
 * this voter (no VAPID / no subscribed device): the client then keeps the
 * legacy password/biometric step, so nobody is ever blocked from voting.
 *
 * When a code IS required it is only issued to a voter who is allowed to
 * vote in this election, and the notification carries the code (push to the
 * voter's devices plus the in-app record readable from the bell).
 */
export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (req, params, state) => {
      const user = requireStateUser(state);
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      if (!rateLimit(`vote-code:${ip}`)) {
        throw serviceUnavailable("Too many requests. Please try again later.");
      }
      await readPayload(req);

      const pk = params.pk ?? "";
      const election = await prisma.election.findFirst({
        where: pk && /^\d+$/.test(pk)
          ? { id: Number(pk), isPublished: true }
          : { slug: pk, isPublished: true },
      });
      if (!election) {
        throw notFoundModel("Election");
      }

      const now = new Date();
      if (election.status !== "OPEN" || election.votingStartAt > now || election.votingEndAt < now) {
        throw badRequest({ detail: "Voting is not open for this election." });
      }

      if (!(await voteCodeRequired(user.id))) {
        return json({
          requires_code: false,
          reason: pushDeliveryConfigured() ? "no_subscribed_device" : "push_not_configured",
        });
      }

      // "Allowed to vote in this election" gates the code. Identifier-based
      // elections verified their identifier earlier in the voter's journey
      // (the ballot step), so a missing identifier here is not a blocker —
      // every other refusal (role, list, capacity, deactivated) is.
      const eligibility = await checkElectionEligibility(election, user, null);
      if (!eligibility.eligible && !eligibility.requiresIdentifier) {
        throw forbidden(eligibility.reason);
      }

      const issued = await issueVoteCode(user.id, election);
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
