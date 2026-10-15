import { json, makeRoute } from "@/src/lib/api";
import { ApiError, badRequest, serviceUnavailable } from "@/src/lib/http";
import {
  OTP_RESEND_COOLDOWN_MS,
  resendLoginOtp,
  type OtpResendFailure,
} from "@/src/lib/otp";
import { readPayload } from "@/src/lib/request";

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
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      if (!rateLimit(ip)) {
        throw serviceUnavailable("Too many requests. Please try again later.");
      }

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
