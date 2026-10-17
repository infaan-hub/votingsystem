import { json, makeRoute } from "@/src/lib/api";
import { ApiError, badRequest, tooManyRequests } from "@/src/lib/http";
import { clientIp } from "@/src/lib/audit";
import {
  OTP_RESEND_COOLDOWN_MS,
  resendLoginOtp,
  type OtpResendFailure,
} from "@/src/lib/otp";
import { readPayload } from "@/src/lib/request";
import { createAttemptLimiter } from "@/src/lib/rate-limit";

/** Every resend counts: the budget itself is the guard against floods. */
const resendLimiter = createAttemptLimiter({ max: 5, windowMs: 60_000 });

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== undefined && value !== null && typeof value !== "object") {
    return String(value);
  }
  return "";
}

const FAILURE_DETAIL: Record<OtpResendFailure, string> = {
  unknown_challenge: "This sign-in attempt could not be found. Please sign in again.",
  already_used: "This code was already used. Please sign in again.",
  expired: "This code has expired. Please sign in again.",
  max_sends: "Maximum resends reached for this sign-in. Please sign in again.",
  cooldown: "Please wait before requesting another code.",
};

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const ip = clientIp(req);
      if (resendLimiter.limited(ip)) {
        throw tooManyRequests("Too many code requests. Please wait a minute and try again.");
      }
      resendLimiter.record(ip);

      const payload = await readPayload(req);
      const challengeId = Number(asString(payload.challenge_id));
      if (!Number.isInteger(challengeId) || challengeId <= 0) {
        throw badRequest({ detail: "Missing challenge. Please sign in again." });
      }

      const result = await resendLoginOtp(challengeId);
      if (!result.ok) {
        // The cooldown is expected during normal use — 429 tells the client
        // exactly how long to wait; the other reasons end the attempt.
        if (result.reason === "cooldown") {
          throw new ApiError(429, {
            detail: FAILURE_DETAIL.cooldown,
            retry_after_seconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
          });
        }
        throw badRequest({ detail: FAILURE_DETAIL[result.reason] });
      }

      return json({
        challenge_id: result.challengeId,
        expires_at: result.expiresAt.toISOString(),
        send_count: result.sendCount,
        message: "We sent a new login code to your notification devices.",
      });
    },
  },
});
