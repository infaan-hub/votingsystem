// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Only the auth context is mocked; the button itself is exercised against a
// fake Google Identity Services client and the real toast layer.
const signedInUser = {
  id: 3,
  username: "voter3",
  full_name: "Voter Three",
  email: "voter3@example.invalid",
  role: "voter",
  auth_provider: "google",
  photo_url: null,
};

const handleGoogleLogin = vi.fn();
vi.mock("@/src/components/AppProvider", () => ({
  useApp: () => ({ handleGoogleLogin }),
}));

import { GoogleSignInButton } from "@/src/components/google-sign-in-button";
import { ToastProvider } from "@/src/components/ui/toast";

type CodeClientConfig = {
  client_id: string;
  scope: string;
  ux_mode: "popup";
  callback: (response: { code?: string; error?: string }) => void;
};

type FakeGis = {
  requestCode: ReturnType<typeof vi.fn>;
  /** Last config handed to initCodeClient, once the component warmed up. */
  config: () => CodeClientConfig | null;
};

const configs: Array<CodeClientConfig | null> = [];

/** Stubs `window.google.accounts.oauth2` so no real GIS script is needed. */
function installFakeGis(): FakeGis {
  configs.length = 0;
  const requestCode = vi.fn();
  vi.stubGlobal("google", {
    accounts: {
      oauth2: {
        initCodeClient: (config: CodeClientConfig) => {
          configs.push(config);
          return { requestCode };
        },
      },
    },
  });
  return { requestCode, config: () => configs[configs.length - 1] ?? null };
}

function renderButton(props: Parameters<typeof GoogleSignInButton>[0] = {}) {
  return render(
    <ToastProvider>
      <GoogleSignInButton {...props} />
    </ToastProvider>,
  );
}

const ORIGINAL_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

beforeEach(() => {
  handleGoogleLogin.mockReset();
  handleGoogleLogin.mockResolvedValue(signedInUser);
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  configs.length = 0;
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = ORIGINAL_CLIENT_ID;
});

describe("GoogleSignInButton", () => {
  it("renders the brand mark next to the Sign in with Google label", () => {
    installFakeGis();
    renderButton();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("opens the Google popup and signs in with the returned code", async () => {
    const gis = installFakeGis();
    const onSuccess = vi.fn();
    renderButton({ onSuccess });

    // The popup client is warmed up on mount, before the tap.
    await waitFor(() => expect(gis.config()).not.toBeNull());
    expect(gis.config()?.client_id).toBe("test-client-id.apps.googleusercontent.com");
    expect(gis.config()?.ux_mode).toBe("popup");

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(gis.requestCode).toHaveBeenCalledTimes(1);

    gis.config()?.callback({ code: "one-time-code" });

    await waitFor(() => expect(handleGoogleLogin).toHaveBeenCalledWith({ code: "one-time-code" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(signedInUser));
    expect(await screen.findByText("Welcome back, Voter Three")).toBeTruthy();
  });

  it("reports a rejected sign-in as an error toast", async () => {
    const gis = installFakeGis();
    handleGoogleLogin.mockRejectedValueOnce(new Error("Google account email is not verified."));
    const onSuccess = vi.fn();
    renderButton({ onSuccess });

    await waitFor(() => expect(gis.config()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    gis.config()?.callback({ code: "rejected-code" });

    expect(await screen.findByText("Google account email is not verified.")).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("stays quiet when the person dismisses the Google popup", async () => {
    const gis = installFakeGis();
    renderButton();

    await waitFor(() => expect(gis.config()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    gis.config()?.callback({ error: "popup_closed_by_user" });

    expect(handleGoogleLogin).not.toHaveBeenCalled();
    expect(screen.queryByText(/Google sign-in failed/)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in with Google" }).getAttribute("disabled")).toBeNull();
  });

  it("explains the setup gap when the client id is not configured", async () => {
    const gis = installFakeGis();
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(await screen.findByText(/Google sign-in isn’t enabled/)).toBeTruthy();
    expect(gis.requestCode).not.toHaveBeenCalled();
    expect(handleGoogleLogin).not.toHaveBeenCalled();
  });
});
