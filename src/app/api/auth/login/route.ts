import { json, makeRoute } from "@/src/lib/api";
import { badRequest, serviceUnavailable } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { verifyPassword } from "@/src/lib/password";
import {
  hasActivePushSubscription,
  issueLoginOtp,
  pushDeliveryConfigured,
} from "@/src/lib/otp";
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

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      if (!rateLimit(ip)) {
        throw serviceUnavailable("Too many login attempts. Please try again later.");
      }

      const payload = await readPayload(req);
      const username = asString(payload.username);
      const password = asString(payload.password);

      const user = await prisma.user.findUnique({
        where: { username },
        include: {
          department: true,
          section: { include: { department: true } },
        },
      });

      if (!user || !user.isActive || !verifyPassword(password, user.password)) {
        throw badRequest({ detail: "Invalid username or password." });
      }

      // Step-up verification: a 6-digit login code is required only when it
      // can actually reach the user — VAPID configured AND at least one
      // subscribed device. Otherwise the password alone still signs them in,
      // so nobody can be locked out by a missing channel.
      if (pushDeliveryConfigured() && (await hasActivePushSubscription(user.id))) {
        const issued = await issueLoginOtp(user.id);
        if (!issued.ok) {
          throw serviceUnavailable(
            "Too many sign-in codes requested. Please wait a few minutes and try again.",
          );
        }
        return json({
          otp_required: true,
          challenge_id: issued.challengeId,
          expires_at: issued.expiresAt.toISOString(),
          expires_in: Math.max(
            0,
            Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000),
          ),
          message: "We sent a login code to your notification devices.",
        });
      }

      const token = await getOrCreateToken(user.id);
      return json({
        otp_required: false,
        token: token.key,
        user: serializeUserSummary(user),
      });
    },
  },
});