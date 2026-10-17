import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock web-push before any module under test imports it, so no real network
// calls are made when notify() attempts inline delivery.
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { POST as codePOST } from "@/src/app/api/elections/[pk]/vote/code/route";
import { POST as resendPOST } from "@/src/app/api/elections/[pk]/vote/code/resend/route";
import { POST as votePOST } from "@/src/app/api/elections/[pk]/vote/route";
import { MAX_VOTE_CODE_ISSUES_PER_WINDOW } from "@/src/lib/vote-confirm";

// Valid-format dummy VAPID material (never used: web-push is mocked).
const DUMMY_PUBLIC_KEY =
  "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ8";
const DUMMY_PRIVATE_KEY = "c3R1Yl9wcml2YXRlX2tleV9mb3JfdGVzdGluZ19vbmx5XzEyMzQ1Njc4OTA";

const ORIGINAL_ENV = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT,
};

function stubVapidEnv() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = DUMMY_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = DUMMY_PRIVATE_KEY;
  process.env.VAPID_SUBJECT = "mailto:tests@example.invalid";
}

function restoreEnv() {
  if (ORIGINAL_ENV.publicKey === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_ENV.publicKey;
  if (ORIGINAL_ENV.privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = ORIGINAL_ENV.privateKey;
  if (ORIGINAL_ENV.subject === undefined) delete process.env.VAPID_SUBJECT;
  else process.env.VAPID_SUBJECT = ORIGINAL_ENV.subject;
}

const HOUR = 60 * 60 * 1000;
let seq = 0;

async function makeElection(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: `Council Election ${seq}`,
      slug: `council-election-${seq}`,
      description: "Vote for your representatives.",
      status: "OPEN",
      isPublished: true,
      campaignStartAt: new Date(now - 2 * HOUR),
      campaignEndAt: new Date(now + HOUR),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + 2 * HOUR),
      ...overrides,
    },
  });

  const position1 = await prisma.position.create({
    data: { electionId: election.id, name: "President", voterGroup: "student" },
  });
  const position2 = await prisma.position.create({
    data: { electionId: election.id, name: "Secretary", voterGroup: "student" },
  });
  const candidateUser = await prisma.user.create({
    data: {
      username: `cand_${seq}`,
      password: hashPassword("Pass1234!"),
      firstName: "Cand",
      lastName: `Date${seq}`,
      role: "voter",
    },
  });
  const candidate1 = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position1.id,
      slogan: "Forward",
      approved: true,
    },
  });
  const candidate2 = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position2.id,
      slogan: "Organised",
      approved: true,
    },
  });
  return { election, position1, position2, candidate1, candidate2 };
}

async function makeVoter(options: { withSubscription?: boolean } = {}) {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      username: `vote_voter_${seq}`,
      password: hashPassword("Pass1234!"),
      firstName: "Vee",
      lastName: `Voter${seq}`,
      email: `voter${seq}@example.com`,
      role: "voter",
    },
  });
  if (options.withSubscription) {
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example.com/votesub-${seq}-${Date.now()}`,
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
        userAgent: "vitest-agent",
      },
    });
  }
  const token = await createTokenFor(user.id);
  return { user, token };
}

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `vote-code-ip-${ipSeq}`;
}

function codeRequest(electionId: number, token: string) {
  return jsonRequest(`/api/elections/${electionId}/vote/code/`, {
    method: "POST",
    token,
    body: {},
    headers: { "x-forwarded-for": nextIp() },
  });
}

function resendRequest(electionId: number, challengeId: number, token: string) {
  return jsonRequest(`/api/elections/${electionId}/vote/code/resend/`, {
    method: "POST",
    token,
    body: { challenge_id: challengeId },
    headers: { "x-forwarded-for": nextIp() },
  });
}

function voteRequest(
  electionId: number,
  token: string,
  body: Record<string, unknown>,
) {
  return jsonRequest(`/api/elections/${electionId}/vote/`, {
    method: "POST",
    token,
    body,
    headers: { "x-forwarded-for": nextIp() },
  });
}

function selectionsFor(positionId: number, candidateId: number) {
  return [{ position_id: positionId, candidate_ids: [candidateId] }];
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

/** Reads the most recent vote code the server delivered to this user. */
async function lastVoteCode(userId: number): Promise<string> {
  const notification = await prisma.notification.findFirst({
    where: { recipientId: userId, title: "Your vote code" },
    orderBy: { id: "desc" },
  });
  if (!notification) throw new Error("No vote-code notification was created.");
  const match = notification.body.match(/\bis (\d{6})\b/);
  if (!match) throw new Error(`No code in notification body: ${notification.body}`);
  return match[1];
}

/** Makes resend's durable cooldown pass without waiting. */
async function ageLastSent(challengeId: number) {
  await prisma.voteConfirmCode.update({
    where: { id: challengeId },
    data: { lastSentAt: new Date(Date.now() - 61_000) },
  });
}

beforeEach(async () => {
  await resetDb();
  stubVapidEnv();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  restoreEnv();
});

describe("POST /api/elections/[pk]/vote/code", () => {
  it("issues an election-scoped code and delivers it through notifications", async () => {
    const { election } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });

    const response = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(response.status).toBe(200);
    const body = await readJson(response);

    expect(body.requires_code).toBe(true);
    expect(body.code_length).toBe(6);
    expect(typeof body.challenge_id).toBe("number");
    expect(body.created).toBe(true);

    const notification = await prisma.notification.findFirst({
      where: { recipientId: user.id, title: "Your vote code" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.body).toMatch(/\bis \d{6}\b/);
    expect(notification!.category).toBe("vote");
    expect(notification!.targetUrl).toBe(`/vote/${election.slug}`);

    const row = await prisma.voteConfirmCode.findUnique({
      where: { id: body.challenge_id as number },
    });
    expect(row).not.toBeNull();
    expect(row!.electionId).toBe(election.id);
    expect(row!.userId).toBe(user.id);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.codeHash).not.toContain(await lastVoteCode(user.id));
    expect(row!.consumedAt).toBeNull();
  });

  it("reuses a live challenge instead of sending a duplicate notification", async () => {
    const { election } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });

    const first = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const second = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );

    expect(second.challenge_id).toBe(first.challenge_id);
    expect(second.created).toBe(false);
    const notifications = await prisma.notification.count({
      where: { title: "Your vote code" },
    });
    expect(notifications).toBe(1);
  });

  it("does not require a code when the voter has no subscribed device", async () => {
    const { election } = await makeElection();
    const { token } = await makeVoter();

    const response = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.requires_code).toBe(false);
    expect(body.reason).toBe("no_subscribed_device");

    const rows = await prisma.voteConfirmCode.count();
    expect(rows).toBe(0);
  });

  it("does not require a code when VAPID is unconfigured", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    const { election } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });

    const response = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.requires_code).toBe(false);
    expect(body.reason).toBe("push_not_configured");
  });

  it("refuses a voter who is not allowed in this election", async () => {
    const { election } = await makeElection({ eligibilityPolicy: "voter_list" });
    const { token } = await makeVoter({ withSubscription: true });

    const response = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(response.status).toBe(403);
    const body = await readJson(response);
    expect(body.detail).toContain("eligibility list");
  });

  it("refuses an election that is not open for voting", async () => {
    const { election } = await makeElection({ votingEndAt: new Date(Date.now() - 1000) });
    const { token } = await makeVoter({ withSubscription: true });

    const response = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toBe("Voting is not open for this election.");
  });

  it("rate-limits issuance per voter and election", async () => {
    const { election } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });

    for (let i = 0; i < MAX_VOTE_CODE_ISSUES_PER_WINDOW; i += 1) {
      const ok = await call(codePOST, codeRequest(election.id, token), {
        pk: String(election.id),
      });
      expect(ok.status).toBe(200);
      // Simulate consumption so each loop creates a fresh challenge row.
      await prisma.voteConfirmCode.updateMany({
        data: { consumedAt: new Date() },
      });
    }
    const limited = await call(codePOST, codeRequest(election.id, token), {
      pk: String(election.id),
    });
    expect(limited.status).toBe(503);
  });
});

describe("POST /api/elections/[pk]/vote (code verification)", () => {
  it("accepts the ballot with the correct code", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const code = await lastVoteCode(user.id);

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(typeof body.receipt_code).toBe("string");

    const row = await prisma.voteConfirmCode.findUnique({
      where: { id: issued.challenge_id as number },
    });
    expect(row!.consumedAt).not.toBeNull();
    const votes = await prisma.vote.count({ where: { electionId: election.id } });
    expect(votes).toBe(1);
  });

  it("rejects the ballot when the required code is missing", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toContain("verification code");
    expect(body.code_required).toBe(true);
    const votes = await prisma.vote.count();
    expect(votes).toBe(0);
  });

  it("rejects a wrong code and reports attempts remaining, then locks", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const code = await lastVoteCode(user.id);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const wrong = await call(
        votePOST,
        voteRequest(election.id, token, {
          selections: selectionsFor(position1.id, candidate1.id),
          confirm_code: { challenge_id: issued.challenge_id, code: "000000" },
        }),
        { pk: String(election.id) },
      );
      expect(wrong.status).toBe(400);
      const body = await readJson(wrong);
      expect(body.detail).toBe("That code is not correct.");
      if (attempt < 5) expect(body.attempts_remaining).toBe(5 - attempt);
    }

    // Even the correct code no longer works once the challenge is locked.
    const locked = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(locked.status).toBe(400);
    const lockedBody = await readJson(locked);
    expect(lockedBody.detail).toContain("Too many incorrect attempts");
    expect(lockedBody.needs_new_code).toBe(true);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("rejects an expired code", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const code = await lastVoteCode(user.id);
    await prisma.voteConfirmCode.update({
      where: { id: issued.challenge_id as number },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toContain("expired");
    expect(body.needs_new_code).toBe(true);
  });

  it("accepts each code only once — a second question needs a fresh code", async () => {
    const { election, position1, position2, candidate1, candidate2 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const code = await lastVoteCode(user.id);

    const first = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(first.status).toBe(201);

    // Same code on the second question: already consumed.
    const reuse = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position2.id, candidate2.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(reuse.status).toBe(400);
    expect((await readJson(reuse)).detail).toContain("already used");

    // A freshly issued code confirms the second question.
    const reissued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const freshCode = await lastVoteCode(user.id);
    expect(freshCode).not.toBe(code);
    const second = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position2.id, candidate2.id),
        confirm_code: { challenge_id: reissued.challenge_id, code: freshCode },
      }),
      { pk: String(election.id) },
    );
    expect(second.status).toBe(201);
  });

  it("scopes the code to its own election", async () => {
    const first = await makeElection();
    const second = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(first.election.id, token), {
        pk: String(first.election.id),
      }),
    );
    const code = await lastVoteCode(user.id);

    const response = await call(
      votePOST,
      voteRequest(second.election.id, token, {
        selections: selectionsFor(second.position1.id, second.candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(second.election.id) },
    );
    expect(response.status).toBe(400);
    expect((await readJson(response)).detail).toContain("not valid");
    expect(await prisma.vote.count()).toBe(0);
  });

  it("never accepts a login OTP as a vote code", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const loginChallenge = await prisma.otpChallenge.create({
      data: {
        userId: user.id,
        codeHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: loginChallenge.id, code: "123456" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect((await readJson(response)).detail).toContain("not valid");
  });

  it("re-checks eligibility when the code is consumed", async () => {
    const { election } = await makeElection({ eligibilityPolicy: "voter_list" });
    const { user, token } = await makeVoter({ withSubscription: true });
    // The voter IS on the list when the code is issued…
    await prisma.electionVoter.create({
      data: { electionId: election.id, userId: user.id, uniqueKey: `u:${user.id}` },
    });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    expect(issued.requires_code).toBe(true);
    const code = await lastVoteCode(user.id);

    // …then removed before submission: the code no longer unlocks the ballot.
    await prisma.electionVoter.deleteMany({ where: { electionId: election.id } });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(
          (await prisma.position.findFirst({ where: { electionId: election.id } }))!.id,
          (await prisma.candidate.findFirst({ where: { electionId: election.id } }))!.id,
        ),
        confirm_code: { challenge_id: issued.challenge_id, code },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect((await readJson(response)).detail).toContain("eligibility list");
    expect(await prisma.vote.count()).toBe(0);
  });

  it("keeps the legacy path: a voter with no device confirms with their password", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { token } = await makeVoter();

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(201);
    expect(await prisma.vote.count()).toBe(1);
    expect(await prisma.voteConfirmCode.count()).toBe(0);
  });

  it("rejects a wrong password on the legacy path", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { token } = await makeVoter();

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        reauth: { password: "not-the-password" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(String(body.detail)).toContain("password");
    expect(body.password_required).toBe(true);
    expect(await prisma.vote.count()).toBe(0);
  });
});

describe("POST /api/elections/[pk]/vote/code/resend", () => {
  it("answers 429 with a retry hint while the cooldown is running", async () => {
    const { election } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );

    const response = await call(
      resendPOST,
      resendRequest(election.id, issued.challenge_id as number, token),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(429);
    const body = await readJson(response);
    expect(body.retry_after_seconds).toBe(60);
  });

  it("rotates the code after the cooldown — old code dies, new code works", async () => {
    const { election, position1, candidate1 } = await makeElection();
    const { user, token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    const oldCode = await lastVoteCode(user.id);

    await ageLastSent(issued.challenge_id as number);
    const resent = await readJson(
      await call(
        resendPOST,
        resendRequest(election.id, issued.challenge_id as number, token),
        { pk: String(election.id) },
      ),
    );
    expect(resent.send_count).toBe(2);

    const newCode = await lastVoteCode(user.id);
    expect(newCode).not.toBe(oldCode);

    const withOld = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code: oldCode },
      }),
      { pk: String(election.id) },
    );
    expect(withOld.status).toBe(400);

    const withNew = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: selectionsFor(position1.id, candidate1.id),
        confirm_code: { challenge_id: issued.challenge_id, code: newCode },
      }),
      { pk: String(election.id) },
    );
    expect(withNew.status).toBe(201);
  });

  it("caps codes per challenge and tells the client to request a new one", async () => {
    const { election } = await makeElection();
    const { token } = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, token), { pk: String(election.id) }),
    );
    await prisma.voteConfirmCode.update({
      where: { id: issued.challenge_id as number },
      data: { sendCount: 3, lastSentAt: new Date(Date.now() - 61_000) },
    });

    const response = await call(
      resendPOST,
      resendRequest(election.id, issued.challenge_id as number, token),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.needs_new_code).toBe(true);
  });

  it("refuses another voter's challenge", async () => {
    const { election } = await makeElection();
    const owner = await makeVoter({ withSubscription: true });
    const stranger = await makeVoter({ withSubscription: true });
    const issued = await readJson(
      await call(codePOST, codeRequest(election.id, owner.token), {
        pk: String(election.id),
      }),
    );

    const response = await call(
      resendPOST,
      resendRequest(election.id, issued.challenge_id as number, stranger.token),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect((await readJson(response)).detail).toContain("could not be found");
  });
});
