import { prisma } from "@/src/lib/db";
import { notify } from "@/src/lib/notifications/notify";
import type { Election } from "@/src/generated/prisma/client";
import {
  generateOtpCode,
  hasActivePushSubscription,
  hashOtpCode,
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  pushDeliveryConfigured,
  verifyOtpCode,
} from "@/src/lib/otp";

export { OTP_LENGTH, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS };

/** Wrong guesses allowed per vote challenge before it is locked. */
export const MAX_VOTE_CODE_ATTEMPTS = 5;
/** Codes that may be issued per challenge (initial send + resends). */
export const MAX_VOTE_CODE_SENDS = 3;
/** Durable per (voter, election) issuance limit, measured over this window. */
export const VOTE_CODE_ISSUE_WINDOW_MS = 10 * 60_000;
export const MAX_VOTE_CODE_ISSUES_PER_WINDOW = 5;

/**
 * Whether the confirmation code is REQUIRED for this voter right now: the
 * notification pipeline must be able to reach them (VAPID configured AND at
 * least one subscribed device). Everyone else keeps the legacy
 * password/biometric step so no voter is ever blocked by a missing channel.
 */
export async function voteCodeRequired(userId: number): Promise<boolean> {
  return pushDeliveryConfigured() && (await hasActivePushSubscription(userId));
}

async function sendVoteCode(
  userId: number,
  election: Election,
  rowId: number,
  code: string,
  sendCount: number,
): Promise<void> {
  const minutes = Math.round(OTP_TTL_MS / 60_000);
  await notify({
    recipientIds: [userId],
    title: "Your vote code",
    body: `Your code to confirm your vote in ${election.title} is ${code}. It expires in ${minutes} minutes. Do not share it with anyone.`,
    category: "vote",
    tag: `vote-code-${rowId}`,
    targetUrl: `/vote/${election.slug}`,
    // One key per send: a resend issues a NEW code, so it must not dedupe
    // against the previous one.
    idempotencyKey: `vote-code-${rowId}-s${sendCount}`,
    data: { kind: "vote-confirm", electionId: election.id },
  });
}

export type VoteCodeIssueResult =
  | { ok: true; challengeId: number; expiresAt: Date; created: boolean; sendCount: number }
  | { ok: false; reason: "rate_limited" };

/**
 * Issues (or reuses) the confirmation code for this voter in this election.
 * A live challenge is returned as-is — reopening the confirm sheet never
 * spams a second notification.
 */
export async function issueVoteCode(
  userId: number,
  election: Election,
): Promise<VoteCodeIssueResult> {
  const now = Date.now();

  const live = await prisma.voteConfirmCode.findFirst({
    where: {
      userId,
      electionId: election.id,
      consumedAt: null,
      expiresAt: { gte: new Date(now) },
      // A locked challenge (attempt cap reached) is dead — never hand it back.
      attempts: { lt: MAX_VOTE_CODE_ATTEMPTS },
    },
    orderBy: { id: "desc" },
  });
  if (live) {
    return {
      ok: true,
      challengeId: live.id,
      expiresAt: live.expiresAt,
      created: false,
      sendCount: live.sendCount,
    };
  }

  const recent = await prisma.voteConfirmCode.count({
    where: {
      userId,
      electionId: election.id,
      createdAt: { gte: new Date(now - VOTE_CODE_ISSUE_WINDOW_MS) },
    },
  });
  if (recent >= MAX_VOTE_CODE_ISSUES_PER_WINDOW) {
    return { ok: false, reason: "rate_limited" };
  }

  // Only the newest code may be used: supersede anything left unconsumed.
  await prisma.voteConfirmCode.updateMany({
    where: { userId, electionId: election.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtpCode();
  const expiresAt = new Date(now + OTP_TTL_MS);
  const row = await prisma.voteConfirmCode.create({
    data: { userId, electionId: election.id, codeHash: hashOtpCode(code), expiresAt },
  });
  await sendVoteCode(userId, election, row.id, code, row.sendCount);
  return {
    ok: true,
    challengeId: row.id,
    expiresAt: row.expiresAt,
    created: true,
    sendCount: row.sendCount,
  };
}

export type VoteCodeResendFailure =
  | "unknown_challenge"
  | "already_used"
  | "expired"
  | "max_sends"
  | "cooldown"
  | "wrong_owner";

export type VoteCodeResendResult =
  | { ok: true; challengeId: number; expiresAt: Date; sendCount: number }
  | { ok: false; reason: VoteCodeResendFailure };

/** Rotates the code on the SAME challenge (fresh expiry, attempts reset). */
export async function resendVoteCode(
  challengeId: number,
  userId: number,
  election: Election,
): Promise<VoteCodeResendResult> {
  const challenge = await prisma.voteConfirmCode.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.userId !== userId || challenge.electionId !== election.id) {
    return { ok: false, reason: "unknown_challenge" };
  }
  if (challenge.consumedAt) return { ok: false, reason: "already_used" };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (challenge.sendCount >= MAX_VOTE_CODE_SENDS) return { ok: false, reason: "max_sends" };
  if (Date.now() - challenge.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  const code = generateOtpCode();
  const sendCount = challenge.sendCount + 1;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.voteConfirmCode.update({
    where: { id: challenge.id },
    data: {
      codeHash: hashOtpCode(code),
      expiresAt,
      attempts: 0,
      sendCount,
      lastSentAt: new Date(),
    },
  });
  await sendVoteCode(userId, election, challenge.id, code, sendCount);
  return { ok: true, challengeId: challenge.id, expiresAt, sendCount };
}

export type VoteCodeVerifyFailure =
  | "unknown_challenge"
  | "already_used"
  | "expired"
  | "locked"
  | "wrong_code";

export type VoteCodeVerifyResult =
  | { ok: true; challengeId: number }
  | { ok: false; reason: VoteCodeVerifyFailure; attemptsRemaining: number };

/**
 * Checks the code and consumes the challenge — scoped to the exact
 * (voter, election) pair so a login code or another election's code can
 * never confirm this ballot. Consumption is an atomic update guarded on
 * `consumedAt: null`, so two concurrent submissions cannot both pass.
 */
export async function consumeVoteCode(
  challengeId: number,
  code: string,
  userId: number,
  electionId: number,
): Promise<VoteCodeVerifyResult> {
  const challenge = await prisma.voteConfirmCode.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.userId !== userId || challenge.electionId !== electionId) {
    return { ok: false, reason: "unknown_challenge", attemptsRemaining: 0 };
  }
  if (challenge.consumedAt) return { ok: false, reason: "already_used", attemptsRemaining: 0 };
  if (challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired", attemptsRemaining: 0 };
  }
  if (challenge.attempts >= MAX_VOTE_CODE_ATTEMPTS) {
    return { ok: false, reason: "locked", attemptsRemaining: 0 };
  }

  if (!verifyOtpCode(code, challenge.codeHash)) {
    const updated = await prisma.voteConfirmCode.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      reason: "wrong_code",
      attemptsRemaining: Math.max(0, MAX_VOTE_CODE_ATTEMPTS - updated.attempts),
    };
  }

  const consumed = await prisma.voteConfirmCode.updateMany({
    where: { id: challengeId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    return { ok: false, reason: "already_used", attemptsRemaining: 0 };
  }
  return { ok: true, challengeId: challenge.id };
}
