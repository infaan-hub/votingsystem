/**
 * Constants shared by the server-side OTP flow and the verification page.
 * This module must stay free of imports so it is safe to load from both the
 * browser bundle and the Node runtime.
 */

/** Length of the one-time login code. */
export const OTP_LENGTH = 6;
/** How long a code stays valid. */
export const OTP_TTL_MS = 5 * 60_000;
/** Minimum gap between code resends for the same challenge. */
export const OTP_RESEND_COOLDOWN_MS = 60_000;
/** Where the push notification lands when the user taps it. */
export const OTP_TARGET_URL = "/otp-verification";
