// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** The one browser endpoint every mock uses; hash mirrors the server fingerprint. */
const ENDPOINT = "https://push.example.invalid/sub-endpoint";
const ENDPOINT_HASH = createHash("sha256").update(ENDPOINT).digest("hex").slice(0, 32);

function ownSubscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    endpoint_hash: ENDPOINT_HASH,
    user_agent: "vitest",
    created_at: new Date().toISOString(),
    last_success_at: null,
    last_failure_at: null,
    is_disabled: false,
    ...overrides,
  };
}

// AppProvider is mocked: the prompt only reads token/user from it, and the
// real provider performs network calls we do not want in a unit test.
const appState = vi.hoisted(() => ({
  current: {
    token: "test-token",
    user: {
      id: 1,
      username: "voter1",
      full_name: "Voter One",
      email: "",
      role: "voter",
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

import { NotificationPermissionPrompt } from "@/src/components/notification-permission-prompt";
import { subscribeToPush } from "@/src/lib/notifications/client";

/**
 * Browser-API mocks for the real client.ts permission/subscribe flow. The
 * component under test is exercised end-to-end against these mocks: no
 * permission request may happen except from the Enable button click.
 */
type BrowserOptions = {
  permission?: NotificationPermission;
  secure?: boolean;
  /** Include serviceWorker + PushManager capabilities (default: yes). */
  capabilities?: boolean;
  hasExistingSubscription?: boolean;
  userAgent?: string;
  /** HTTP status for the subscribe POST (default 200). */
  subscribeStatus?: number;
  subscribeDetail?: string;
  /** Rows the GET list returns for the signed-in account (default: this browser is registered). */
  ownSubscriptions?: Array<ReturnType<typeof ownSubscriptionRow>>;
};

type BrowserMock = {
  requestPermission: ReturnType<typeof vi.fn>;
  fetchMock: ReturnType<typeof vi.fn>;
  pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  serviceWorker: { getRegistration: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
};

function installBrowser(options: BrowserOptions = {}): BrowserMock {
  const {
    permission = "default",
    secure = true,
    capabilities = true,
    hasExistingSubscription = false,
    userAgent,
    subscribeStatus = 200,
    subscribeDetail,
    ownSubscriptions = [ownSubscriptionRow()],
  } = options;

  vi.stubGlobal("isSecureContext", secure);
  if (userAgent) {
    Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  }

  const requestPermission = vi.fn(async () =>
    permission === "default" ? "granted" : permission,
  );
  vi.stubGlobal(
    "Notification",
    class MockNotification {
      static permission = permission;
      static requestPermission = requestPermission;
    },
  );

  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({
      endpoint: ENDPOINT,
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
      expirationTime: null,
    }),
    unsubscribe: async () => true,
  };

  const pushManager = {
    getSubscription: vi.fn(async () => (hasExistingSubscription ? subscription : null)),
    subscribe: vi.fn(async () => subscription),
  };
  const registration = { pushManager, showNotification: vi.fn(async () => undefined) };
  const serviceWorker = {
    getRegistration: vi.fn(async () =>
      hasExistingSubscription ? registration : undefined,
    ),
    register: vi.fn(async () => registration),
  };

  if (capabilities) {
    vi.stubGlobal("PushManager", class MockPushManager {});
    Object.defineProperty(navigator, "serviceWorker", {
      value: serviceWorker,
      configurable: true,
    });
  } else {
    // A browser without the required APIs must be detected honestly.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    (init?.method ?? "GET") === "GET"
      ? new Response(JSON.stringify(ownSubscriptions), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : new Response(JSON.stringify(subscribeDetail ? { detail: subscribeDetail } : { ok: true }), {
          status: subscribeStatus,
          headers: { "Content-Type": "application/json" },
        }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return { requestPermission, fetchMock, pushManager, serviceWorker };
}

describe("NotificationPermissionPrompt", () => {
  const ORIGINAL_USER_AGENT = navigator.userAgent;

  beforeEach(() => {
    window.localStorage.clear();
    // jsdom may not expose WebCrypto's digest; the client hashes the browser
    // endpoint to match the server fingerprint, so provide it when missing.
    if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
    // The iOS case rewrites userAgent — restore it so later tests see the
    // default jsdom agent again.
    Object.defineProperty(navigator, "userAgent", {
      value: ORIGINAL_USER_AGENT,
      configurable: true,
    });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ";
    appState.current.token = "test-token";
    appState.current.user.role = "voter";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a helpful fallback on unsupported browsers", async () => {
    installBrowser({ capabilities: false });

    render(<NotificationPermissionPrompt />);

    expect(
      await screen.findByText("Notifications aren't supported here"),
    ).toBeTruthy();
    // Honest guidance, not a broken enable button.
    expect(screen.queryByRole("button", { name: /Enable Notifications/ })).toBeNull();
    expect(screen.getByText(/Service Worker, Push, or Notification APIs/)).toBeTruthy();
  });

  it("requests permission only after the user presses Enable", async () => {
    const mock = installBrowser({ permission: "default" });

    render(<NotificationPermissionPrompt />);

    // Card appears without touching the permission API.
    expect(await screen.findByText("Enable NexVote Notifications")).toBeTruthy();
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(mock.fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Enable Notifications/ }));

    await waitFor(() => expect(mock.requestPermission).toHaveBeenCalledTimes(1));
    // Permission granted → SW registered → subscription → server registration.
    await waitFor(() => expect(mock.fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = mock.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications/subscribe");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Token test-token");

    expect(await screen.findByText("Notifications are on")).toBeTruthy();
    // The SW must register cache-busting options so a stale sw.js cannot keep
    // handling pushes after a deploy.
    expect(mock.serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("does not re-prompt when permission is already granted", async () => {
    const mock = installBrowser({ permission: "granted" });

    render(<NotificationPermissionPrompt />);

    expect(await screen.findByText("Enable NexVote Notifications")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Enable Notifications/ }));

    await waitFor(() => expect(mock.fetchMock).toHaveBeenCalledTimes(1));
    // requestPermission() is never called for an already-granted permission.
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(await screen.findByText("Notifications are on")).toBeTruthy();
  });

  it("hides completely when this device is already subscribed to this account", async () => {
    const mock = installBrowser({ permission: "granted", hasExistingSubscription: true });

    const { container } = render(<NotificationPermissionPrompt />);

    // Recompute runs the registered-device check on mount — use it as the canary.
    await waitFor(() => expect(mock.serviceWorker.getRegistration).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: "Notification permission" }),
    ).toBeNull();
    expect(container.textContent).toBe("");
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });

  it("offers Enable when the browser subscription belongs to another account", async () => {
    // Shared device: the browser holds a subscription, but the signed-in
    // account has none, so no login code could reach it — the card must offer
    // to claim the device instead of staying silent.
    const mock = installBrowser({
      permission: "granted",
      hasExistingSubscription: true,
      ownSubscriptions: [],
    });

    render(<NotificationPermissionPrompt />);

    expect(await screen.findByText("Enable NexVote Notifications")).toBeTruthy();
    expect(mock.requestPermission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Enable Notifications/ }));

    await waitFor(() =>
      expect(
        mock.fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST"),
      ).toBe(true),
    );
    const [url, init] = mock.fetchMock.mock.calls.find(
      ([, callInit]) => (callInit as RequestInit)?.method === "POST",
    ) as [string, RequestInit];
    expect(url).toBe("/api/notifications/subscribe");
    expect(init.method).toBe("POST");
    // No permission dialog: permission was already granted on this browser.
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(await screen.findByText("Notifications are on")).toBeTruthy();
  });

  it("guides instead of prompting when permission was denied", async () => {
    const mock = installBrowser({ permission: "denied" });

    render(<NotificationPermissionPrompt />);

    expect(await screen.findByText("Notifications are blocked")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Enable Notifications/ }),
    ).toBeNull();
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(/browser or system settings/i)).toBeTruthy();

    // Dismissal is remembered: remounting does not interrupt again.
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Notification permission" })).toBeNull(),
    );
    expect(window.localStorage.getItem("nexvote-push-prompt-dismissed-at:1")).toBeTruthy();

    cleanup();
    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(mock.serviceWorker.getRegistration).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: "Notification permission" }),
    ).toBeNull();
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });

  it("shows iOS Home Screen instructions instead of a dead button", async () => {
    const mock = installBrowser({
      permission: "default",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    render(<NotificationPermissionPrompt />);

    expect(await screen.findByText("Add NexVote to your Home Screen")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Enable Notifications/ }),
    ).toBeNull();
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });

  it("does not report success when the server rejects the subscription", async () => {
    installBrowser({
      permission: "default",
      subscribeStatus: 500,
      subscribeDetail: "Could not store this subscription.",
    });

    render(<NotificationPermissionPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: /Enable Notifications/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not store this subscription.");
    expect(screen.queryByText("Notifications are on")).toBeNull();
  });

  it("keeps the prompt quiet after Not Now", async () => {
    const mock = installBrowser({ permission: "default" });

    const first = render(<NotificationPermissionPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "Not Now" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Notification permission" })).toBeNull(),
    );
    first.unmount();

    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(mock.serviceWorker.getRegistration).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: "Notification permission" }),
    ).toBeNull();
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });

  it("reuses an existing push subscription instead of creating a new one", async () => {
    // Direct exercise of the shared client flow the Enable button calls.
    const mock = installBrowser({
      permission: "granted",
      hasExistingSubscription: true,
    });

    const result = await subscribeToPush("test-token");

    expect(result.ok).toBe(true);
    expect(mock.pushManager.getSubscription).toHaveBeenCalled();
    expect(mock.pushManager.subscribe).not.toHaveBeenCalled();
    expect(mock.fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.requestPermission).not.toHaveBeenCalled();
  });
});
