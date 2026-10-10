import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { USER_INCLUDE } from "@/src/lib/auth";
import { castVote } from "@/src/lib/services";
import { ValidationError } from "@/src/lib/validation";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import {
  GET as categoriesListGET,
} from "@/src/app/api/categories/route";
import { POST as adminCategoriesPOST } from "@/src/app/api/admin/categories/route";
import {
  PATCH as adminCategoryPATCH,
  DELETE as adminCategoryDELETE,
} from "@/src/app/api/admin/categories/[pk]/route";

const HOUR = 60 * 60 * 1000;

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function makeAdmin() {
  const admin = await prisma.user.create({
    data: {
      username: "cat_admin",
      password: hashPassword("Admin123!"),
      role: "admin",
    },
  });
  return { admin, token: await createTokenFor(admin.id) };
}

describe("CategoryApiTests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lists active categories publicly without a token", async () => {
    await prisma.electionCategory.create({
      data: { name: "Corporate", slug: "corporate", isActive: true },
    });
    await prisma.electionCategory.create({
      data: { name: "Retired", slug: "retired", isActive: false },
    });
    const response = await call(categoriesListGET, jsonRequest("/api/categories/"));
    expect(response.status).toBe(200);
    const body = (await readJson(response)) as unknown as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].slug).toBe("corporate");
  });

  it("lets an admin create a category and derives a slug from the name", async () => {
    const { token } = await makeAdmin();
    const response = await call(
      adminCategoriesPOST,
      jsonRequest("/api/admin/categories/", {
        method: "POST",
        token,
        body: { name: "Neighborhood Council", description: "Local community elections." },
      }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.name).toBe("Neighborhood Council");
    expect(body.slug).toBe("neighborhood-council");
    expect(body.is_active).toBe(true);
  });

  it("rejects category creation from a non-admin", async () => {
    const voter = await prisma.user.create({
      data: { username: "not_admin", password: hashPassword("Pass1234!"), role: "student" },
    });
    const token = await createTokenFor(voter.id);
    const response = await call(
      adminCategoriesPOST,
      jsonRequest("/api/admin/categories/", {
        method: "POST",
        token,
        body: { name: "Sneaky" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a duplicate category name", async () => {
    const { token } = await makeAdmin();
    await prisma.electionCategory.create({ data: { name: "Duplicate", slug: "duplicate" } });
    const response = await call(
      adminCategoriesPOST,
      jsonRequest("/api/admin/categories/", {
        method: "POST",
        token,
        body: { name: "Duplicate" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.name).toBeDefined();
  });

  it("updates a category and re-derives its slug from a new name", async () => {
    const { token } = await makeAdmin();
    const category = await prisma.electionCategory.create({
      data: { name: "Old Name", slug: "old-name" },
    });
    const response = await call(
      adminCategoryPATCH,
      jsonRequest(`/api/admin/categories/${category.id}/`, {
        method: "PATCH",
        token,
        body: { name: "New Name", is_active: false },
      }),
      { pk: String(category.id) },
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.name).toBe("New Name");
    expect(body.slug).toBe("new-name");
    expect(body.is_active).toBe(false);
  });

  it("refuses to delete a category that elections still reference", async () => {
    const { token } = await makeAdmin();
    const category = await prisma.electionCategory.create({
      data: { name: "In Use", slug: "in-use" },
    });
    const now = Date.now();
    await prisma.election.create({
      data: {
        title: "Bound Election",
        slug: "bound-election",
        categoryId: category.id,
        campaignStartAt: new Date(now - HOUR),
        campaignEndAt: new Date(now + HOUR),
        votingStartAt: new Date(now - HOUR),
        votingEndAt: new Date(now + HOUR),
      },
    });
    const response = await call(
      adminCategoryDELETE,
      jsonRequest(`/api/admin/categories/${category.id}/`, { method: "DELETE", token }),
      { pk: String(category.id) },
    );
    expect(response.status).toBe(400);
    expect(await prisma.electionCategory.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it("deletes an unused category", async () => {
    const { token } = await makeAdmin();
    const category = await prisma.electionCategory.create({
      data: { name: "Disposable", slug: "disposable" },
    });
    const response = await call(
      adminCategoryDELETE,
      jsonRequest(`/api/admin/categories/${category.id}/`, { method: "DELETE", token }),
      { pk: String(category.id) },
    );
    expect(response.status).toBe(204);
    expect(await prisma.electionCategory.findUnique({ where: { id: category.id } })).toBeNull();
  });
});

describe("ConcurrentVoteTests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedRace() {
    const now = Date.now();
    const election = await prisma.election.create({
      data: {
        title: "Race Election",
        slug: "race-election",
        campaignStartAt: new Date(now - HOUR),
        campaignEndAt: new Date(now + HOUR),
        votingStartAt: new Date(now - HOUR),
        votingEndAt: new Date(now + HOUR),
        allowLiveResults: true,
      },
    });
    const position = await prisma.position.create({
      data: { electionId: election.id, name: "President", voterGroup: "all", maxWinners: 1 },
    });
    const candUsers = await Promise.all(
      ["cand_one", "cand_two"].map((username, index) =>
        prisma.user.create({
          data: { username, password: hashPassword("Pass1234!"), role: "student" },
        }).then((user) =>
          prisma.candidate.create({
            data: {
              userId: user.id,
              electionId: election.id,
              positionId: position.id,
              approved: true,
              featuredOrder: index,
            },
          }),
        ),
      ),
    );
    const voter = await prisma.user.create({
      data: { username: "racer", password: hashPassword("Pass1234!"), role: "student" },
    });
    const voterWithRelations = (await prisma.user.findUniqueOrThrow({
      where: { id: voter.id },
      include: USER_INCLUDE,
    }))!;
    return { election, position, candidates: candUsers, voterWithRelations };
  }

  it("persists exactly one vote when the same voter submits two concurrently", async () => {
    const { candidates, voterWithRelations } = await seedRace();
    const [a, b] = candidates;

    const results = await Promise.allSettled([
      castVote(voterWithRelations, a),
      castVote(voterWithRelations, b),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one wins; the loser fails with the normalized duplicate error.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ValidationError);
    expect(JSON.stringify(failure.reason.errorDict)).toContain("already voted");

    const stored = await prisma.vote.findMany({ where: { voterId: voterWithRelations.id } });
    expect(stored).toHaveLength(1);
  });
});