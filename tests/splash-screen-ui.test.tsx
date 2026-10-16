// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { SplashScreen, SPLASH_MS } from "@/src/components/splash-screen";
import tenant from "@/config/tenant";

describe("SplashScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("covers the app on load and clears itself after three seconds", () => {
    const { container } = render(<SplashScreen />);

    expect(screen.getByText(tenant.name)).toBeTruthy();

    // 3s: the fade starts, the overlay is still mounted while it runs.
    act(() => {
      vi.advanceTimersByTime(SPLASH_MS);
    });
    expect(screen.queryByText(tenant.name)).toBeTruthy();

    // After the fade it unmounts completely and the app is interactive.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.innerHTML).toBe("");
  });

  it("keeps timers that fire early from leaving the splash mounted", () => {
    const { container } = render(<SplashScreen />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText(tenant.name)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(SPLASH_MS + 600);
    });
    expect(container.innerHTML).toBe("");
  });
});
