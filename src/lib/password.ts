import crypto from "node:crypto";

const DEFAULT_ITERATIONS = 720000;

function iterations(): number {
  const configured = Number(process.env.PBKDF2_ITERATIONS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ITERATIONS;
}

function randomSalt(length = 12): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  let salt = "";
  for (let i = 0; i < length; i += 1) {
    salt += alphabet[bytes[i] % alphabet.length];
  }
  return salt;
}

/** Produces a `pbkdf2_sha256$iterations$salt$hash` digest. */
export function hashPassword(password: string): string {
  const salt = randomSalt();
  const count = iterations();
  const derived = crypto.pbkdf2Sync(password, salt, count, 32, "sha256");
  return `pbkdf2_sha256$${count}$${salt}$${derived.toString("base64")}`;
}

/** Unusable password marker (`!` + random suffix) — never matches a guess. */
export function unusablePassword(): string {
  const bytes = crypto.randomBytes(30);
  return `!${bytes.toString("base64url")}`;
}

/** Verifies a password against any `pbkdf2_sha256` digest. */
export function verifyPassword(password: string, encoded: string | null | undefined): boolean {
  if (!encoded) return false;
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [algorithm, iterationsRaw, salt, hashRaw] = parts;
  if (algorithm !== "pbkdf2_sha256") return false;
  const count = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(count) || count <= 0) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashRaw, "base64");
  } catch {
    return false;
  }
  if (!expected.length) return false;

  const actual = crypto.pbkdf2Sync(password, salt, count, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
