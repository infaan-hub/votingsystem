// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// AppProvider is mocked: the notifier only reads token/user from it.
const appState = vi.hoisted(() => ({
  current: {
    token: "test-token" as string | null,
    user: { id: 7 } as { id: number } | null,
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import { InAppNotifier } from "@/src/components/in-app-notifier";
import { ToastProvider } from "@/src/components/ui/toast";
import { IN_APP_NOTIFICATION_EVENT } from "@/src/lib/notifications/in-app";

const CURSOR_KEY = "nexvote-notif-cursor-u7";

function row(id: number, title = `Notification ${id}`, isRead = false) {
  return {
    id,
    title,
    body: `Body ${id}`,
    category: "election",
    target_url: "/elections/test",
    tag: `tag-${id}`,
    created_at: new Date().toISOString(),
    is_read: isRead,
    read_at: isRead ? new Date().toISOString() : null,
  };
}

/** Successive GET responses; the last batch repeats once the queue is drained. */
function mockFetchQueue(batches: Array<Array<Record<string, unknown>>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // The channel only ever reads the notifications endpoint, without caching.
    expect(String(input)).toContain("/api/notifications");
    expect(init?.cache).toBe("no-store");
    const batch = batches.length > 1 ? batches.shift()! : (batches[0] ?? []);
    return new Response(JSON.stringify(batch), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderNotifier() {
  return render(
    <ToastProvider>
      <InAppNotifier />
    </ToastProvider>,
  );
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
}

describe("InAppNotifier", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setVisibility("visible");
    appState.current.token = "test-token";
    appState.current.user = { id: 7 };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sets a baseline on first look instead of toasting the existing backlog", async () => {
    const mock = mockFetchQueue([[row(5)]]);

    renderNotifier();

    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(new Headers((mock.mock.calls[0]![1] as RequestInit).headers).get("Authorization")).toBe(
      "Token test-token",
    );
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("5"));
  });

  it("toasts notifications that arrive while the app is open and pings listeners", async () => {
    mockFetchQueue([[row(5)], [row(6, "Results published"), row(5)]]);
    const onFresh = vi.fn();
    window.addEventListener(IN_APP_NOTIFICATION_EVENT, onFresh);

    renderNotifier();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("5"));

    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("Results published")).toBeTruthy();
    expect(screen.getByText("Body 6")).toBeTruthy();
    await waitFor(() => expect(onFresh).toHaveBeenCalledTimes(1));
    window.removeEventListener(IN_APP_NOTIFICATION_EVENT, onFresh);
  });

  it("announces alerts that arrived while the app was closed", async () => {
    // The cursor survives closing the app, so the next visit still shows them.
    window.localStorage.setItem(CURSOR_KEY, "5");
    mockFetchQueue([[row(7, "Results published"), row(6, "New announcement"), row(5)]]);

    renderNotifier();

    expect(await screen.findByText("Results published")).toBeTruthy();
    expect(screen.getByText("New announcement")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("7"));
  });

  it("skips notifications already read on another device but moves the cursor", async () => {
    window.localStorage.setItem(CURSOR_KEY, "5");
    mockFetchQueue([[row(7, "Read elsewhere", true), row(5)]]);

    renderNotifier();

    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("7"));
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("caps a burst and moves the cursor to the newest notification", async () => {
    mockFetchQueue([[row(1)], [row(6), row(5), row(4), row(3), row(2), row(1)]]);

    renderNotifier();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("1"));

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(3));
    expect(screen.getByText("Notification 6")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("6"));
  });

  it("stays quiet while the tab is hidden and resumes when it is visible again", async () => {
    setVisibility("hidden");
    const mock = mockFetchQueue([[row(5)]]);

    renderNotifier();
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mock).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
  });

  it("does nothing when signed out", async () => {
    appState.current.token = null;

    const mock = mockFetchQueue([[row(5)]]);
    renderNotifier();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});
