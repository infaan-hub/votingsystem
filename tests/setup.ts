// Tests run against the Postgres database in DATABASE_URL. Schema is applied
// with `prisma migrate deploy` (run once before the suite) and each test file
// starts from a clean slate via resetDb() in beforeEach hooks.

// Keep password hashing fast in tests (the production iteration count is
// overkill for unit tests; the algorithm/format stays identical).
process.env.PBKDF2_ITERATIONS = process.env.PBKDF2_ITERATIONS || "1000";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must point at a Postgres database before running tests.",
  );
}

export {};

const { PrismaClient } = await import("@/src/generated/prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });

(globalThis as typeof globalThis & { __prisma?: InstanceType<typeof PrismaClient> }).__prisma =
  client;
