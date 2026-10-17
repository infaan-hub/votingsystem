// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/src/components/ui/toast";

/**
 * The Add-election page must send the officer's category pick with the create
 * call — that id is what files the election into the home Explore tiles and
 * the /categories/[slug] pages.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/officer/election/new",
  useSearchParams: () => new URLSearchParams(),
}));

const appState = vi.hoisted(() => ({
  current: {
    token: "officer-token" as string | null,
    user: {
      id: 9,
      username: "officer-one",
      full_name: "Olive Cer",
      email: "officer@example.test",
      role: "officer",
      auth_provider: "local",
      photo_url: null,
    },
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import OfficerNewElectionPage from "@/src/app/officer/election/new/page";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchCall = { url: string; init?: RequestInit };

function installFetch(calls: FetchCall[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/categories") {
      return jsonResponse([
        { id: 4, name: "Student Union" },
        { id: 7, name: "Staff Union" },
      ]);
    }
    if (url === "/api/officer/elections") {
      return jsonResponse({ id: 21, slug: "campus-2026", title: "Campus 2026" }, 201);
    }
    if (url === "/api/officer/elections/21/candidates") {
      return jsonResponse({ id: 1 }, 201);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("officer Add-election page", () => {
  beforeEach(() => {
    routerPush.mockClear();
    appState.current.token = "officer-token";
    // FilePreview renders an object URL while a file is staged.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:preview",
    );
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the picked category with the created election", async () => {
    const calls: FetchCall[] = [];
    installFetch(calls);

    render(
      <ToastProvider>
        <OfficerNewElectionPage />
      </ToastProvider>,
    );

    // Categories load from the public list into the new selector.
    await screen.findByRole("option", { name: "Student Union" });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "4" } });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Campus 2026" },
    });
    // Open to everyone keeps the form free of any voter list.
    fireEvent.click(screen.getByRole("radio", { name: /Open to everyone/ }));
    // One candidate, including the front image the form requires.
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Amina Yusuf" },
    });
    fireEvent.change(screen.getByLabelText("Seat / position"), {
      target: { value: "President" },
    });
    const imageInputs = screen.getAllByLabelText("Front image") as HTMLInputElement[];
    fireEvent.change(imageInputs[imageInputs.length - 1], {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create election" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/officer/election?election=21"),
    );

    const createCall = calls.find((entry) => entry.url === "/api/officer/elections");
    expect(createCall).toBeTruthy();
    const body = JSON.parse(String(createCall?.init?.body)) as Record<string, unknown>;
    expect(body.category_id).toBe(4);
    expect(body.title).toBe("Campus 2026");
  });

  it("creates the election with no category when none is picked", async () => {
    const calls: FetchCall[] = [];
    installFetch(calls);

    render(
      <ToastProvider>
        <OfficerNewElectionPage />
      </ToastProvider>,
    );

    await screen.findByRole("option", { name: "Staff Union" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unfiled Election" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Open to everyone/ }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Amina Yusuf" },
    });
    fireEvent.change(screen.getByLabelText("Seat / position"), {
      target: { value: "President" },
    });
    const imageInputs = screen.getAllByLabelText("Front image") as HTMLInputElement[];
    fireEvent.change(imageInputs[imageInputs.length - 1], {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create election" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/officer/election?election=21"),
    );

    const createCall = calls.find((entry) => entry.url === "/api/officer/elections");
    const body = JSON.parse(String(createCall?.init?.body)) as Record<string, unknown>;
    expect(body.category_id).toBeNull();
  });
});
