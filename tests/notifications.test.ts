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
  POST as subscribePOST,
  GET as subscribeGET,
  DELETE as subscribeDELETE,
} from "@/src/app/api/notifications/subscribe/route";
import {
  POST as notificationsPOST,
  GET as notificationsGET,
} from "@/src/app/api/notifications/route";
import { GET as unreadCountGET } from "@/src/app/api/notifications/unread-count/route";
import { PATCH as readPATCH } from "@/src/app/api/notifications/[id]/read/route";
import { POST as readAllPOST } from "@/src/app/api/notifications/read-all/route";
import { DELETE as notificationDELETE } from "@/src/app/api/notifications/[id]/route";
import { GET as deliveriesGET } from "@/src/app/api/admin/notifications/deliveries/route";

// Valid-format dummy VAPID material (never used: web-push is mocked).
const DUMMY_PUBLIC_KEY =
  "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ";
const DUMMY_PRIVATE_KEY = "c3R1Yl9wcml2YXRlX2tleV9mb3JfdGVzdGluZ19vbmx5XzEyMzQ1Njc4OTA";

function stubVapidEnv() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = DUMMY_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = DUMMY_PRIVATE_KEY;
  process.env.VAPID_SUBJECT = "mailto:tests@example.invalid";
}

const SAMPLE_SUBSCRIPTION = {
  endpoint: "https://push.example.invalid/subscriptions/abc-123",
  keys: {
    p256dh: "BTESTp256dhKeyValuePlaceholderValuePlaceholderValue",
    auth: "BTESTauthKeyValuePlaceholder",
  },
};

async function makeUser(username: string, role: "voter" | "officer" | "admin") {
  const user = await prisma.user.create({
    data: { username, password: hashPassword("Pass1234!"), role },
  });
  return { user, token: await createTokenFor(user.id) };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("NotificationApiTests", () => {
  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    stubVapidEnv();
  });

  /* ------------------------------------------------------------------ *
   * Authentication                                                       *
   * ------------------------------------------------------------------ */

  it("requires a token to subscribe, list, or create notifications", async () => {
    const subscribe = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", { method: "POST", body: SAMPLE_SUBSCRIPTION }),
    );
    expect(subscribe.status).toBe(401);

    const list = await call(notificationsGET, jsonRequest("/api/notifications/"));
    expect(list.status).toBe(401);

    const create = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", { method: "POST", body: { title: "Hi" } }),
    );
    expect(create.status).toBe(401);
  });

  /* ------------------------------------------------------------------ *
   * Subscription management                                              *
   * ------------------------------------------------------------------ */

  it("upserts a subscription for the signed-in user and hides secrets on GET", async () => {
    const { user, token } = await makeUser("sub_user", "voter");
    const response = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token,
        body: SAMPLE_SUBSCRIPTION,
      }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.user_agent).toBeDefined();
    expect(body.is_disabled).toBe(false);
    // The client matches its own browser subscription by fingerprint — never
    // by exposing the endpoint or its keys in responses.
    expect(typeof body.endpoint_hash).toBe("string");
    expect(body.endpoint_hash).toMatch(/^[0-9a-f]{32}$/);
    // Never expose endpoint keys in list responses.
    expect(JSON.stringify(body)).not.toContain(SAMPLE_SUBSCRIPTION.keys.p256dh);
    expect(JSON.stringify(body)).not.toContain(SAMPLE_SUBSCRIPTION.keys.auth);

    const stored = await prisma.pushSubscription.findUnique({
      where: { endpoint: SAMPLE_SUBSCRIPTION.endpoint },
    });
    expect(stored?.userId).toBe(user.id);

    // The device list exposes the same fingerprint and still no secrets.
    const list = await call(subscribeGET, jsonRequest("/api/notifications/subscribe", { token }));
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint_hash).toBe(body.endpoint_hash);
    expect(JSON.stringify(rows)).not.toContain(SAMPLE_SUBSCRIPTION.endpoint);

    // Re-subscribe refreshes (200, single row).
    const again = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token,
        body: { ...SAMPLE_SUBSCRIPTION, keys: { p256dh: "new-p256dh", auth: "new-auth" } },
      }),
    );
    expect(again.status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(1);
    const refreshed = await prisma.pushSubscription.findUnique({
      where: { endpoint: SAMPLE_SUBSCRIPTION.endpoint },
    });
    expect(refreshed?.p256dh).toBe("new-p256dh");
  });

  it("rejects malformed subscriptions", async () => {
    const { token } = await makeUser("bad_sub", "voter");
    const missingKeys = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token,
        body: { endpoint: SAMPLE_SUBSCRIPTION.endpoint },
      }),
    );
    expect(missingKeys.status).toBe(400);

    const insecureEndpoint = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token,
        body: {
          endpoint: "http://insecure.example.invalid/x",
          keys: SAMPLE_SUBSCRIPTION.keys,
        },
      }),
    );
    expect(insecureEndpoint.status).toBe(400);
    const body = await readJson(insecureEndpoint);
    expect(body.endpoint).toBeDefined();
  });

  it("moves a browser subscription to the account that re-registers it", async () => {
    const { user: owner, token: ownerToken } = await makeUser("sub_owner", "voter");
    const first = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token: ownerToken,
        body: SAMPLE_SUBSCRIPTION,
      }),
    );
    expect(first.status).toBe(201);

    // A shared browser: the same device now signs in as an admin and enables
    // notifications. The endpoint must follow the signed-in account —
    // otherwise this account could never receive a login code and its sign-in
    // could not step up to OTP the way voters' does.
    const { user: claimant, token: claimantToken } = await makeUser("sub_claimant", "admin");
    const response = await call(
      subscribePOST,
      jsonRequest("/api/notifications/subscribe", {
        method: "POST",
        token: claimantToken,
        body: SAMPLE_SUBSCRIPTION,
      }),
    );
    expect(response.status).toBe(200);

    const stored = await prisma.pushSubscription.findUnique({
      where: { endpoint: SAMPLE_SUBSCRIPTION.endpoint },
    });
    expect(stored?.userId).toBe(claimant.id);
    expect(await prisma.pushSubscription.count()).toBe(1);

    // Device ownership changes are traceable.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "notification.subscription.reassigned" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(claimant.id);
    expect(audit?.detail).toContain(String(owner.id));
  });

  it("lets a user remove only their own subscription", async () => {
    const { user, token } = await makeUser("remover", "voter");
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: SAMPLE_SUBSCRIPTION.endpoint,
        p256dh: "k",
        auth: "a",
      },
    });
    const response = await call(
      subscribeDELETE,
      jsonRequest("/api/notifications/subscribe", {
        method: "DELETE",
        token,
        body: { endpoint: SAMPLE_SUBSCRIPTION.endpoint },
      }),
    );
    expect(response.status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * Creating notifications + recipient rules                             *
   * ------------------------------------------------------------------ */

  it("creates an in-app notification for self and queues push delivery", async () => {
    const { user, token } = await makeUser("self_notify", "voter");
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: SAMPLE_SUBSCRIPTION.endpoint,
        p256dh: "k",
        auth: "a",
      },
    });

    const response = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token,
        body: {
          title: "Polls open",
          body: "Voting is live.",
          target_url: "/elections/demo",
          category: "announcement",
        },
      }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.recipients).toBe(1);
    expect(body.queued).toBe(1);

    const notification = await prisma.notification.findFirst({
      where: { recipientId: user.id },
    });
    expect(notification?.title).toBe("Polls open");
    expect(notification?.targetUrl).toBe("/elections/demo");

    // The inline delivery attempt ran against the mocked provider.
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const delivery = await prisma.pushDelivery.findFirst({});
    expect(delivery?.status).toBe("accepted");
    expect(delivery?.acceptedAt).not.toBeNull();
  });

  it("rejects open-redirect target URLs", async () => {
    const { token } = await makeUser("evil_url", "voter");
    const response = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token,
        body: { title: "Phish", target_url: "//evil.example/steal" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.target_url).toBeDefined();
  });

  it("lets an admin notify other users but not a voter", async () => {
    const { user: target } = await makeUser("target_voter", "voter");
    const { token: voterToken } = await makeUser("plain_voter", "voter");
    const { token: adminToken } = await makeUser("root_admin", "admin");

    const denied = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token: voterToken,
        body: { title: "Hello", recipient_ids: [target.id] },
      }),
    );
    expect(denied.status).toBe(403);

    const allowed = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token: adminToken,
        body: { title: "Maintenance", body: "Tonight.", recipient_ids: [target.id] },
      }),
    );
    expect(allowed.status).toBe(201);
    expect(await prisma.notification.count({ where: { recipientId: target.id } })).toBe(1);
  });

  it("deduplicates retried events via the idempotency key", async () => {
    const { user, token } = await makeUser("idem_user", "voter");
    const body = {
      title: "Results published",
      target_url: "/results",
      idempotency_key: "results-published-election-9",
    };
    const first = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", { method: "POST", token, body }),
    );
    expect(first.status).toBe(201);
    const second = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", { method: "POST", token, body }),
    );
    expect(second.status).toBe(200);
    const secondBody = await readJson(second);
    expect(secondBody.duplicate).toBe(true);
    expect(await prisma.notification.count({ where: { recipientId: user.id } })).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * Recipient isolation + reading                                       *
   * ------------------------------------------------------------------ */

  it("keeps notifications private to their recipient", async () => {
    const { user: owner } = await makeUser("inbox_owner", "voter");
    const { token: strangerToken } = await makeUser("inbox_stranger", "voter");
    const ownerToken = await createTokenFor(owner.id);

    const created = await prisma.notification.create({
      data: { recipientId: owner.id, title: "Private", body: "For you only." },
    });

    // Stranger cannot list it.
    const list = await call(
      notificationsGET,
      jsonRequest("/api/notifications/", { token: strangerToken }),
    );
    expect(list.status).toBe(200);
    const listBody = (await readJson(list)) as unknown as Array<{ id: number }>;
    expect(listBody).toHaveLength(0);

    // Stranger cannot mark it read (404, not 403 — no existence leak).
    const mark = await call(
      readPATCH,
      jsonRequest(`/api/notifications/${created.id}/read`, {
        method: "PATCH",
        token: strangerToken,
      }),
      { id: String(created.id) },
    );
    expect(mark.status).toBe(404);

    // Stranger cannot delete it.
    const remove = await call(
      notificationDELETE,
      jsonRequest(`/api/notifications/${created.id}`, {
        method: "DELETE",
        token: strangerToken,
      }),
      { id: String(created.id) },
    );
    expect(remove.status).toBe(404);

    // Owner can mark and delete.
    const ownerMark = await call(
      readPATCH,
      jsonRequest(`/api/notifications/${created.id}/read`, {
        method: "PATCH",
        token: ownerToken,
      }),
      { id: String(created.id) },
    );
    expect(ownerMark.status).toBe(200);
    const markBody = await readJson(ownerMark);
    expect(markBody.is_read).toBe(true);

    const unread = await call(
      unreadCountGET,
      jsonRequest("/api/notifications/unread-count", { token: ownerToken }),
    );
    expect((await readJson(unread)).unread).toBe(0);

    const ownerRemove = await call(
      notificationDELETE,
      jsonRequest(`/api/notifications/${created.id}`, {
        method: "DELETE",
        token: ownerToken,
      }),
      { id: String(created.id) },
    );
    expect(ownerRemove.status).toBe(200);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("marks all of the caller's notifications read", async () => {
    const { user, token } = await makeUser("mark_all", "voter");
    await prisma.notification.createMany({
      data: [
        { recipientId: user.id, title: "One" },
        { recipientId: user.id, title: "Two" },
        { recipientId: user.id, title: "Three" },
      ],
    });
    const response = await call(
      readAllPOST,
      jsonRequest("/api/notifications/read-all", { method: "POST", token }),
    );
    expect((await readJson(response)).updated).toBe(3);
    expect(
      await prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    ).toBe(0);
  });

  /* ------------------------------------------------------------------ *
   * Expired subscriptions (provider 410)                                 *
   * ------------------------------------------------------------------ */

  it("removes a subscription when the provider reports it expired", async () => {
    const { user, token } = await makeUser("expired_sub", "voter");
    const subscription = await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: "https://push.example.invalid/gone",
        p256dh: "k",
        auth: "a",
      },
    });
    sendNotification.mockRejectedValueOnce({ statusCode: 410, body: "Gone" });

    const response = await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token,
        body: { title: "Any update" },
      }),
    );
    expect(response.status).toBe(201);

    // Subscription is gone; delivery is terminal.
    expect(await prisma.pushSubscription.count({ where: { id: subscription.id } })).toBe(0);
    const delivery = await prisma.pushDelivery.findFirst({});
    expect(delivery?.status).toBe("expired");
    expect(delivery?.errorCode).toBe("http_410");
  });

  it("queues a retry when the provider fails transiently", async () => {
    const { user, token } = await makeUser("flaky_sub", "voter");
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: "https://push.example.invalid/flaky",
        p256dh: "k",
        auth: "a",
      },
    });
    sendNotification.mockRejectedValueOnce({ statusCode: 503, body: "Unavailable" });

    await call(
      notificationsPOST,
      jsonRequest("/api/notifications/", {
        method: "POST",
        token,
        body: { title: "Retry me" },
      }),
    );

    const delivery = await prisma.pushDelivery.findFirst({});
    expect(delivery?.status).toBe("queued");
    expect(delivery?.attemptCount).toBe(1);
    expect(delivery?.nextAttemptAt).not.toBeNull();
  });

  /* ------------------------------------------------------------------ *
   * Admin delivery inspection                                            *
   * ------------------------------------------------------------------ */

  it("shows delivery records to admins only", async () => {
    const { user, token: adminToken } = await makeUser("ops_admin", "admin");
    const { token: voterToken } = await makeUser("ops_voter", "voter");
    const subscription = await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: "https://push.example.invalid/x", p256dh: "k", auth: "a" },
    });
    const notification = await prisma.notification.create({
      data: { recipientId: user.id, title: "Ops" },
    });
    await prisma.pushDelivery.create({
      data: { notificationId: notification.id, subscriptionId: subscription.id },
    });

    const denied = await call(
      deliveriesGET,
      jsonRequest("/api/admin/notifications/deliveries", { token: voterToken }),
    );
    expect(denied.status).toBe(403);

    const allowed = await call(
      deliveriesGET,
      jsonRequest("/api/admin/notifications/deliveries", { token: adminToken }),
    );
    expect(allowed.status).toBe(200);
    const body = await readJson(allowed);
    expect((body.results as unknown[]).length).toBe(1);
    expect((body.counts as Record<string, number>).pending).toBe(1);
  });
});
