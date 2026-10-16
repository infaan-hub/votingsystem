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
import { clientIp } from "@/src/lib/audit";
import {
  registerPushSubscription,
  tryParseSubscription,
} from "@/src/lib/notifications/subscription";

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
      // A sign-in tapped on a phone may carry the push subscription that
      // browser just created, so the code can be delivered to the very
      // device asking for it (see the first-device rule below).
      const deviceSubscription = tryParseSubscription(
        (payload as Record<string, unknown>).push_subscription,
      );

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

      // Step-up verification: a 6-digit login code is required when it can
      // actually reach the user. This runs for every role. When the account
      // has no device yet, a subscription carried by this sign-in binds the
      // browser as the account's first device — the login-device check on the
      // sign-in screen asked for notification permission and created it — so
      // the code is delivered to the device the user is holding. Anyone
      // without a delivery channel keeps password-only sign-in, so nobody can
      // be locked out by a missing channel.
      if (pushDeliveryConfigured()) {
        let canReceiveCode = await hasActivePushSubscription(user.id);
        if (!canReceiveCode && deviceSubscription) {
          await registerPushSubscription({
            userId: user.id,
            ...deviceSubscription,
            userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
            ipAddress: clientIp(req),
          });
          canReceiveCode = true;
        }

        if (canReceiveCode) {
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