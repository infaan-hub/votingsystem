// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The page guard reads the session and routes; the API itself is mocked below
// so the test focuses on the delete confirmation and the DELETE it sends.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/elections",
}));

const appState = vi.hoisted(() => ({
  current: {
    token: "admin-token" as string | null,
    user: {
      id: 7,
      username: "admin1",
      full_name: "Admin One",
      email: "admin@example.invalid",
      role: "admin",
      auth_provider: "local",
      photo_url: null as string | null,
    },
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import AdminElectionsPage from "@/src/app/admin/elections/page";
import { ToastProvider } from "@/src/components/ui/toast";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const election = {
  id: 4,
  title: "Students Guild 2026",
  slug: "students-guild-2026",
  status: "OPEN",
  is_published: true,
  voting_start_at: "2026-10-20 08:00",
  voting_end_at: "2026-10-22 18:00",
  category_id: null,
  vote_count: 2,
};

function mockApi(rows: unknown[] = [election]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "DELETE") {
      return json({ deleted: true, id: election.id, votes_deleted: 2 });
    }
    if (url.startsWith("/api/admin/elections")) return json(rows);
    if (url.startsWith("/api/categories")) return json([]);
    if (url.startsWith("/api/admin/officers")) return json([]);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <ToastProvider>
      <AdminElectionsPage />
    </ToastProvider>,
  );
}

describe("admin elections page deletion", () => {
  beforeEach(() => {
    appState.current.token = "admin-token";
    appState.current.user.role = "admin";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("states the ballot count and deletes the election when confirmed", async () => {
    const fetchMock = mockApi();
    renderPage();

    await screen.findByText("Students Guild 2026");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    // The confirmation names the ballots that would disappear with it.
    expect(await screen.findByText(/2 cast ballots/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Delete election/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/elections/${election.id}`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("keeps the plain warning when no ballots were cast", async () => {
    mockApi([{ ...election, vote_count: 0 }]);
    renderPage();

    await screen.findByText("Students Guild 2026");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(
        /announcements\. This cannot be undone\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cast ballots/)).toBeNull();
  });
});
