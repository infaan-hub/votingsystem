/**
 * First-run onboarding state.
 *
 * Onboarding exists to get a brand-new account's *device* ready for
 * notifications — browsers only open the permission dialog from a user
 * gesture, so the ask is part of a deliberate flow instead of hoping the user
 * finds the bell later. Completion is therefore tracked per browser + account:
 * a user who already finished on their phone is still walked through once on a
 * laptop, where push is device-specific.
 *
 * When storage is unavailable the flow is treated as complete — repeating the
 * screen forever because we cannot remember it would be worse than skipping it.
 */

export const ONBOARDING_STORAGE_KEY = "nexvote-onboarded";

function storageKey(userId: number): string {
  return `${ONBOARDING_STORAGE_KEY}-u${userId}`;
}

/** Accounts that finished during this page session (covers blocked storage). */
const completedThisSession = new Set<number>();

export function isOnboardingComplete(userId: number): boolean {
  if (completedThisSession.has(userId)) return true;
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    /* Storage unavailable (private mode): never trap the user in the flow. */
    return true;
  }
}

export function markOnboardingComplete(userId: number): void {
  completedThisSession.add(userId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), "1");
  } catch {
    /* The in-memory set above already keeps the redirect gate quiet. */
  }
}
