// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const appState = vi.hoisted(() => ({
  current: {
    token: "admin-token",
    user: {
      id: 7,
      username: "admin1",
      full_name: "Admin One",
      email: "",
      role: "admin",
      auth_provider: "local",
      photo_url: null,
    } as {
      id: number;
      username: string;
      full_name: string;
      email: string;
      role: string;
      auth_provider: string;
      photo_url: string | null;
    },
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import { PushTestPanel } from "@/src/components/admin/push-test-panel";

const HONESTY_NOTE =
  "Queued means a delivery job exists; accepted means the push service accepted the request. " +
  "Neither confirms the device displayed the notification — this platform cannot observe that.";

function readinessPayload(eligible: number) {
  return {
    vapid_configured: true,
    audience: { eligible_subscriptions: eligible, subscribed_users: eligible, active_users: eligible + 5 },
    outbox: { pending: 0, queued: 0, accepted: eligible, failed: 0, expired: 0 },
    cooldown: { seconds_remaining: 0, last_run_at: null },
    audience_policy: "Active accounts with an enabled push subscription.",
    note: HONESTY_NOTE,
  };
}

function runPayload(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    audience: { eligible_subscriptions: 2, subscribed_users: 2 },
    targeted: 2,
    duplicates: 0,
    deliveries_queued: 2,
    delivery: { pending: 0, queued: 0, accepted: 2, failed: 0, expired: 0 },
    deferred: false,
    state: "complete",
    status_url: "/api/admin/notifications/test?run=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    note: HONESTY_NOTE,
    ...overrides,
  };
}

type FetchRoute = {
  readiness: unknown;
  post: { status: number; body: unknown };
  run?: { status: number; body: unknown };
};

function stubFetch(routes: FetchRoute) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      return new Response(JSON.stringify(routes.post.body), {
        status: routes.post.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("?run=")) {
      const run = routes.run ?? { status: 200, body: null };
      return new Response(JSON.stringify(run.body), {
        status: run.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(routes.readiness), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PushTestPanel", () => {
  beforeEach(() => {
    appState.current.token = "admin-token";
    appState.current.user.role = "admin";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing for non-admin users", async () => {
    appState.current.user.role = "officer";
    stubFetch({ readiness: readinessPayload(3), post: { status: 201, body: runPayload() } });

    const { container } = render(<PushTestPanel />);
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(container.querySelector("#push-testing-heading")).toBeNull();
  });

  it("shows readiness and requires confirmation before a large-audience test", async () => {
    const fetchMock = stubFetch({
      readiness: readinessPayload(12),
      post: { status: 201, body: runPayload() },
    });

    render(<PushTestPanel />);

    expect(await screen.findByText("Push Notification Testing")).toBeTruthy();
    // Eligible subscribed-device count is visible without sending anything
    // (devices + subscribed users tiles both show 12 here).
    expect((await screen.findAllByText("12")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Check Notification Readiness")).toBeTruthy();
    expect(
      screen.getByText(/every active account with an enabled push subscription/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Send Test Notification \(12\)/ }));

    // Confirmation gates the POST: nothing was sent yet.
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("12 subscribed devices");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Yes, send the test/ }));

    expect(await screen.findByText("Latest test result")).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    // Truthful figures and the honesty note are surfaced to the admin.
    expect(screen.getByText("Provider accepted")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(HONESTY_NOTE.slice(0, 60)))).toBeTruthy();
    expect(screen.queryByText(/device displayed the notification\.$/)).toBeNull();
  });

  it("sends immediately for a small audience without a confirmation dialog", async () => {
    const fetchMock = stubFetch({
      readiness: readinessPayload(2),
      post: { status: 201, body: runPayload({ audience: { eligible_subscriptions: 2, subscribed_users: 2 } }) },
    });

    render(<PushTestPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Send Test Notification \(2\)/ }));

    expect(await screen.findByText("Latest test result")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("surfaces a cooldown rejection and disables sending during the wait", async () => {
    stubFetch({
      readiness: readinessPayload(4),
      post: {
        status: 429,
        body: {
          detail: "A test was already sent moments ago. Wait 45 second(s) before sending another.",
          retry_after_seconds: 45,
        },
      },
    });

    render(<PushTestPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Send Test Notification \(4\)/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Wait 45 second(s)");
    expect(await screen.findByRole("button", { name: /Wait 45s/ })).toBeTruthy();
    expect(screen.queryByText("Latest test result")).toBeNull();
  });

  it("offers a refresh for an in-progress run and updates with real status", async () => {
    stubFetch({
      readiness: readinessPayload(2),
      post: {
        status: 201,
        body: runPayload({
          state: "in-progress",
          delivery: { pending: 2, queued: 0, accepted: 0, failed: 0, expired: 0 },
        }),
      },
      run: {
        status: 200,
        body: runPayload({
          state: "complete",
          delivery: { pending: 0, queued: 0, accepted: 2, failed: 0, expired: 0 },
        }),
      },
    });

    render(<PushTestPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Send Test Notification \(2\)/ }));

    expect(await screen.findByText("Delivery in progress")).toBeTruthy();
    const refresh = await screen.findByRole("button", { name: /Refresh result/ });
    fireEvent.click(refresh);

    expect(await screen.findByText("Delivery attempts finished")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Refresh result/ })).toBeNull(),
    );
    // The UI never claims display/read confirmation.
    expect(screen.getByText(/Neither confirms the device displayed/)).toBeTruthy();
  });

  it("warns when VAPID is not configured on the deployment", async () => {
    const payload = readinessPayload(0) as Record<string, unknown>;
    payload.vapid_configured = false;
    stubFetch({ readiness: payload, post: { status: 201, body: runPayload() } });

    render(<PushTestPanel />);

    expect(await screen.findByText("No (VAPID missing)")).toBeTruthy();
    expect(screen.getByText(/VAPID environment variables and redeploy/)).toBeTruthy();
  });
});
