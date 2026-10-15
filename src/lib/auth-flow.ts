/**
 * Client-safe helpers shared by the Login and OTP verification steps.
 * No server imports — this module is loaded in the browser bundle only.
 */

/** sessionStorage key holding the pending OTP challenge between pages. */
export const OTP_CHALLENGE_STORAGE_KEY = "nexvote-otp-challenge";

export type StoredOtpChallenge = { challengeId: number; expiresAt: string };

/** Sends each role to its own dashboard (or back to the guarded page). */
export function dashboardPathFor(role: string, next?: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  if (role === "admin") return "/admin";
  if (role === "officer") return "/officer";
  return "/dashboard";
}

/** Validates a `next` redirect target (same-origin path only). */
export function safeNextPath(next: string | null): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export function storeOtpChallenge(challenge: StoredOtpChallenge): void {
  try {
    window.sessionStorage.setItem(
      OTP_CHALLENGE_STORAGE_KEY,
      JSON.stringify(challenge),
    );
  } catch {
    /* private browsing: the page simply redirects back to login on reload */
  }
}

export function readOtpChallenge(): StoredOtpChallenge | null {
  try {
    const raw = window.sessionStorage.getItem(OTP_CHALLENGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOtpChallenge> | null;
    if (
      !parsed ||
      typeof parsed.challengeId !== "number" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    return { challengeId: parsed.challengeId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function clearOtpChallenge(): void {
  try {
    window.sessionStorage.removeItem(OTP_CHALLENGE_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
