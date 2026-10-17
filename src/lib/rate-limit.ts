/**
 * Tiny in-process attempt limiter for the auth endpoints.
 *
 * Windows are per key (normally the client IP). `record` is called on failed
 * attempts — or on every request when the endpoint is rate-limited rather than
 * failure-limited — and `clear` on success, so a busy shared address never
 * locks out a sign-in that just worked. This is a per-instance guard; a
 * durable edge limiter is the long-term home for it.
 */
export type AttemptLimiter = {
  /** True when `key` has spent its budget in the current window. */
  limited(key: string): boolean;
  /** Records one attempt under `key`. */
  record(key: string): void;
  /** Forgets `key` entirely (used after a success). */
  clear(key: string): void;
};

const MAX_KEYS = 4096;

export function createAttemptLimiter(options: {
  max: number;
  windowMs: number;
}): AttemptLimiter {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number): void {
    if (attempts.size < MAX_KEYS) return;
    for (const [key, entry] of attempts) {
      if (entry.resetAt < now) attempts.delete(key);
    }
    // A pathological spray of distinct keys still must not grow without
    // bound; dropping every window is safe because they are all short-lived.
    if (attempts.size >= MAX_KEYS) attempts.clear();
  }

  return {
    limited(key) {
      const entry = attempts.get(key);
      if (!entry || entry.resetAt < Date.now()) return false;
      return entry.count >= options.max;
    },
    record(key) {
      const now = Date.now();
      sweep(now);
      const entry = attempts.get(key);
      if (!entry || entry.resetAt < now) {
        attempts.set(key, { count: 1, resetAt: now + options.windowMs });
        return;
      }
      entry.count += 1;
    },
    clear(key) {
      attempts.delete(key);
    },
  };
}
