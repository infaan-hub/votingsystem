import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock web-push before any module under test imports it. vi.hoisted runs
// before vi.mock's factory is evaluated, so the shared spy is safe to close over.
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

import {
  GET as testGET,
  POST as testPOST,
} from "@/src/app/api/admin/notifications/test/route";

// Valid-format dummy VAPID material (never used: web-push is mocked).
const DUMMY_PUBLIC_KEY =
  "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ";
const DUMMY_PRIVATE_KEY = "c3R1Yl9wcml2YXRlX2tleV9mb3JfdGVzdGluZ19vbmx5XzEyMzQ1Njc4OTA";

function stubVapidEnv() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = DUMMY_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = DUMMY_PRIVATE_KEY;
  process.env.VAPID_SUBJECT = "mailto:tests@example.invalid";
}

let seq = 0;

async function makeUser(
  name: string,
  role: "voter" | "officer" | "admin",
  options: { isActive?: boolean; withToken?: boolean } = {},
) {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      username: `${name}_${seq}`,
      password: hashPassword("Pass1234!"),
      role,
      isActive: options.isActive ?? true,
    },
  });
  const token = options.withToken === false ? "" : await createTokenFor(user.id);
  return { user, token };
}

async function makeSubscription(
  userId: number,
  options: { disabled?: boolean } = {},
) {
  seq += 1;
  return prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.invalid/endpoint-${seq}`,
      p256dh: `p256dh-key-${seq}`,
      auth: `auth-key-${seq}`,
      disabledAt: options.disabled ? new Date() : null,
    },
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

type DeliveryCounts = Record<string, number>;

function deliveryOf(payload: Record<string, unknown>): DeliveryCounts {
  return payload.delivery as DeliveryCounts;
}

describe("AdminPushTestEndpoint", () => {
  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    stubVapidEnv();
  });

  /* ------------------------------------------------------------------ *
   * Authorization
   * ------------------------------------------------------------------ */

  it("rejects unauthenticated requests on both methods", async () => {
    const postResponse = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST" }),
    );
    expect(postResponse.status).toBe(401);

    const getResponse = await call(testGET, jsonRequest("/api/admin/notifications/test"));
    expect(getResponse.status).toBe(401);
  });

  it("rejects authenticated non-admin users with the standard error", async () => {
    const voter = await makeUser("voter", "voter");
    const officer = await makeUser("officer", "officer");

    for (const token of [voter.token, officer.token]) {
      const postResponse = await call(
        testPOST,
        jsonRequest("/api/admin/notifications/test", { method: "POST", token }),
      );
      expect(postResponse.status).toBe(403);
      const body = await readJson(postResponse);
      expect(typeof body.detail).toBe("string");

      const getResponse = await call(
        testGET,
        jsonRequest("/api/admin/notifications/test", { token }),
      );
      expect(getResponse.status).toBe(403);
    }

    // Nothing was created for anyone.
    expect(await prisma.notification.count()).toBe(0);
  });

  it("rejects inactive administrators", async () => {
    const admin = await makeUser("inactiveadmin", "admin", { isActive: false });
    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(response.status).toBe(401);
    expect(await prisma.notification.count()).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * Recipient selection (authoritative server-side audience)
   * ------------------------------------------------------------------ */

  it("targets only active accounts with a non-disabled subscription", async () => {
    const admin = await makeUser("admin", "admin");
    const subscribed = await makeUser("subscribed", "voter");
    const noSubscription = await makeUser("nosub", "voter");
    const inactiveWithSub = await makeUser("inactive", "voter", { isActive: false });
    const disabledSub = await makeUser("disabledsub", "voter");

    await makeSubscription(admin.user.id);
    await makeSubscription(subscribed.user.id);
    await makeSubscription(inactiveWithSub.user.id);
    await makeSubscription(disabledSub.user.id, { disabled: true });

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);

    const audience = body.audience as { eligible_subscriptions: number; subscribed_users: number };
    expect(audience.eligible_subscriptions).toBe(2);
    expect(audience.subscribed_users).toBe(2);
    expect(body.targeted).toBe(2);
    expect(body.duplicates).toBe(0);
    expect(body.deferred).toBe(false);

    const notifications = await prisma.notification.findMany({
      where: { tag: "nexvote-admin-push-test" },
    });
    expect(notifications).toHaveLength(2);
    const recipients = notifications.map((row) => row.recipientId).sort((a, b) => a - b);
    expect(recipients).toEqual([admin.user.id, subscribed.user.id].sort((a, b) => a - b));
    // The account without a subscription and the inactive account got nothing;
    // a disabled subscription is an opt-out and was honored.
    expect(recipients).not.toContain(noSubscription.user.id);
    expect(recipients).not.toContain(inactiveWithSub.user.id);
    expect(recipients).not.toContain(disabledSub.user.id);

    // One outbox row per eligible subscription, inline attempts all accepted.
    const deliveries = await prisma.pushDelivery.findMany();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((row) => row.status === "accepted")).toBe(true);
    expect(deliveryOf(body).accepted).toBe(2);
    expect(body.state).toBe("complete");
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("never accepts a recipient list from the client body", async () => {
    const admin = await makeUser("admin", "admin");
    const bystander = await makeUser("bystander", "voter");
    const subscribed = await makeUser("subscribed", "voter");
    await makeSubscription(subscribed.user.id);

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", {
        method: "POST",
        token: admin.token,
        body: {
          recipient_ids: [bystander.user.id],
          recipientIds: [bystander.user.id],
          recipients: [bystander.user.id],
        },
      }),
    );
    expect(response.status).toBe(201);
    const notifications = await prisma.notification.findMany({
      where: { tag: "nexvote-admin-push-test" },
    });
    expect(notifications.map((row) => row.recipientId)).toEqual([subscribed.user.id]);
  });

  /* ------------------------------------------------------------------ *
   * Run identity, idempotency and cooldown
   * ------------------------------------------------------------------ */

  it("uses a unique run id and idempotency key per test run", async () => {
    const admin = await makeUser("admin", "admin");
    const voter = await makeUser("voter", "voter");
    await makeSubscription(voter.user.id);

    const first = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(first.status).toBe(201);
    const firstBody = await readJson(first);

    // Clear the audit-backed cooldown so a second run can start immediately.
    await prisma.auditLog.deleteMany();

    const second = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(second.status).toBe(201);
    const secondBody = await readJson(second);

    expect(firstBody.run_id).not.toBe(secondBody.run_id);
    // A single permanent key would suppress every later test — it must not.
    expect(firstBody.targeted).toBe(1);
    expect(secondBody.targeted).toBe(1);
    expect(secondBody.duplicates).toBe(0);

    const keys = await prisma.notification.findMany({
      where: { tag: "nexvote-admin-push-test" },
      select: { idempotencyKey: true },
    });
    expect(keys).toHaveLength(2);
    const distinct = new Set(keys.map((row) => row.idempotencyKey));
    expect(distinct.size).toBe(2);
    const runIds = [firstBody.run_id, secondBody.run_id] as string[];
    for (const row of keys) {
      expect(runIds.some((run) => row.idempotencyKey?.startsWith(`admin-push-test-${run}`))).toBe(
        true,
      );
    }
  });

  it("enforces a per-admin cooldown without blocking a different admin", async () => {
    const adminA = await makeUser("admina", "admin");
    const adminB = await makeUser("adminb", "admin");

    const first = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: adminA.token }),
    );
    expect(first.status).toBe(201);

    const blocked = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: adminA.token }),
    );
    expect(blocked.status).toBe(429);
    const blockedBody = await readJson(blocked);
    expect(typeof blockedBody.retry_after_seconds).toBe("number");
    expect(Number(blockedBody.retry_after_seconds)).toBeGreaterThan(0);

    const other = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: adminB.token }),
    );
    expect(other.status).toBe(201);

    // Readiness reports the remaining cooldown for the first admin.
    const readiness = await call(
      testGET,
      jsonRequest("/api/admin/notifications/test", { token: adminA.token }),
    );
    expect(readiness.status).toBe(200);
    const readinessBody = await readJson(readiness);
    const cooldown = readinessBody.cooldown as { seconds_remaining: number };
    expect(cooldown.seconds_remaining).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------------ *
   * Readiness
   * ------------------------------------------------------------------ */

  it("reports readiness counts without leaking any secrets", async () => {
    const admin = await makeUser("admin", "admin");
    const subscribed = await makeUser("subscribed", "voter");
    const plain = await makeUser("plain", "voter");
    const sub = await makeSubscription(subscribed.user.id);

    const response = await call(
      testGET,
      jsonRequest("/api/admin/notifications/test", { token: admin.token }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);

    const audience = body.audience as {
      eligible_subscriptions: number;
      subscribed_users: number;
      active_users: number;
    };
    expect(audience.eligible_subscriptions).toBe(1);
    expect(audience.subscribed_users).toBe(1);
    expect(audience.active_users).toBeGreaterThanOrEqual(3);
    expect(body.vapid_configured).toBe(true);
    expect(typeof body.audience_policy).toBe("string");
    expect(typeof body.note).toBe("string");

    // No subscription endpoints, keys, or VAPID material in the response.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(sub.endpoint);
    expect(raw).not.toContain(sub.p256dh);
    expect(raw).not.toContain(sub.auth);
    expect(raw).not.toContain(DUMMY_PRIVATE_KEY);
    expect(raw).not.toContain("auth-key");
    expect(raw).not.toContain("p256dh-key");
    expect(raw).not.toContain(plain.user.username);
  });

  it("reports Web Push as unconfigured when VAPID variables are absent", async () => {
    const admin = await makeUser("admin", "admin");
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    const response = await call(
      testGET,
      jsonRequest("/api/admin/notifications/test", { token: admin.token }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.vapid_configured).toBe(false);
  });

  /* ------------------------------------------------------------------ *
   * Large audiences: queued, not held open
   * ------------------------------------------------------------------ */

  it("queues (does not inline) a large audience and reports it truthfully", async () => {
    const admin = await makeUser("admin", "admin");
    const users = [];
    // 26 members — one above the inline threshold of 25 — none of which log
    // in, so no auth tokens are needed for them.
    for (let index = 0; index < 26; index += 1) {
      const member = await makeUser(`member${index}`, "voter", { withToken: false });
      await makeSubscription(member.user.id);
      users.push(member);
    }

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);

    expect(body.deferred).toBe(true);
    expect(body.targeted).toBe(26);
    expect(body.deliveries_queued).toBe(26);
    const audience = body.audience as { eligible_subscriptions: number };
    // The admin has no subscription of their own in this scenario.
    expect(audience.eligible_subscriptions).toBe(26);
    expect(typeof body.status_url).toBe("string");
    expect(String(body.status_url)).toContain(String(body.run_id));

    // The durable outbox holds every job (delivery continues after response).
    expect(await prisma.pushDelivery.count()).toBe(26);
    expect(await prisma.notification.count({ where: { tag: "nexvote-admin-push-test" } })).toBe(26);
    // The response reported delivery as deferred rather than done: no run was
    // marked complete inside the request.
    expect(body.state).toBe("in-progress");
  });

  /* ------------------------------------------------------------------ *
   * Run status reporting
   * ------------------------------------------------------------------ */

  it("reports the run status with provider-accepted counts for a small run", async () => {
    const admin = await makeUser("admin", "admin");
    const voter = await makeUser("voter", "voter");
    await makeSubscription(voter.user.id);

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    const body = await readJson(response);
    const runId = String(body.run_id);

    const status = await call(
      testGET,
      jsonRequest(`/api/admin/notifications/test?run=${runId}`, { token: admin.token }),
    );
    expect(status.status).toBe(200);
    const statusBody = await readJson(status);
    expect(statusBody.run_id).toBe(runId);
    expect(statusBody.targeted).toBe(1);
    expect(statusBody.state).toBe("complete");
    expect(deliveryOf(statusBody).accepted).toBe(1);
    expect(typeof statusBody.note).toBe("string");

    // Polling the same run again is read-only and stable.
    const again = await call(
      testGET,
      jsonRequest(`/api/admin/notifications/test?run=${runId}`, { token: admin.token }),
    );
    const againBody = await readJson(again);
    expect(againBody.targeted).toBe(statusBody.targeted);
    expect(deliveryOf(againBody)).toEqual(deliveryOf(statusBody));
  });

  it("returns 404 for unknown or malformed run ids", async () => {
    const admin = await makeUser("admin", "admin");

    const unknown = await call(
      testGET,
      jsonRequest("/api/admin/notifications/test?run=11111111-2222-3333-4444-555555555555", {
        token: admin.token,
      }),
    );
    expect(unknown.status).toBe(404);

    const malformed = await call(
      testGET,
      jsonRequest("/api/admin/notifications/test?run=%20%20", { token: admin.token }),
    );
    expect(malformed.status).toBe(404);
  });

  /* ------------------------------------------------------------------ *
   * Delivery truthfulness under provider responses
   * ------------------------------------------------------------------ */

  it("never claims acceptance when the provider only queued the message", async () => {
    const admin = await makeUser("admin", "admin");
    const voter = await makeUser("voter", "voter");
    await makeSubscription(voter.user.id);
    // web-push signals HTTP failures by throwing; 5xx is retryable.
    sendNotification.mockRejectedValue({ statusCode: 500, body: "Internal Server Error" });

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);

    expect(deliveryOf(body).accepted).toBe(0);
    expect(deliveryOf(body).pending + deliveryOf(body).queued).toBe(1);
    expect(body.state).toBe("in-progress");

    const delivery = await prisma.pushDelivery.findFirst();
    expect(delivery?.status).toBe("queued");
    expect(delivery?.attemptCount).toBeGreaterThanOrEqual(1);
  });

  it("handles expired subscriptions: reports them and removes the device", async () => {
    const admin = await makeUser("admin", "admin");
    const voter = await makeUser("voter", "voter");
    const sub = await makeSubscription(voter.user.id);
    // web-push throws for 410 Gone; the pipeline treats it as expired.
    sendNotification.mockRejectedValue({ statusCode: 410, body: "Gone" });

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);

    expect(deliveryOf(body).expired).toBe(1);
    expect(deliveryOf(body).accepted).toBe(0);

    // The dead subscription is gone; the audit row (SET NULL) survives.
    expect(await prisma.pushSubscription.findUnique({ where: { id: sub.id } })).toBeNull();
    const delivery = await prisma.pushDelivery.findFirst();
    expect(delivery?.status).toBe("expired");
    expect(delivery?.subscriptionId).toBeNull();

    // The user's own in-app record remains (bell still shows the run).
    expect(
      await prisma.notification.count({ where: { tag: "nexvote-admin-push-test" } }),
    ).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * Audit trail
   * ------------------------------------------------------------------ */

  it("writes a privacy-safe audit entry for every test run", async () => {
    const admin = await makeUser("admin", "admin");
    const voter = await makeUser("voter", "voter");
    const sub = await makeSubscription(voter.user.id);

    const response = await call(
      testPOST,
      jsonRequest("/api/admin/notifications/test", { method: "POST", token: admin.token }),
    );
    const body = await readJson(response);

    const entries = await prisma.auditLog.findMany({
      where: { action: "admin.notifications.test" },
    });
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.actorId).toBe(admin.user.id);
    expect(entry.entityId).toBe(String(body.run_id));
    expect(entry.summary).toContain(String(body.run_id));
    expect(entry.summary).toMatch(/audience 1 device/);

    const detail = String(entry.detail);
    expect(detail).toContain(String(body.run_id));
    expect(detail).not.toContain(sub.endpoint);
    expect(detail).not.toContain(sub.p256dh);
    expect(detail).not.toContain(sub.auth);
    expect(detail).not.toContain(voter.user.username);
  });
});
