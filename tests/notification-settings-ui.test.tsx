// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import { NotificationSettings } from "@/src/components/notification-settings";

type BrowserOptions = {
  permission?: NotificationPermission;
  secure?: boolean;
  capabilities?: boolean;
  subscribed?: boolean;
  /** HTTP status for the subscribe POST / DELETE (default 200). */
  status?: number;
  failRequestPermission?: Promise<NotificationPermission>;
  userAgent?: string;
};

type BrowserMock = {
  requestPermission: ReturnType<typeof vi.fn>;
  fetchMock: ReturnType<typeof vi.fn>;
  state: { subscribed: boolean };
  pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
};

function installBrowser(options: BrowserOptions = {}): BrowserMock {
  const {
    permission = "default",
    secure = true,
    capabilities = true,
    subscribed = false,
    status = 200,
    failRequestPermission,
    userAgent,
  } = options;

  vi.stubGlobal("isSecureContext", secure);
  if (userAgent) {
    Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  }

  const state = { subscribed };
  const subscription = {
    endpoint: "https://push.example.invalid/sub-endpoint",
    toJSON: () => ({
      endpoint: "https://push.example.invalid/sub-endpoint",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
      expirationTime: null,
    }),
    unsubscribe: async () => true,
  };

  const requestPermission = vi.fn(() =>
    failRequestPermission ?? Promise.resolve(permission === "default" ? "granted" : permission),
  );
  vi.stubGlobal(
    "Notification",
    class MockNotification {
      static permission = permission;
      static requestPermission = requestPermission;
    },
  );

  const pushManager = {
    getSubscription: vi.fn(async () => (state.subscribed ? subscription : null)),
    subscribe: vi.fn(async () => {
      state.subscribed = true;
      return subscription;
    }),
  };
  const registration = { pushManager, showNotification: vi.fn(async () => undefined) };
  const serviceWorker = {
    // A device that completed enabling keeps its registration.
    getRegistration: vi.fn(async () => (state.subscribed ? registration : undefined)),
    register: vi.fn(async () => registration),
  };

  if (capabilities) {
    vi.stubGlobal("PushManager", class MockPushManager {});
    Object.defineProperty(navigator, "serviceWorker", {
      value: serviceWorker,
      configurable: true,
    });
  } else {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }

  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return { requestPermission, fetchMock, state, pushManager };
}

describe("NotificationSettings", () => {
  const ORIGINAL_USER_AGENT = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: ORIGINAL_USER_AGENT,
      configurable: true,
    });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ";
    appState.current.token = "test-token";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the current permission and subscription state for this device", async () => {
    installBrowser({ permission: "granted", subscribed: false });

    render(<NotificationSettings />);

    expect(await screen.findByText("Notifications are off for this device.")).toBeTruthy();
    expect(screen.getByText("granted")).toBeTruthy();
    expect(screen.getByText("not registered")).toBeTruthy();
  });

  it("turns notifications on from an explicit click and registers the device", async () => {
    const mock = installBrowser({ permission: "default", subscribed: false });

    render(<NotificationSettings />);
    // Wait until the initial device check finishes (the button is disabled
    // while checking).
    await screen.findByText("Notifications are off for this device.");
    const button = screen.getByRole("button", { name: /Turn on notifications/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));

    fireEvent.click(button);

    // Permission was only requested because the user clicked.
    await waitFor(() => expect(mock.requestPermission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mock.fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = mock.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications/subscribe");
    expect(init.method).toBe("POST");

    expect(await screen.findByText("Notifications are on for this device.")).toBeTruthy();
    expect(screen.getByText("registered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Turn on notifications/ })).toBeNull();
  });

  it("turns notifications off from this device", async () => {
    const mock = installBrowser({ permission: "granted", subscribed: true });

    render(<NotificationSettings />);
    await screen.findByText("Notifications are on for this device.");
    const button = screen.getByRole("button", { name: /Turn off notifications/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));

    fireEvent.click(button);

    await waitFor(() => expect(mock.fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = mock.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");

    expect(await screen.findByText("Notifications are off for this device.")).toBeTruthy();
    expect(screen.getByText(/Notifications turned off for this device/)).toBeTruthy();
  });

  it("reuses an existing subscription instead of pushing twice", async () => {
    installBrowser({ permission: "granted", subscribed: true });

    render(<NotificationSettings />);

    // Already on: opening the card never calls the provider or re-registers.
    expect(await screen.findByText("Notifications are on for this device.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Turn on notifications/ })).toBeNull();
  });

  it("disables the toggle with settings guidance when permission was blocked", async () => {
    const mock = installBrowser({ permission: "denied" });

    render(<NotificationSettings />);

    const button = await screen.findByRole("button", { name: /Turn on notifications/ });
    await waitFor(() => expect(screen.getByText("blocked")).toBeTruthy());
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(/Allow them in your browser or system settings/)).toBeTruthy();
  });

  it("keeps working honestly on unsupported browsers", async () => {
    const mock = installBrowser({ capabilities: false });

    render(<NotificationSettings />);

    const button = await screen.findByRole("button", { name: /Turn on notifications/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    // The card shows honest guidance that points at the in-app bell.
    expect(screen.getByText(/you'll still see every alert inside NexVote from the bell/)).toBeTruthy();
    expect(mock.fetchMock).not.toHaveBeenCalled();
  });

  it("shows iOS Home Screen instructions without pretending to be a switch", async () => {
    installBrowser({
      permission: "default",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    render(<NotificationSettings />);

    expect(await screen.findByText(/Add to Home Screen/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Turn on notifications/ }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("reports failure when the server rejects the subscription (no false success)", async () => {
    installBrowser({ permission: "default", status: 500 });

    render(<NotificationSettings />);
    await screen.findByText("Notifications are off for this device.");
    const button = screen.getByRole("button", { name: /Turn on notifications/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));

    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("rejected");
    expect(screen.queryByText(/Notifications are on for this device/)).toBeNull();
  });

  it("shows a working state while the request is in flight", async () => {
    const mock = installBrowser({
      permission: "default",
      failRequestPermission: new Promise<NotificationPermission>(() => {}),
    });

    render(<NotificationSettings />);
    await screen.findByText("Notifications are off for this device.");
    const button = screen.getByRole("button", { name: /Turn on notifications/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));

    fireEvent.click(button);

    const busy = await screen.findByRole("button", { name: /Working…/ });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
  });
});
