// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Mock the navigation hooks the page guard needs. The API stays the real
// security boundary (permission: "admin"); this only proves what the page
// renders for an authenticated admin versus an under-privileged user.
const routerReplace = vi.fn();
const appState = vi.hoisted(() => ({
  current: {
    token: "admin-token",
    user: {
      id: 7,
      username: "admin1",
      full_name: "Admin One",
      email: "admin@example.invalid",
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/profile",
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import AdminProfilePage from "@/src/app/admin/profile/page";

/** Minimal browser capabilities so NotificationSettings detects "off". */
function installBrowser() {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "Notification",
    class MockNotification {
      static permission = "default";
      static requestPermission = vi.fn();
    },
  );
  vi.stubGlobal("PushManager", class MockPushManager {});
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn(async () => undefined),
      register: vi.fn(async () => ({
        pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn() },
        showNotification: vi.fn(),
      })),
    },
    configurable: true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            vapid_configured: false,
            audience: { eligible_subscriptions: 3, subscribed_users: 3, active_users: 12 },
            outbox: { pending: 0, queued: 0, accepted: 3, failed: 0, expired: 0 },
            cooldown: { seconds_remaining: 0, last_run_at: null },
            audience_policy: "Active accounts with an enabled push subscription.",
            note: "Queued means a delivery job exists; accepted means the push service accepted the request. Neither confirms the device displayed the notification.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
}

describe("AdminProfilePage", () => {
  beforeEach(() => {
    appState.current.token = "admin-token";
    appState.current.user.role = "admin";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the push-testing panel buttons for an authenticated admin", async () => {
    installBrowser();
    routerReplace.mockClear();

    render(<AdminProfilePage />);

    // Identity + testing panel from the real page.
    expect(await screen.findByText("Push Notification Testing")).toBeTruthy();
    expect(screen.getByText("Check Notification Readiness")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send Test Notification/ })).toBeTruthy();
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);

    // The per-device on/off control is on the admin profile too.
    expect(await screen.findByText("Notifications")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Turn on notifications/ })).toBeTruthy();

    // Readiness loads (3 eligible devices) without sending anything.
    await waitFor(() =>
      expect(
        fetchMockCalls().filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0),
    );
  });

  it("keeps the panel hidden for under-privileged users", async () => {
    installBrowser();
    routerReplace.mockClear();
    appState.current.user.role = "officer";

    render(<AdminProfilePage />);

    expect(await screen.findByText("Access required")).toBeTruthy();
    expect(screen.queryByText("Push Notification Testing")).toBeNull();
    expect(screen.queryByText("Check Notification Readiness")).toBeNull();
    expect(appState.current.user.username === "admin1").toBe(true);
  });
});

function fetchMockCalls() {
  return vi.mocked(fetch).mock.calls as [string, RequestInit | undefined][];
}
