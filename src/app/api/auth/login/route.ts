import { json, makeRoute } from "@/src/lib/api";
import { badRequest, serviceUnavailable, tooManyRequests } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { hashPassword, verifyPassword } from "@/src/lib/password";
import { createAttemptLimiter } from "@/src/lib/rate-limit";
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

/** Only failed attempts count, so a shared address cannot lock out its users. */
const loginLimiter = createAttemptLimiter({ max: 5, windowMs: 60_000 });

/**
 * Hash used to equalize timing for unknown usernames: verifying against it
 * costs the same as verifying a real account, so response time does not leak
 * whether the username exists.
 */
let dummyPasswordHash: string | null = null;
function dummyHash(): string {
  dummyPasswordHash ??= hashPassword("not-a-real-password");
  return dummyPasswordHash;
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
      const ip = clientIp(req);
      if (loginLimiter.limited(ip)) {
        throw tooManyRequests("Too many failed sign-ins. Please wait a minute and try again.");
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

      const passwordOk = verifyPassword(password, user?.password || dummyHash());
      if (!user || !user.isActive || !passwordOk) {
        loginLimiter.record(ip);
        throw badRequest({ detail: "Invalid username or password." });
      }
      loginLimiter.clear(ip);
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

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
        must_change_password: user.mustChangePassword,
      });
    },
  },
});