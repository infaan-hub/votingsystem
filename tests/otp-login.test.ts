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
import { call, jsonRequest, resetDb } from "./helpers";

import { POST as loginPOST } from "@/src/app/api/auth/login/route";
import { POST as verifyPOST } from "@/src/app/api/auth/otp/verify/route";
import { POST as resendPOST } from "@/src/app/api/auth/otp/resend/route";

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

function clearVapidEnv() {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

function restoreEnv() {
  if (ORIGINAL_ENV.publicKey === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_ENV.publicKey;
  if (ORIGINAL_ENV.privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = ORIGINAL_ENV.privateKey;
  if (ORIGINAL_ENV.subject === undefined) delete process.env.VAPID_SUBJECT;
  else process.env.VAPID_SUBJECT = ORIGINAL_ENV.subject;
}

let seq = 0;

async function makeUser(
  options: { withSubscription?: boolean; role?: "voter" | "officer" | "admin" } = {},
) {
  seq += 1;
  const role = options.role ?? "voter";
  const user = await prisma.user.create({
    data: {
      username: `otp_${role}_${seq}`,
      password: hashPassword("Pass1234!"),
      firstName: "Otp",
      lastName: "Voter",
      email: `otp${seq}@example.com`,
      role,
    },
  });
  if (options.withSubscription) {
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example.com/sub-${seq}-${Date.now()}`,
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
        userAgent: "vitest-agent",
      },
    });
  }
  return user;
}

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `otp-test-ip-${ipSeq}`;
}

function loginRequest(username: string) {
  return jsonRequest("/api/auth/login/", {
    method: "POST",
    body: { username, password: "Pass1234!" },
    headers: { "x-forwarded-for": nextIp() },
  });
}

function verifyRequest(challengeId: number, code: string) {
  return jsonRequest("/api/auth/otp/verify/", {
    method: "POST",
    body: { challenge_id: challengeId, code },
    headers: { "x-forwarded-for": nextIp() },
  });
}

function resendRequest(challengeId: number) {
  return jsonRequest("/api/auth/otp/resend/", {
    method: "POST",
    body: { challenge_id: challengeId },
    headers: { "x-forwarded-for": nextIp() },
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

/** Reads the most recent OTP code the server delivered to this user. */
async function lastOtpCode(userId: number): Promise<string> {
  const notification = await prisma.notification.findFirst({
    where: { recipientId: userId, title: "Your login code" },
    orderBy: { id: "desc" },
  });
  if (!notification) throw new Error("No OTP notification was created.");
  const match = notification.body.match(/code is (\d{6})/);
  if (!match) throw new Error(`No code in notification body: ${notification.body}`);
  return match[1];
}

/** Makes resend's durable cooldown pass without waiting. */
async function ageLastSent(challengeId: number) {
  await prisma.otpChallenge.update({
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

describe("POST /api/auth/login (OTP step-up)", () => {
  it("sends a hashed 6-digit code to the user's devices and returns no token", async () => {
    const user = await makeUser({ withSubscription: true });

    const response = await call(loginPOST, loginRequest(user.username));
    expect(response.status).toBe(200);
    const body = await readJson(response);

    expect(body.otp_required).toBe(true);
    expect(body.token).toBeUndefined();
    expect(typeof body.challenge_id).toBe("number");
    expect(typeof body.expires_at).toBe("string");

    // The in-app record carries the code; the DB row stores only a hash.
    const notification = await prisma.notification.findFirst({
      where: { recipientId: user.id, title: "Your login code" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.body).toMatch(/code is \d{6}/);
    expect(notification!.category).toBe("account");
    expect(notification!.targetUrl).toBe("/otp-verification");

    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: body.challenge_id as number },
    });
    expect(challenge).not.toBeNull();
    expect(challenge!.codeHash).not.toContain(await lastOtpCode(user.id));
    expect(challenge!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge!.consumedAt).toBeNull();
  });

  it("signs the user in after the correct code is verified", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    const code = await lastOtpCode(user.id);

    const response = await call(verifyPOST, verifyRequest(login.challenge_id as number, code));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(typeof body.token).toBe("string");
    expect((body.user as { username: string }).username).toBe(user.username);

    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: login.challenge_id as number },
    });
    expect(challenge!.consumedAt).not.toBeNull();
  });

  it("requires a login code for admin and officer accounts exactly like voters", async () => {
    for (const role of ["admin", "officer", "voter"] as const) {
      const user = await makeUser({ withSubscription: true, role });

      const response = await call(loginPOST, loginRequest(user.username));
      expect(response.status).toBe(200);
      const body = await readJson(response);
      expect(body.otp_required).toBe(true);
      expect(body.token).toBeUndefined();

      // The code is delivered to the account as a notification, whatever its
      // role, and points at the verification step.
      const notification = await prisma.notification.findFirst({
        where: { recipientId: user.id, title: "Your login code" },
        orderBy: { id: "desc" },
      });
      expect(notification).not.toBeNull();
      expect(notification!.targetUrl).toBe("/otp-verification");
    }
  });

  it("falls back to password-only sign-in when the user has no subscribed device", async () => {
    const user = await makeUser();

    const response = await call(loginPOST, loginRequest(user.username));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.otp_required).toBe(false);
    expect(typeof body.token).toBe("string");

    const challenges = await prisma.otpChallenge.count({ where: { userId: user.id } });
    expect(challenges).toBe(0);
  });

  it("binds the device carried by the sign-in and requires a code when the account has none", async () => {
    const user = await makeUser();
    const endpoint = `https://push.example.com/first-device-${Date.now()}`;

    const response = await call(
      loginPOST,
      jsonRequest("/api/auth/login/", {
        method: "POST",
        body: {
          username: user.username,
          password: "Pass1234!",
          push_subscription: {
            endpoint,
            keys: { p256dh: "first-device-p256dh", auth: "first-device-auth" },
            expirationTime: null,
          },
        },
        headers: { "x-forwarded-for": nextIp() },
      }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.otp_required).toBe(true);
    expect(body.token).toBeUndefined();

    // The browser became the account's first device, so the code is
    // delivered to the very device that is signing in.
    const subscription = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    expect(subscription).not.toBeNull();
    expect(subscription!.userId).toBe(user.id);
    const notification = await prisma.notification.findFirst({
      where: { recipientId: user.id, title: "Your login code" },
    });
    expect(notification).not.toBeNull();
  });

  it("ignores an invalid sign-in device subscription without failing the sign-in", async () => {
    const user = await makeUser();

    const response = await call(
      loginPOST,
      jsonRequest("/api/auth/login/", {
        method: "POST",
        body: {
          username: user.username,
          password: "Pass1234!",
          // Not an https endpoint: it must be ignored, never fail this login.
          push_subscription: {
            endpoint: "http://insecure.example.com/endpoint",
            keys: { p256dh: "ignored-p256dh", auth: "ignored-auth" },
          },
        },
        headers: { "x-forwarded-for": nextIp() },
      }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.otp_required).toBe(false);
    expect(typeof body.token).toBe("string");
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("falls back to password-only sign-in when VAPID is not configured", async () => {
    clearVapidEnv();
    const user = await makeUser({ withSubscription: true });

    const response = await call(loginPOST, loginRequest(user.username));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.otp_required).toBe(false);
    expect(typeof body.token).toBe("string");
  });

  it("still rejects a wrong password with 400", async () => {
    const user = await makeUser({ withSubscription: true });
    const response = await call(
      loginPOST,
      jsonRequest("/api/auth/login/", {
        method: "POST",
        body: { username: user.username, password: "wrong" },
        headers: { "x-forwarded-for": nextIp() },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toBe("Invalid username or password.");
  });

  it("rate-limits OTP issuance per user", async () => {
    const user = await makeUser({ withSubscription: true });
    for (let i = 0; i < 5; i += 1) {
      const ok = await call(loginPOST, loginRequest(user.username));
      expect(ok.status).toBe(200);
    }
    const limited = await call(loginPOST, loginRequest(user.username));
    expect(limited.status).toBe(503);
  });

  it("supersedes an older challenge when a new login issues another code", async () => {
    const user = await makeUser({ withSubscription: true });
    const first = await readJson(await call(loginPOST, loginRequest(user.username)));
    const firstCode = await lastOtpCode(user.id);

    const second = await readJson(await call(loginPOST, loginRequest(user.username)));

    const verifyOld = await call(
      verifyPOST,
      verifyRequest(first.challenge_id as number, firstCode),
    );
    expect(verifyOld.status).toBe(400);

    const secondCode = await (
      await prisma.notification.findFirst({
        where: { recipientId: user.id, title: "Your login code" },
        orderBy: { id: "desc" },
      })
    )!.body.match(/code is (\d{6})/)!;
    const verifyNew = await call(
      verifyPOST,
      verifyRequest(second.challenge_id as number, secondCode[1]),
    );
    expect(verifyNew.status).toBe(200);
  });
});

describe("POST /api/auth/otp/verify", () => {
  it("rejects a wrong code and reports the attempts remaining", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));

    const response = await call(verifyPOST, verifyRequest(login.challenge_id as number, "000000"));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toBe("That code is not correct.");
    expect(body.attempts_remaining).toBe(4);
  });

  it("locks the challenge after 5 wrong attempts", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    const code = await lastOtpCode(user.id);

    for (let i = 0; i < 5; i += 1) {
      const wrong = await call(verifyPOST, verifyRequest(login.challenge_id as number, "000000"));
      expect(wrong.status).toBe(400);
    }

    // Even the correct code no longer works once locked.
    const locked = await call(verifyPOST, verifyRequest(login.challenge_id as number, code));
    expect(locked.status).toBe(400);
    const body = await readJson(locked);
    expect(body.detail).toBe("Too many incorrect attempts. Please sign in again.");
  });

  it("rejects an expired challenge", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    const code = await lastOtpCode(user.id);
    await prisma.otpChallenge.update({
      where: { id: login.challenge_id as number },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await call(verifyPOST, verifyRequest(login.challenge_id as number, code));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toBe("This code has expired. Please sign in again.");
  });

  it("rejects reuse of an already-consumed code", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    const code = await lastOtpCode(user.id);

    const first = await call(verifyPOST, verifyRequest(login.challenge_id as number, code));
    expect(first.status).toBe(200);

    const second = await call(verifyPOST, verifyRequest(login.challenge_id as number, code));
    expect(second.status).toBe(400);
    const body = await readJson(second);
    expect(body.detail).toBe("This code was already used. Please sign in again.");
  });

  it("rejects a malformed code and an unknown challenge", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));

    const short = await call(verifyPOST, verifyRequest(login.challenge_id as number, "12345"));
    expect(short.status).toBe(400);

    const unknown = await call(verifyPOST, verifyRequest(999999, "123456"));
    expect(unknown.status).toBe(400);
    const body = await readJson(unknown);
    expect(body.detail).toContain("could not be found");
  });
});

describe("POST /api/auth/otp/resend", () => {
  it("issues a new code on the same challenge and invalidates the old one", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    const oldCode = await lastOtpCode(user.id);

    await ageLastSent(login.challenge_id as number);
    const response = await call(resendPOST, resendRequest(login.challenge_id as number));
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.send_count).toBe(2);

    // Two notifications exist; the newest body holds the valid code.
    const notifications = await prisma.notification.count({
      where: { recipientId: user.id, title: "Your login code" },
    });
    expect(notifications).toBe(2);

    const verifyOld = await call(verifyPOST, verifyRequest(login.challenge_id as number, oldCode));
    expect(verifyOld.status).toBe(400);

    const newest = await prisma.notification.findFirst({
      where: { recipientId: user.id, title: "Your login code" },
      orderBy: { id: "desc" },
    });
    const newCode = newest!.body.match(/code is (\d{6})/)![1];
    const verifyNew = await call(verifyPOST, verifyRequest(login.challenge_id as number, newCode));
    expect(verifyNew.status).toBe(200);
  });

  it("answers 429 with a retry hint while the cooldown is running", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));

    const response = await call(resendPOST, resendRequest(login.challenge_id as number));
    expect(response.status).toBe(429);
    const body = await readJson(response);
    expect(body.retry_after_seconds).toBe(60);
  });

  it("caps the number of codes per challenge", async () => {
    const user = await makeUser({ withSubscription: true });
    const login = await readJson(await call(loginPOST, loginRequest(user.username)));
    await prisma.otpChallenge.update({
      where: { id: login.challenge_id as number },
      data: { sendCount: 3, lastSentAt: new Date(Date.now() - 61_000) },
    });

    const response = await call(resendPOST, resendRequest(login.challenge_id as number));
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.detail).toContain("Maximum resends");
  });
});
