// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

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
const STREAM_URL = "/api/notifications/stream";

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

/** A live SSE response: frames are available immediately, the stream stays open. */
function sseResponse(...frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function notificationFrame(body: Record<string, unknown>): string {
  return `data: ${JSON.stringify(body)}\n\n`;
}

/**
 * Mock fetch. The stream endpoint serves `stream()` when given and fails with a
 * 503 otherwise (which is what drives the polling fallback); the list endpoint
 * serves successive batches, repeating the last one once the queue drains.
 */
function mockFetch(options: {
  stream?: () => Response;
  batches?: Array<Array<Record<string, unknown>>>;
}) {
  const batches = options.batches ?? [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes(STREAM_URL)) {
      if (options.stream) return options.stream();
      return new Response(null, { status: 503 });
    }
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

  it("shows a notification delivered live on the stream as a top banner", async () => {
    const mock = mockFetch({
      stream: () => sseResponse("retry: 3000\n\n", notificationFrame(row(9, "Live alert"))),
    });
    const onFresh = vi.fn();
    window.addEventListener(IN_APP_NOTIFICATION_EVENT, onFresh);

    renderNotifier();

    expect(await screen.findByText("Live alert")).toBeTruthy();
    expect(screen.getByText("Body 9")).toBeTruthy();
    // Top placement: the banner lives in the "Notifications" region, not the
    // bottom "Messages" stack used by ordinary toasts.
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByText("Live alert"),
    ).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("9"));
    await waitFor(() => expect(onFresh).toHaveBeenCalledTimes(1));

    const streamCall = mock.mock.calls.find(([input]) => String(input).includes(STREAM_URL));
    expect(streamCall).toBeTruthy();
    expect(new Headers((streamCall![1] as RequestInit).headers).get("Authorization")).toBe(
      "Token test-token",
    );
    window.removeEventListener(IN_APP_NOTIFICATION_EVENT, onFresh);
  });

  it("ignores a stream event another tab already surfaced", async () => {
    window.localStorage.setItem(CURSOR_KEY, "12");
    mockFetch({
      stream: () => sseResponse(notificationFrame(row(11, "Duplicate alert"))),
    });

    renderNotifier();

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(screen.queryByText("Duplicate alert")).toBeNull();
    expect(window.localStorage.getItem(CURSOR_KEY)).toBe("12");
  });

  it("falls back to polling when the stream is unavailable", async () => {
    const mock = mockFetch({ batches: [[row(5)], [row(6, "Polled alert"), row(5)]] });

    renderNotifier();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("5"));
    expect(screen.queryAllByRole("status")).toHaveLength(0);

    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("Polled alert")).toBeTruthy();
    expect(
      mock.mock.calls.filter(([input]) => !String(input).includes(STREAM_URL)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("announces alerts that arrived while the app was closed", async () => {
    // The cursor survives closing the app, so the next visit still shows them.
    window.localStorage.setItem(CURSOR_KEY, "5");
    mockFetch({ batches: [[row(7, "Results published"), row(6, "New announcement"), row(5)]] });

    renderNotifier();

    expect(await screen.findByText("Results published")).toBeTruthy();
    expect(screen.getByText("New announcement")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("7"));
  });

  it("skips notifications already read on another device but moves the cursor", async () => {
    window.localStorage.setItem(CURSOR_KEY, "5");
    mockFetch({ batches: [[row(7, "Read elsewhere", true), row(5)]] });

    renderNotifier();

    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("7"));
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("caps a burst and moves the cursor to the newest notification", async () => {
    mockFetch({ batches: [[row(1)], [row(6), row(5), row(4), row(3), row(2), row(1)]] });

    renderNotifier();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("1"));

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(3));
    expect(screen.getByText("Notification 6")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("6"));
  });

  it("sets a baseline on first look instead of toasting the existing backlog", async () => {
    const mock = mockFetch({ batches: [[row(5)]] });

    renderNotifier();

    await waitFor(() => expect(window.localStorage.getItem(CURSOR_KEY)).toBe("5"));
    const listCall = mock.mock.calls.find(([input]) => !String(input).includes(STREAM_URL));
    expect(listCall).toBeTruthy();
    expect(new Headers((listCall![1] as RequestInit).headers).get("Authorization")).toBe(
      "Token test-token",
    );
    expect((listCall![1] as RequestInit).cache).toBe("no-store");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("stays quiet while the tab is hidden and resumes when it is visible again", async () => {
    setVisibility("hidden");
    const mock = mockFetch({ batches: [[row(5)]] });

    renderNotifier();
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mock).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() =>
      expect(
        mock.mock.calls.filter(([input]) => !String(input).includes(STREAM_URL)).length,
      ).toBe(1),
    );
  });

  it("does nothing when signed out", async () => {
    appState.current.token = null;

    const mock = mockFetch({ stream: () => sseResponse(notificationFrame(row(5))) });
    renderNotifier();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});
