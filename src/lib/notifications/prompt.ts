/**
 * Pure decision logic for the notification-permission prompt card.
 *
 * Kept free of browser APIs so the rules are unit-testable and the component
 * stays a thin renderer. A website cannot silently grant notification
 * permission — the browser/OS controls it — so this only decides *whether an
 * explanation or an enable button should be shown after a user interaction
 * with the app*, never whether permission is requested.
 */

export const PROMPT_DISMISSAL_KEY = "nexvote-push-prompt-dismissed-at";

/** A dismissal suppresses the card for 30 days; after that it may reappear. */
export const DISMISSED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

export type PromptSupportStatus =
  | "supported"
  | "permission-required"
  | "permission-denied"
  | "requires-home-screen-install"
  | "unsupported";

export type PromptDecision =
  /** Render nothing. */
  | "hidden"
  /** Permission granted-but-unsubscribed, or permission still to request: show Enable. */
  | "enable"
  /** Browser blocked notifications: guidance only, never another permission request. */
  | "denied-guidance"
  /** iOS Home Screen installation required before push can work. */
  | "install-guidance"
  /** Browser lacks the required APIs: honest compatibility message. */
  | "unsupported-info";

export function promptDecision(input: {
  supportStatus: PromptSupportStatus;
  hasSubscription: boolean;
  /** Timestamp (ms) of the user's last "Not Now"/"Got it", or null. */
  dismissedAt: number | null;
  /** Current time in ms (injectable for tests). */
  now?: number;
}): PromptDecision {
  const { supportStatus, hasSubscription, dismissedAt } = input;
  const now = input.now ?? Date.now();

  // Already subscribed on this device: nothing to ask. The header bell shows
  // the enabled state.
  if (hasSubscription && supportStatus === "supported") return "hidden";

  // A recent dismissal is respected for every state — a dismissed prompt must
  // not interrupt the user again until the window elapses.
  if (dismissedAt !== null && now - dismissedAt < DISMISSED_VISIBLE_MS) return "hidden";

  switch (supportStatus) {
    case "permission-required":
      return "enable";
    case "supported":
      // Permission already granted but this device has no subscription yet
      // (e.g. the subscription expired). Enabling here subscribes without a
      // second permission prompt.
      return "enable";
    case "permission-denied":
      return "denied-guidance";
    case "requires-home-screen-install":
      return "install-guidance";
    case "unsupported":
      return "unsupported-info";
    default:
      return "hidden";
  }
}

/** Read the stored dismissal timestamp (safe outside a browser). */
export function readDismissedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROMPT_DISMISSAL_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist a dismissal so the prompt stays quiet for the suppression window. */
export function writeDismissedAt(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROMPT_DISMISSAL_KEY, String(now));
  } catch {
    /* private mode / storage disabled: prompt simply reappears later */
  }
}
