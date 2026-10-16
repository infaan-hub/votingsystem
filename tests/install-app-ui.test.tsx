// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  INSTALL_BADGE_DISMISSAL_KEY,
  InstallAppProvider,
  InstallAppSidebarItem,
} from "@/src/components/install-app";
import { ToastProvider } from "@/src/components/ui/toast";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const ORIGINAL_USER_AGENT = navigator.userAgent;

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
}

/** jsdom has no matchMedia; the component reads it for display-mode. */
function stubMatchMedia(options: { standalone?: boolean } = {}) {
  const { standalone = false } = options;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone ? query.includes("display-mode: standalone") : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

type PromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: string }>;
};

function makePromptEvent(outcome: "accepted" | "dismissed"): PromptEvent {
  return Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  }) as PromptEvent;
}

function renderInstall() {
  return render(
    <ToastProvider>
      <InstallAppProvider>
        <InstallAppSidebarItem />
      </InstallAppProvider>
    </ToastProvider>,
  );
}

describe("install app prompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "userAgent", {
      value: ORIGINAL_USER_AGENT,
      configurable: true,
    });
    window.localStorage.clear();
  });

  it("shows the right-edge badge and the sidebar entry while not installed", async () => {
    renderInstall();
    expect(await screen.findByTestId("install-app-badge")).toBeTruthy();
    expect(screen.getByTestId("install-app-sidebar-item")).toBeTruthy();
  });

  it("renders nothing while the app already runs installed", async () => {
    stubMatchMedia({ standalone: true });
    renderInstall();
    await waitFor(() => expect(screen.queryByTestId("install-app-sidebar-item")).toBeNull());
    expect(screen.queryByTestId("install-app-badge")).toBeNull();
  });

  it("keeps the badge hidden when a dismissal was recorded earlier", async () => {
    window.localStorage.setItem(INSTALL_BADGE_DISMISSAL_KEY, "1");
    renderInstall();
    await waitFor(() => expect(screen.queryByTestId("install-app-badge")).toBeNull());
    expect(screen.getByTestId("install-app-sidebar-item")).toBeTruthy();
  });

  it("walks iPhone users through the Share sheet with no download button", async () => {
    setUserAgent(IPHONE_UA);
    renderInstall();
    fireEvent.click(await screen.findByTestId("install-app-badge"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Add to Home Screen/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Download app" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByTestId("install-app-badge")).toBeNull());
    expect(window.localStorage.getItem(INSTALL_BADGE_DISMISSAL_KEY)).toBe("1");
    // The sidebar row remains the permanent entry point, and it re-opens the
    // same dialog even after the badge is gone.
    expect(screen.getByTestId("install-app-sidebar-item")).toBeTruthy();
    fireEvent.click(screen.getByTestId("install-app-sidebar-item"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("triggers the captured install prompt on Android and hides everything once accepted", async () => {
    setUserAgent(ANDROID_UA);
    renderInstall();

    const event = makePromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(await screen.findByTestId("install-app-badge"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Download app" }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByTestId("install-app-badge")).toBeNull();
      expect(screen.queryByTestId("install-app-sidebar-item")).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains desktop installation and falls back to manual steps without a prompt", async () => {
    renderInstall();
    fireEvent.click(await screen.findByTestId("install-app-badge"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/desktop app/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Download app" }));

    expect(await within(dialog).findByText(/has not offered an install prompt/)).toBeTruthy();
  });
});
