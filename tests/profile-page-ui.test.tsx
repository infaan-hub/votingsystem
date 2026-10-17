// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/src/components/ui/toast";

/**
 * Role changes stay an administrator action on the server (`PATCH
 * /api/admin/users/[user_id]/`); these tests prove what the shared profile
 * screen renders and sends for each role, and that its own edit dialog never
 * carries a role field.
 */

type ProfileUser = {
  id: number;
  username: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  auth_provider: string;
  photo_url: string | null;
  phone_number: string | null;
};

const baseUser: ProfileUser = {
  id: 4,
  username: "student_a",
  full_name: "Asha Noor",
  first_name: "Asha",
  last_name: "Noor",
  email: "asha@example.com",
  role: "voter",
  auth_provider: "local",
  photo_url: null,
  phone_number: null,
};

const appState = vi.hoisted(() => ({
  current: {
    token: "voter-token" as string | null,
    user: null as Record<string, unknown> | null,
    refreshUser: vi.fn(async () => null),
    handleLogout: vi.fn(async () => undefined),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/profile",
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));
// The notification control is covered by its own suite and reaches the service
// worker API from the browser; stub it so this screen is what is under test.
vi.mock("@/src/components/notification-settings", () => ({
  NotificationSettings: () => null,
}));

import ProfilePage from "@/src/app/profile/page";

function renderPage() {
  return render(
    <ToastProvider>
      <ProfilePage />
    </ToastProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    appState.current.token = "voter-token";
    appState.current.user = { ...baseUser };
    appState.current.refreshUser = vi.fn(async () => null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lets a voter edit name and email, and never sends a role", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...baseUser, last_name: "Mwinyi" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    // Voters have no WhatsApp sending identity and no activity section.
    expect(screen.queryByText("WhatsApp number")).toBeNull();
    expect(screen.queryByText("Your activity")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));

    const first = screen.getByLabelText("First name") as HTMLInputElement;
    const last = screen.getByLabelText("Last name") as HTMLInputElement;
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(first.value).toBe("Asha");
    expect(last.value).toBe("Noor");
    expect(email.value).toBe("asha@example.com");

    // The role is shown for context only: no control can change it here.
    expect(screen.getByText(/Roles are changed by an administrator only/)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.change(last, { target: { value: "Mwinyi" } });
    fireEvent.change(email, { target: { value: "asha.mwinyi@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(appState.current.refreshUser).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/users/me/");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      first_name: "Asha",
      last_name: "Mwinyi",
      email: "asha.mwinyi@example.com",
    });
    expect(String(init.body)).not.toContain("role");
  });

  it("surfaces a refused email edit instead of pretending it saved", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ email: ["This email is already in use."] }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Could not save profile")).toBeTruthy();
    expect(await screen.findByText("This email is already in use.")).toBeTruthy();
    expect(appState.current.refreshUser).not.toHaveBeenCalled();
    // The dialog stays open so the address can be corrected.
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("keeps the WhatsApp sending number on officer profiles", () => {
    appState.current.user = {
      ...baseUser,
      role: "officer",
      phone_number: "+255 712 345 678",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );

    renderPage();

    expect(screen.getByText("WhatsApp number")).toBeTruthy();
    expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "+255 712 345 678",
    );
    expect(screen.queryByText("Your activity")).toBeNull();
  });
});
