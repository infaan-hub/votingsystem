import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { POST as adminElectionPOST } from "@/src/app/api/admin/elections/route";
import {
  DELETE as adminElectionDELETE,
  PATCH as adminElectionPATCH,
} from "@/src/app/api/admin/elections/[pk]/route";
import { POST as officerRegisterPOST } from "@/src/app/api/admin/officers/route";
import { GET as officerElectionsGET } from "@/src/app/api/officer/elections/route";
import { GET as votersGET } from "@/src/app/api/elections/[pk]/voters/route";

const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

async function makeUser(name: string, role: "voter" | "officer" | "admin") {
  seq += 1;
  return prisma.user.create({
    data: {
      username: `${name}_${seq}`,
      email: `${name}_${seq}@example.test`,
      firstName: "Test",
      lastName: `User${seq}`,
      role,
      isActive: true,
      password: hashPassword("Pass1234!"),
    },
  });
}

type ElectionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "NOMINATIONS"
  | "READY"
  | "OPEN"
  | "CLOSED"
  | "RESULTS_PUBLISHED"
  | "ARCHIVED";

async function makeElection(
  options: { status?: ElectionStatus; createdBy?: number | null } = {},
) {
  seq += 1;
  const now = Date.now();
  return prisma.election.create({
    data: {
      title: `Admin Administration Test ${seq}`,
      slug: `admin-administration-test-${seq}`,
      status: options.status ?? "DRAFT",
      isPublished: false,
      campaignStartAt: new Date(now - DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now + 2 * DAY),
      votingEndAt: new Date(now + 9 * DAY),
      ...(options.createdBy !== undefined ? { createdBy: options.createdBy } : {}),
    },
  });
}

/** Establish body with a consistent window (voting starts after campaign end). */
function establishBody(title: string, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title,
    campaign_start_at: new Date(now - 7 * DAY).toISOString(),
    campaign_end_at: new Date(now + DAY).toISOString(),
    voting_start_at: new Date(now + 2 * DAY).toISOString(),
    voting_end_at: new Date(now + 9 * DAY).toISOString(),
    ...extra,
  };
}

function pkParams(id: number) {
  return { pk: String(id) };
}

describe("admin election administration: establish, operate, delete", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("registers officers without a scope, then scopes exactly one election on establish", async () => {
    const admin = await makeUser("root", "admin");
    const officer = await makeUser("oper", "officer");
    const adminToken = await createTokenFor(admin.id);

    // Registration creates the account only — no election, no scope.
    const registered = await call(
      officerRegisterPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: officer.username, email: officer.email },
      }),
    );
    expect(registered.status).toBe(201);
    const registeredBody = (await registered.json()) as { role: string; id: number };
    expect(registeredBody.role).toBe("officer");
    expect(await prisma.officerAssignment.count({ where: { officerId: officer.id } })).toBe(0);

    // A freshly registered officer operates nothing — never every election.
    const officerToken = await createTokenFor(officer.id);
    const before = await call(
      officerElectionsGET,
      jsonRequest("/api/officer/elections", { token: officerToken }),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual([]);

    // Establish an election and select its operator in one step.
    seq += 1;
    const established = await call(
      adminElectionPOST,
      jsonRequest("/api/admin/elections", {
        method: "POST",
        token: adminToken,
        body: establishBody(`Established ${seq}`, { officer_id: officer.id }),
      }),
    );
    expect(established.status).toBe(201);
    const election = (await established.json()) as { id: number; title: string };

    const assignment = await prisma.officerAssignment.findFirst({
      where: { officerId: officer.id, isActive: true, electionId: election.id },
    });
    expect(assignment?.scope).toBe("election");

    // The officer sees exactly that election and nothing else.
    const after = await call(
      officerElectionsGET,
      jsonRequest("/api/officer/elections", { token: officerToken }),
    );
    const managed = (await after.json()) as Array<{ id: number }>;
    expect(managed.map((row) => row.id)).toEqual([election.id]);
  });

  it("rejects scope fields at registration outright", async () => {
    const admin = await makeUser("root", "admin");
    const adminToken = await createTokenFor(admin.id);

    const allScope = await call(
      officerRegisterPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "legacy_all", email: "legacy-all@example.test", scope: "all" },
      }),
    );
    expect(allScope.status).toBe(400);
    expect(JSON.stringify(await allScope.json())).toContain("establish or edit an election");

    const electionScope = await call(
      officerRegisterPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "legacy_scoped", email: "legacy-scoped@example.test", scope: "election" },
      }),
    );
    expect(electionScope.status).toBe(400);

    // Rejected before any account was created.
    expect(
      await prisma.user.count({ where: { username: { startsWith: "legacy_" } } }),
    ).toBe(0);
  });

  it("reassigns or clears the operator on edit, one election per officer", async () => {
    const admin = await makeUser("root", "admin");
    const officerA = await makeUser("opa", "officer");
    const officerB = await makeUser("opb", "officer");
    const adminToken = await createTokenFor(admin.id);
    const election = await makeElection();
    const other = await makeElection();
    const url = (id: number) => `/api/admin/elections/${id}`;

    // Officer A operates the election.
    const assignA = await call(
      adminElectionPATCH,
      jsonRequest(url(election.id), {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: officerA.id },
      }),
      pkParams(election.id),
    );
    expect(assignA.status).toBe(200);
    expect(
      await prisma.officerAssignment.count({
        where: { officerId: officerA.id, isActive: true, electionId: election.id },
      }),
    ).toBe(1);

    // One election per officer: A cannot also operate a second election.
    const busy = await call(
      adminElectionPATCH,
      jsonRequest(url(other.id), {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: officerA.id },
      }),
      pkParams(other.id),
    );
    expect(busy.status).toBe(400);
    expect(JSON.stringify(await busy.json())).toContain("already operates");

    // Swapping to officer B revokes A's assignment.
    const swap = await call(
      adminElectionPATCH,
      jsonRequest(url(election.id), {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: officerB.id },
      }),
      pkParams(election.id),
    );
    expect(swap.status).toBe(200);
    expect(
      await prisma.officerAssignment.count({ where: { officerId: officerA.id, isActive: true } }),
    ).toBe(0);

    // A loses access immediately; B gains it.
    const tokenA = await createTokenFor(officerA.id);
    const tokenB = await createTokenFor(officerB.id);
    const deniedA = await call(
      votersGET,
      jsonRequest(`/api/elections/${election.id}/voters`, { token: tokenA }),
      pkParams(election.id),
    );
    expect(deniedA.status).toBe(403);
    const allowedB = await call(
      votersGET,
      jsonRequest(`/api/elections/${election.id}/voters`, { token: tokenB }),
      pkParams(election.id),
    );
    expect(allowedB.status).toBe(200);

    // Clearing the operator revokes B as well.
    const cleared = await call(
      adminElectionPATCH,
      jsonRequest(url(election.id), {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: null },
      }),
      pkParams(election.id),
    );
    expect(cleared.status).toBe(200);
    expect(
      await prisma.officerAssignment.count({ where: { officerId: officerB.id, isActive: true } }),
    ).toBe(0);
    const deniedB = await call(
      votersGET,
      jsonRequest(`/api/elections/${election.id}/voters`, { token: tokenB }),
      pkParams(election.id),
    );
    expect(deniedB.status).toBe(403);
  });

  it("refuses to give an officer a second election at establishment", async () => {
    const admin = await makeUser("root", "admin");
    const officer = await makeUser("busy", "officer");
    const adminToken = await createTokenFor(admin.id);

    seq += 1;
    const first = await call(
      adminElectionPOST,
      jsonRequest("/api/admin/elections", {
        method: "POST",
        token: adminToken,
        body: establishBody(`First ${seq}`, { officer_id: officer.id }),
      }),
    );
    expect(first.status).toBe(201);

    seq += 1;
    const second = await call(
      adminElectionPOST,
      jsonRequest("/api/admin/elections", {
        method: "POST",
        token: adminToken,
        body: establishBody(`Second ${seq}`, { officer_id: officer.id }),
      }),
    );
    expect(second.status).toBe(400);
    expect(JSON.stringify(await second.json())).toContain("already operates");
  });

  it("keeps a legacy platform-wide assignment from granting access", async () => {
    const officer = await makeUser("legacy", "officer");
    const election = await makeElection(); // not owned, not assigned
    await prisma.officerAssignment.create({
      data: { officerId: officer.id, scope: "all" },
    });

    const token = await createTokenFor(officer.id);
    const list = await call(
      officerElectionsGET,
      jsonRequest("/api/officer/elections", { token }),
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);
    expect(election.id).toBeGreaterThan(0);
  });

  it("lets an admin delete an election, but never one with cast votes", async () => {
    const admin = await makeUser("root", "admin");
    const voter = await makeUser("balloter", "voter");
    const adminToken = await createTokenFor(admin.id);
    const election = await makeElection();

    // Record a ballot directly (voter + position + candidate + vote).
    const position = await prisma.position.create({
      data: { electionId: election.id, name: "President", order: 0 },
    });
    const candidate = await prisma.candidate.create({
      data: { electionId: election.id, positionId: position.id, userId: voter.id, approved: true },
    });
    await prisma.vote.create({
      data: {
        voterId: voter.id,
        electionId: election.id,
        positionId: position.id,
        candidateId: candidate.id,
      },
    });

    const refused = await call(
      adminElectionDELETE,
      jsonRequest(`/api/admin/elections/${election.id}`, {
        method: "DELETE",
        token: adminToken,
      }),
      pkParams(election.id),
    );
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await refused.json())).toContain("archive");
    expect(await prisma.election.findUnique({ where: { id: election.id } })).not.toBeNull();

    // Without the ballot, the same deletion succeeds and cascades dependents.
    await prisma.vote.deleteMany({});
    const deleted = await call(
      adminElectionDELETE,
      jsonRequest(`/api/admin/elections/${election.id}`, {
        method: "DELETE",
        token: adminToken,
      }),
      pkParams(election.id),
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.election.findUnique({ where: { id: election.id } })).toBeNull();
    expect(await prisma.position.count({ where: { electionId: election.id } })).toBe(0);
  });

  it("only administrators may delete an election", async () => {
    const admin = await makeUser("root", "admin");
    const officer = await makeUser("oper", "officer");
    const voter = await makeUser("vv", "voter");
    const election = await makeElection();
    const url = `/api/admin/elections/${election.id}`;

    const byOfficer = await call(
      adminElectionDELETE,
      jsonRequest(url, { method: "DELETE", token: await createTokenFor(officer.id) }),
      pkParams(election.id),
    );
    expect(byOfficer.status).toBe(403);

    const byVoter = await call(
      adminElectionDELETE,
      jsonRequest(url, { method: "DELETE", token: await createTokenFor(voter.id) }),
      pkParams(election.id),
    );
    expect(byVoter.status).toBe(403);

    const anonymous = await call(
      adminElectionDELETE,
      jsonRequest(url, { method: "DELETE" }),
      pkParams(election.id),
    );
    expect(anonymous.status).toBe(401);

    expect(admin.id).toBeGreaterThan(0);
    expect(await prisma.election.findUnique({ where: { id: election.id } })).not.toBeNull();
  });
});
