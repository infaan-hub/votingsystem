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
import { LIVE_UPDATE_EVENT } from "@/src/lib/live";

const STREAM_URL = "/api/notifications/stream";

/** Minimal Web Locks stand-in: one holder per name, `ifAvailable` opt-out. */
class FakeLockManager {
  private held = new Set<string>();

  async request(
    name: string,
    options: { ifAvailable?: boolean } | undefined,
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    if (options?.ifAvailable && this.held.has(name)) return callback(null);
    this.held.add(name);
    try {
      return await callback({ name });
    } finally {
      this.held.delete(name);
    }
  }
}

/** Minimal BroadcastChannel stand-in: every peer except the sender receives it. */
class FakeBroadcastChannel {
  static peers = new Set<FakeBroadcastChannel>();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public name: string) {
    FakeBroadcastChannel.peers.add(this);
  }

  postMessage(data: unknown): void {
    for (const peer of FakeBroadcastChannel.peers) {
      if (peer !== this && peer.name === this.name) {
        peer.onmessage?.(new MessageEvent("message", { data }));
      }
    }
  }

  close(): void {
    FakeBroadcastChannel.peers.delete(this);
  }
}

function row(id: number, title: string) {
  return {
    id,
    title,
    body: `Body ${id}`,
    category: "election",
    target_url: "/elections/test",
    tag: `tag-${id}`,
    created_at: new Date().toISOString(),
    is_read: false,
    read_at: null,
  };
}

let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

function openSse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function streamCalls(fetchMock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(STREAM_URL)).length;
}

describe("InAppNotifier cross-tab coordination", () => {
  beforeEach(() => {
    window.localStorage.clear();
    FakeBroadcastChannel.peers.clear();
    streamController = null;
    appState.current.token = "test-token";
    appState.current.user = { id: 7 };
    Object.defineProperty(window.navigator, "locks", {
      value: new FakeLockManager(),
      configurable: true,
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps one stream per browser and fans rows out to the other tabs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(STREAM_URL)) return openSse();
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const live = vi.fn();
    window.addEventListener(LIVE_UPDATE_EVENT, live);

    // Tab one becomes the leader and owns the only stream.
    const first = render(
      <ToastProvider>
        <InAppNotifier />
      </ToastProvider>,
    );
    await waitFor(() => expect(streamCalls(fetchMock)).toBe(1));
    expect(streamController).not.toBeNull();

    // Tab two follows: no second connection.
    const second = render(
      <ToastProvider>
        <InAppNotifier />
      </ToastProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(streamCalls(fetchMock)).toBe(1);

    // A row delivered on the leader's stream reaches both tabs: one banner in
    // the browser (the shared cursor) and one live event per tab.
    streamController!.enqueue(
      new TextEncoder().encode(`data: ${JSON.stringify(row(9, "Broadcast alert"))}\n\n`),
    );

    await waitFor(() => expect(screen.getAllByText("Broadcast alert")).toHaveLength(1));
    await waitFor(() => expect(live).toHaveBeenCalledTimes(2));

    // The leader goes away; the follower takes the stream over.
    first.unmount();
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(streamCalls(fetchMock)).toBe(2), { timeout: 4_000 });

    second.unmount();
    window.removeEventListener(LIVE_UPDATE_EVENT, live);
  });
});
