import { json, makeRoute } from "@/src/lib/api";
import { badRequest, serviceUnavailable } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { consumeLoginOtp, OTP_LENGTH, type OtpVerifyFailure } from "@/src/lib/otp";
import { readPayload } from "@/src/lib/request";
import { serializeUserSummary } from "@/src/lib/serializers";
import { getOrCreateToken } from "@/src/lib/tokens";

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

const FAILURE_DETAIL: Record<OtpVerifyFailure, string> = {
  unknown_challenge: "This sign-in attempt could not be found. Please sign in again.",
  already_used: "This code was already used. Please sign in again.",
  expired: "This code has expired. Please sign in again.",
  locked: "Too many incorrect attempts. Please sign in again.",
  wrong_code: "That code is not correct.",
};

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      if (!rateLimit(ip)) {
        throw serviceUnavailable("Too many verification attempts. Please try again later.");
      }

      const payload = await readPayload(req);
      const challengeId = Number(asString(payload.challenge_id));
      const code = asString(payload.code).trim();

      if (!Number.isInteger(challengeId) || challengeId <= 0) {
        throw badRequest({ detail: "Missing challenge. Please sign in again." });
      }
      if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
        throw badRequest({ detail: `Enter the ${OTP_LENGTH}-digit code.` });
      }

      const result = await consumeLoginOtp(challengeId, code);
      if (!result.ok) {
        throw badRequest({
          detail: FAILURE_DETAIL[result.reason],
          attempts_remaining:
            result.reason === "wrong_code" ? result.attemptsRemaining : 0,
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        include: {
          department: true,
          section: { include: { department: true } },
        },
      });
      if (!user || !user.isActive) {
        throw badRequest({ detail: "This account is no longer active." });
      }

      const token = await getOrCreateToken(user.id);
      return json({ token: token.key, user: serializeUserSummary(user) });
    },
  },
});
