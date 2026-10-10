import { PrismaClient } from "@/src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

// Tests truncate every table, so they must never open a production database.
// tests/setup.ts overrides DATABASE_URL with TEST_DATABASE_URL and pins
// __prisma; this guard only fires if db.ts is imported outside that path.
if (
  process.env.VITEST &&
  DATABASE_URL &&
  !/\/[^/]*_test(\?|$)/.test(DATABASE_URL)
) {
  throw new Error(
    "Refusing to open a non-_test database from a test process. " +
      "Set TEST_DATABASE_URL to a database whose name ends in `_test`.",
  );
}

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = globalForPrisma.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
