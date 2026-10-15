import crypto from "node:crypto";

import { prisma } from "@/src/lib/db";
import { notify } from "@/src/lib/notifications/notify";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_MS, OTP_TARGET_URL, OTP_TTL_MS } from "@/src/lib/otp-constants";

export { OTP_LENGTH, OTP_RESEND_COOLDOWN_MS, OTP_TARGET_URL, OTP_TTL_MS };

/** Wrong guesses allowed per challenge before it is locked. */
export const MAX_OTP_ATTEMPTS = 5;
/** Codes that may be issued per challenge (initial send + resends). */
export const MAX_OTP_SENDS = 3;
/** Durable per-user issuance limit, measured over this window. */
export const OTP_ISSUE_WINDOW_MS = 10 * 60_000;
export const MAX_OTP_ISSUES_PER_WINDOW = 5;

/** Random 6-digit code. `crypto.randomInt` is unbiased (no modulo bias). */
export function generateOtpCode(): string {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

/** The plaintext code is never stored — only this digest. */
export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

/** Constant-time code check against the stored SHA-256 hex digest. */
export function verifyOtpCode(code: string, codeHash: string): boolean {
  const actual = Buffer.from(hashOtpCode(code), "hex");
  const expected = Buffer.from(codeHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** True when at least one device of this user can receive a push right now. */
export async function hasActivePushSubscription(userId: number): Promise<boolean> {
  const count = await prisma.pushSubscription.count({
    where: { userId, disabledAt: null },
  });
  return count > 0;
}

/** True when the server can sign push requests (all three VAPID vars set). */
export function pushDeliveryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

async function sendOtpCode(
  userId: number,
  challengeId: number,
  code: string,
  sendCount: number,
): Promise<void> {
  const minutes = Math.round(OTP_TTL_MS / 60_000);
  await notify({
    recipientIds: [userId],
    title: "Your login code",
    body: `Your ${OTP_LENGTH}-digit login code is ${code}. It expires in ${minutes} minutes. If you did not try to sign in, ignore this message.`,
    category: "account",
    tag: `login-otp-${challengeId}`,
    targetUrl: OTP_TARGET_URL,
    // One key per send: a resend issues a NEW code, so it must not dedupe
    // against the previous one.
    idempotencyKey: `login-otp-${challengeId}-s${sendCount}`,
    data: { kind: "login-otp", challengeId },
  });
}

export type OtpIssueResult =
  | { ok: true; challengeId: number; expiresAt: Date }
  | { ok: false; reason: "rate_limited" };

/**
 * Creates a fresh challenge for the user and delivers the code as a push
 * notification (plus in-app record) to their subscribed devices. Any earlier
 * unconsumed challenge for the user is superseded: only the newest code works.
 */
export async function issueLoginOtp(userId: number): Promise<OtpIssueResult> {
  const recent = await prisma.otpChallenge.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - OTP_ISSUE_WINDOW_MS) } },
  });
  if (recent >= MAX_OTP_ISSUES_PER_WINDOW) return { ok: false, reason: "rate_limited" };

  await prisma.otpChallenge.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const challenge = await prisma.otpChallenge.create({
    data: { userId, codeHash: hashOtpCode(code), expiresAt },
  });
  await sendOtpCode(userId, challenge.id, code, challenge.sendCount);
  return { ok: true, challengeId: challenge.id, expiresAt };
}

export type OtpResendFailure = "unknown_challenge" | "already_used" | "expired" | "max_sends" | "cooldown";

export type OtpResendResult =
  | { ok: true; challengeId: number; expiresAt: Date; sendCount: number }
  | { ok: false; reason: OtpResendFailure };

/**
 * Issues a new code on the SAME challenge (fresh expiry, attempts reset).
 * Durable cooldown and send-cap live on the row, so serverless instances
 * cannot reset them between invocations.
 */
export async function resendLoginOtp(challengeId: number): Promise<OtpResendResult> {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, reason: "unknown_challenge" };
  if (challenge.consumedAt) return { ok: false, reason: "already_used" };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (challenge.sendCount >= MAX_OTP_SENDS) return { ok: false, reason: "max_sends" };
  if (Date.now() - challenge.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  const code = generateOtpCode();
  const sendCount = challenge.sendCount + 1;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: {
      codeHash: hashOtpCode(code),
      expiresAt,
      attempts: 0,
      sendCount,
      lastSentAt: new Date(),
    },
  });
  await sendOtpCode(challenge.userId, challenge.id, code, sendCount);
  return { ok: true, challengeId: challenge.id, expiresAt, sendCount };
}

export type OtpVerifyFailure = "unknown_challenge" | "already_used" | "expired" | "locked" | "wrong_code";

export type OtpVerifyResult =
  | { ok: true; userId: number }
  | { ok: false; reason: OtpVerifyFailure; attemptsRemaining: number };

/**
 * Checks the code and consumes the challenge. Consumption is an atomic
 * update guarded on `consumedAt: null`, so two concurrent verifies can never
 * both succeed.
 */
export async function consumeLoginOtp(challengeId: number, code: string): Promise<OtpVerifyResult> {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, reason: "unknown_challenge", attemptsRemaining: 0 };
  if (challenge.consumedAt) return { ok: false, reason: "already_used", attemptsRemaining: 0 };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired", attemptsRemaining: 0 };
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) return { ok: false, reason: "locked", attemptsRemaining: 0 };

  if (!verifyOtpCode(code, challenge.codeHash)) {
    const updated = await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      reason: "wrong_code",
      attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - updated.attempts),
    };
  }

  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challengeId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return { ok: false, reason: "already_used", attemptsRemaining: 0 };
  return { ok: true, userId: challenge.userId };
}
