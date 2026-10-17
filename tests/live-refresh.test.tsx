// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { emitLiveUpdate, useLiveRefresh } from "@/src/lib/live";

function Probe({
  onRefresh,
  intervalMs,
  minGapMs,
}: {
  onRefresh: () => void;
  intervalMs?: number;
  minGapMs?: number;
}) {
  useLiveRefresh(onRefresh, { intervalMs, minGapMs });
  return null;
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
}

describe("useLiveRefresh", () => {
  beforeEach(() => {
    setVisibility("visible");
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes when a live update fires and throttles bursts", () => {
    const refresh = vi.fn();
    render(<Probe onRefresh={refresh} minGapMs={50} />);

    emitLiveUpdate("notification");
    emitLiveUpdate("notification");
    emitLiveUpdate("notification");

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on regain even after a throttled burst, and skips while hidden", () => {
    const refresh = vi.fn();
    render(<Probe onRefresh={refresh} minGapMs={50} />);

    setVisibility("hidden");
    emitLiveUpdate("notification");
    expect(refresh).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("runs the safety interval while the tab is visible", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    render(<Probe onRefresh={refresh} intervalMs={1_000} minGapMs={0} />);

    vi.advanceTimersByTime(3_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does not run the interval while hidden", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    render(<Probe onRefresh={refresh} intervalMs={1_000} minGapMs={0} />);

    setVisibility("hidden");
    vi.advanceTimersByTime(3_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
