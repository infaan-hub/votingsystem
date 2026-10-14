import { describe, expect, it } from "vitest";

import {
  DISMISSED_VISIBLE_MS,
  PROMPT_DISMISSAL_KEY,
  promptDecision,
  readDismissedAt,
  writeDismissedAt,
} from "@/src/lib/notifications/prompt";

/**
 * Pure decision rules for the notification-permission prompt. These tests
 * encode the UX contract: permission is only ever *offered* ("enable"), never
 * requested by this module; denied permission produces guidance instead of a
 * button that cannot work; dismissals suppress the card for the window.
 */
describe("PromptDecision", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_700_000_000_000;

  it("offers Enable when permission has not been requested yet", () => {
    expect(
      promptDecision({ supportStatus: "permission-required", hasSubscription: false, dismissedAt: null, now }),
    ).toBe("enable");
  });

  it("offers Enable when permission is granted but this device is unsubscribed", () => {
    expect(
      promptDecision({ supportStatus: "supported", hasSubscription: false, dismissedAt: null, now }),
    ).toBe("enable");
  });

  it("hides the prompt when the device is already subscribed", () => {
    expect(
      promptDecision({ supportStatus: "supported", hasSubscription: true, dismissedAt: null, now }),
    ).toBe("hidden");
  });

  it("never offers Enable when permission was denied — guidance instead", () => {
    const decision = promptDecision({
      supportStatus: "permission-denied",
      hasSubscription: false,
      dismissedAt: null,
      now,
    });
    expect(decision).toBe("denied-guidance");
    expect(decision).not.toBe("enable");
  });

  it("shows Home Screen guidance on iOS browsers outside the installed app", () => {
    expect(
      promptDecision({
        supportStatus: "requires-home-screen-install",
        hasSubscription: false,
        dismissedAt: null,
        now,
      }),
    ).toBe("install-guidance");
  });

  it("shows an honest compatibility message on unsupported browsers", () => {
    expect(
      promptDecision({ supportStatus: "unsupported", hasSubscription: false, dismissedAt: null, now }),
    ).toBe("unsupported-info");
  });

  it("respects a recent dismissal for every state", () => {
    for (const supportStatus of [
      "permission-required",
      "supported",
      "permission-denied",
      "requires-home-screen-install",
      "unsupported",
    ] as const) {
      expect(
        promptDecision({
          supportStatus,
          hasSubscription: false,
          dismissedAt: now - 2 * DAY,
          now,
        }),
      ).toBe("hidden");
    }
  });

  it("lets a dismissed prompt reappear only after the suppression window", () => {
    // One millisecond before the window closes: still hidden.
    expect(
      promptDecision({
        supportStatus: "permission-required",
        hasSubscription: false,
        dismissedAt: now - (DISMISSED_VISIBLE_MS - 1),
        now,
      }),
    ).toBe("hidden");
    // Window elapsed: the prompt may show again.
    expect(
      promptDecision({
        supportStatus: "permission-required",
        hasSubscription: false,
        dismissedAt: now - DISMISSED_VISIBLE_MS,
        now,
      }),
    ).toBe("enable");
  });

  it("stays hidden for subscribed devices regardless of dismissal history", () => {
    expect(
      promptDecision({
        supportStatus: "supported",
        hasSubscription: true,
        dismissedAt: now - DISMISSED_VISIBLE_MS - DAY,
        now,
      }),
    ).toBe("hidden");
  });
});

describe("PromptDismissalStorage", () => {
  it("is inert outside a browser (server rendering safety)", () => {
    // This suite runs in the node environment: window is undefined.
    expect(typeof window).toBe("undefined");
    expect(readDismissedAt()).toBeNull();
    expect(() => writeDismissedAt()).not.toThrow();
    expect(PROMPT_DISMISSAL_KEY).toBe("nexvote-push-prompt-dismissed-at");
  });
});
