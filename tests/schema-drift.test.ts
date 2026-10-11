import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";

/**
 * Regression guard for the production outage where pages rendered with
 * React error #441 ("An error occurred in the Server Components render").
 *
 * Root cause: `prisma/schema.prisma` declared `Candidate.partyId` and the
 * `Party`/`RatingCategory`/`CandidateRating`/`Opinion`/`OpinionVote` models,
 * but the two migrations that create them had never been applied to the
 * database. Prisma therefore threw P2022 ("column does not exist") during the
 * server render of `/`, `/feed`, and `/explore`.
 *
 * These tests fail whenever the committed migrations and the Prisma schema
 * disagree, so the same drift is caught before it reaches a deployment.
 */
describe("Database schema matches the Prisma schema", () => {
  const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "prisma", "migrations");

  function appliedMigrationNames(): string[] {
    return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  it("has applied every committed migration", async () => {
    const committed = appliedMigrationNames();
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    const appliedNames = new Set(applied.map((row) => row.migration_name));

    const missing = committed.filter((name) => !appliedNames.has(name));
    expect(
      missing,
      `Migrations exist on disk but were never applied to the database: ${missing.join(", ")}. ` +
        "Run `npm run db:deploy` against this database.",
    ).toEqual([]);
  });

  it("has the columns the generated client selects", async () => {
    const expected: Record<string, string[]> = {
      Candidate: ["partyId", "electionId", "positionId", "userId", "approved"],
      Vote: ["receiptCode", "idempotencyKey"],
      Election: ["slug", "status", "categoryId", "organizationId"],
    };

    for (const [table, columns] of Object.entries(expected)) {
      const rows = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      const present = new Set(rows.map((row) => row.column_name));
      const missing = columns.filter((column) => !present.has(column));
      expect(
        missing,
        `Table "${table}" is missing columns the Prisma client selects: ${missing.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("has the tables the generated client queries", async () => {
    const required = ["Party", "RatingCategory", "CandidateRating", "Opinion", "OpinionVote"];
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const present = new Set(rows.map((row) => row.table_name));
    const missing = required.filter((table) => !present.has(table));
    expect(
      missing,
      `Tables declared in schema.prisma are missing from the database: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("can read a Candidate through the relation the failing pages select", async () => {
    const election = await prisma.election.findFirst({
      include: {
        positions: {
          include: {
            candidates: {
              include: {
                party: true,
                user: { include: { department: true, section: true } },
                department: true,
                section: true,
                _count: { select: { votes: true } },
              },
            },
          },
        },
      },
    });

    // The query above is the one that threw P2022 in production. Reaching this
    // point means the columns it selects exist; the election may legitimately
    // be absent on an empty database.
    expect(election === null || election !== undefined).toBe(true);
  });
});
