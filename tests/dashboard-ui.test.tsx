// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The dashboard only reads the session and routes; both are mocked so the
// test exercises the rendered voting state on the "Open now" cards.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
}));

const appState = vi.hoisted(() => ({
  current: {
    token: "test-token" as string | null,
    user: {
      id: 7,
      username: "voter1",
      full_name: "Voter One",
      email: "",
      role: "voter",
      auth_provider: "local",
      photo_url: null as string | null,
    },
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import DashboardPage from "@/src/app/dashboard/page";

const HOUR = 60 * 60 * 1000;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function activeElection(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 1,
    slug: "campus-leaders-2026",
    title: "Campus Leaders 2026",
    description: "Pick your leaders.",
    lifecycle_status: "OPEN",
    status: "active",
    voting_start_at: new Date(now - HOUR).toISOString(),
    voting_end_at: new Date(now + HOUR).toISOString(),
    has_voted: false,
    ...overrides,
  };
}

function mockFetch(elections: unknown[], campaigns: unknown[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/elections")) {
      // The personalised state only exists when the token is sent.
      expect(new Headers(init?.headers).get("Authorization")).toBe("Token test-token");
      return json(elections);
    }
    if (url.startsWith("/api/campaigns")) return json(campaigns);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("dashboard voting state", () => {
  beforeEach(() => {
    appState.current.token = "test-token";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("offers Vote now while the voter has not voted", async () => {
    mockFetch([activeElection()]);

    render(<DashboardPage />);

    const voteLink = await screen.findByRole("link", { name: /Vote now/ });
    expect(voteLink.getAttribute("href")).toBe("/vote/campus-leaders-2026");
    expect(screen.queryByRole("link", { name: /Already voted/ })).toBeNull();
  });

  it("shows Already voted instead of Vote now once the ballot is recorded", async () => {
    mockFetch([activeElection({ has_voted: true })]);

    render(<DashboardPage />);

    const votedLink = await screen.findByRole("link", { name: /Already voted/ });
    expect(votedLink.getAttribute("href")).toBe("/elections/campus-leaders-2026");
    expect(screen.queryByRole("link", { name: /Vote now/ })).toBeNull();
  });
});
