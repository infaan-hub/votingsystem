// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The welcome page only reads the signed-in user and pushes routes; both are
// mocked so the test exercises the rendered copy, buttons and logo only.
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

type MockUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  auth_provider: string;
  photo_url: string | null;
} | null;

const appState = vi.hoisted(() => ({
  current: {
    user: null as MockUser,
    handleGoogleLogin: vi.fn(),
  },
}));
vi.mock("@/src/components/AppProvider", () => ({ useApp: () => appState.current }));

import WelcomePage from "@/src/app/welcome/page";
import { ToastProvider } from "@/src/components/ui/toast";

function renderWelcome() {
  return render(
    <ToastProvider>
      <WelcomePage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  // This deployment ships with Google sign-in disabled (empty client id).
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";
  appState.current.user = null;
  appState.current.handleGoogleLogin.mockReset();
  routerPush.mockReset();
});

afterEach(cleanup);

describe("welcome page", () => {
  it("drops the account-ready paragraph and the four onboarding steps", () => {
    renderWelcome();

    expect(screen.queryByText(/Your account is ready/)).toBeNull();
    expect(screen.queryByText("Verify your email")).toBeNull();
    expect(screen.queryByText("Browse elections")).toBeNull();
    expect(screen.queryByText("Campaigns run before voting opens")).toBeNull();
    expect(screen.queryByText("Results publish after voting closes")).toBeNull();
  });

  it("offers sign in, create account and Google, with the logo below the buttons", () => {
    renderWelcome();

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(
      "/register",
    );
    const googleButton = screen.getByRole("button", { name: "Sign in with Google" });
    expect(googleButton.querySelector("svg")).not.toBeNull();

    // The logo sits after the buttons in the card, using the real artwork.
    const logo = screen.getByAltText("NexVote");
    expect(logo.getAttribute("src")).toBe("/nexvote_logo.jpeg");
    expect(
      googleButton.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("greets a signed-in voter with dashboard links and no Google button", () => {
    appState.current.user = {
      id: 1,
      username: "voter1",
      full_name: "Voter One",
      email: "",
      role: "voter",
      auth_provider: "local",
      photo_url: null,
    };
    renderWelcome();

    expect(screen.getByRole("heading", { name: "Welcome, Voter One" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to my dashboard" }).getAttribute("href")).toBe(
      "/dashboard",
    );
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
    expect(screen.getByAltText("NexVote").getAttribute("src")).toBe("/nexvote_logo.jpeg");
  });

  it("explains the missing configuration instead of failing silently when Google is disabled", async () => {
    renderWelcome();

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(await screen.findByText(/Google sign-in isn’t enabled/)).toBeTruthy();
    expect(appState.current.handleGoogleLogin).not.toHaveBeenCalled();
  });
});
