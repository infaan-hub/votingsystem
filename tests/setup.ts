// Tests wipe every table between cases via resetDb(). They must never touch
// the production database, so the suite refuses to run unless TEST_DATABASE_URL
// is set and its database name ends in `_test`.
//
//   TEST_DATABASE_URL="postgresql://.../voting_test?sslmode=require" npm test

// Keep password hashing fast in tests (the production iteration count is
// overkill for unit tests; the algorithm/format stays identical).
process.env.PBKDF2_ITERATIONS = process.env.PBKDF2_ITERATIONS || "1000";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set.\n" +
      "Tests delete every row in every table, so they must not run against production.\n" +
      'Point TEST_DATABASE_URL at a throwaway database whose name ends in `_test`, e.g.\n' +
      '  TEST_DATABASE_URL="postgresql://user:pass@host/voting_test?sslmode=require" npm test',
  );
}

let dbName: string | null = null;
try {
  dbName = new URL(testUrl).pathname.replace(/^\//, "").split("/")[0] || null;
} catch {
  dbName = null;
}
if (!dbName || !dbName.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against database "${dbName}".\n` +
      "TEST_DATABASE_URL must point at a database whose name ends in `_test`.",
  );
}

// Route every query at the test database, including the app's own client.
process.env.DATABASE_URL = testUrl;

export {};

const { PrismaClient } = await import("@/src/generated/prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });

(globalThis as typeof globalThis & { __prisma?: InstanceType<typeof PrismaClient> }).__prisma =
  client;
