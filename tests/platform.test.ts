import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { isEligibleToVote } from "@/src/lib/eligibility";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { POST as contactPOST } from "@/src/app/api/contact/route";
import { PATCH as contactPATCH } from "@/src/app/api/admin/contacts/[pk]/route";
import { GET as adminContactsGET } from "@/src/app/api/admin/contacts/route";
import { GET as auditGET } from "@/src/app/api/admin/audit-logs/route";
import { POST as assignOfficerPOST } from "@/src/app/api/admin/officers/route";
import { PATCH as adminElectionPATCH } from "@/src/app/api/admin/elections/[pk]/route";
import {
  GET as officerElectionsGET,
  POST as officerElectionsPOST,
} from "@/src/app/api/officer/elections/route";
import { PATCH as officerElectionPATCH } from "@/src/app/api/officer/elections/[pk]/route";
import { GET as categoriesGET } from "@/src/app/api/categories/route";
import {
  GET as votersGET,
  POST as votersPOST,
} from "@/src/app/api/elections/[pk]/voters/route";
import { POST as shareTokenPOST } from "@/src/app/api/elections/[pk]/share-token/route";
import { GET as publicElectionGET } from "@/src/app/api/elections/public/[slug]/route";
import { POST as officerCampaignsPOST } from "@/src/app/api/officer/campaigns/route";
import { GET as publicCampaignsGET } from "@/src/app/api/campaigns/route";
import { PATCH as adminCampaignPATCH } from "@/src/app/api/admin/campaigns/[pk]/route";
import { POST as resultsActionPOST } from "@/src/app/api/admin/elections/[pk]/results/route";
import { GET as electionResultsGET } from "@/src/app/api/elections/[pk]/results/route";
import { GET as adminVotesGET } from "@/src/app/api/admin/votes/route";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function readJson(response: Response) {
  return (await response.json()) as Record<string, never>;
}

type Seed = {
  adminId: number;
  officerId: number;
  voterId: number;
  electionId: number;
  electionSlug: string;
  positionId: number;
  candidateId: number;
};

async function seedPlatform(): Promise<Seed> {
  const admin = await prisma.user.create({
    data: {
      username: "root-admin",
      email: "root@example.test",
      firstName: "Roo",
      lastName: "Tadmin",
      role: "admin",
      password: hashPassword("correct-horse-battery"),
    },
  });
  const officer = await prisma.user.create({
    data: {
      username: "ReturningOfficer",
      email: "officer@example.test",
      firstName: "Olive",
      lastName: "Cer",
      role: "voter",
      password: hashPassword("correct-horse-battery"),
    },
  });
  const voter = await prisma.user.create({
    data: {
      username: "voter-one",
      email: "voter@example.test",
      firstName: "Vee",
      lastName: "oter",
      role: "voter",
      password: hashPassword("correct-horse-battery"),
    },
  });

  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: "Platform Test Election",
      slug: "platform-test-election",
      description: "Exercises the new platform APIs.",
      status: "DRAFT",
      isPublished: false,
      visibility: "public",
      eligibilityPolicy: "registered",
      campaignStartAt: new Date(now - DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + HOUR),
      createdBy: admin.id,
    },
  });
  const position = await prisma.position.create({
    data: { electionId: election.id, name: "President", order: 0 },
  });
  const candidate = await prisma.candidate.create({
    data: {
      electionId: election.id,
      positionId: position.id,
      userId: voter.id,
      slogan: "Test first",
      approved: true,
    },
  });

  return {
    adminId: admin.id,
    officerId: officer.id,
    voterId: voter.id,
    electionId: election.id,
    electionSlug: election.slug,
    positionId: position.id,
    candidateId: candidate.id,
  };
}

describe("platform: contact, requests, audit", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("accepts an anonymous contact message and exposes it only to admins", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const voterToken = await createTokenFor(seed.voterId);

    const created = await call(
      contactPOST,
      jsonRequest("/api/contact", {
        method: "POST",
        body: {
          name: "Concerned Voter",
          email: "voter@example.test",
          subject: "Ballot access",
          message: "How do I confirm my registration before voting opens?",
        },
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = await readJson(created);
    expect(createdBody.status).toBe("NEW");

    const denied = await call(adminContactsGET, jsonRequest("/api/admin/contacts", { token: voterToken }));
    expect(denied.status).toBe(403);

    const listed = await call(adminContactsGET, jsonRequest("/api/admin/contacts", { token: adminToken }));
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]!.subject).toBe("Ballot access");

    const patched = await call(
      contactPATCH,
      jsonRequest(`/api/admin/contacts/${list[0]!.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { status: "RESOLVED" },
      }),
      { pk: String(list[0]!.id) },
    );
    expect(patched.status).toBe(200);
    expect((await readJson(patched)).status).toBe("RESOLVED");

    const audit = await call(auditGET, jsonRequest("/api/admin/audit-logs", { token: adminToken }));
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as { results: Array<{ action: string }> };
    expect(auditBody.results.some((row) => row.action === "contact.create")).toBe(true);
  });

});

describe("platform: officer scope, voters, share links", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("assigns an officer, scopes their elections, and manages the voter list", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const officerToken = await createTokenFor(seed.officerId);
    const strangerToken = await createTokenFor(seed.voterId);

    // Registration creates the account only — no election is chosen.
    const assigned = await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: {
          username: "ReturningOfficer",
          email: "officer@example.test",
          whatsapp_phone: "+255712345678",
        },
      }),
    );
    expect(assigned.status).toBe(201);
    const promoted = await prisma.user.findUnique({ where: { id: seed.officerId } });
    expect(promoted?.role).toBe("officer");
    expect(promoted?.phoneNumber).toBe("+255712345678");

    // Scope comes from election administration: the admin selects the officer
    // as the operator, and the officer then sees exactly that election.
    const scoped = await call(
      adminElectionPATCH,
      jsonRequest(`/api/admin/elections/${seed.electionId}`, {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: seed.officerId },
      }),
      { pk: String(seed.electionId) },
    );
    expect(scoped.status).toBe(200);

    const officerElections = await call(
      officerElectionsGET,
      jsonRequest("/api/officer/elections", { token: officerToken }),
    );
    expect(officerElections.status).toBe(200);
    const managed = (await officerElections.json()) as Array<{ id: number }>;
    expect(managed.map((row) => row.id)).toContain(seed.electionId);

    const denied = await call(
      votersGET,
      jsonRequest(`/api/elections/${seed.electionId}/voters`, { token: strangerToken }),
      { pk: String(seed.electionId) },
    );
    expect(denied.status).toBe(403);

    const added = await call(
      votersPOST,
      jsonRequest(`/api/elections/${seed.electionId}/voters`, {
        method: "POST",
        token: officerToken,
        body: { user_ids: [seed.voterId], identifiers: ["S12345", "s12345"], label: "Year 3" },
      }),
      { pk: String(seed.electionId) },
    );
    expect(added.status).toBe(200);
    const counts = (await added.json()) as { added: number; skipped: number; total: number };
    expect(counts.added).toBe(2);
    expect(counts.skipped).toBe(1);
    expect(counts.total).toBe(2);

    const listed = await call(
      votersGET,
      jsonRequest(`/api/elections/${seed.electionId}/voters`, { token: officerToken }),
      { pk: String(seed.electionId) },
    );
    const rows = (await listed.json()) as Array<{ unique_key: string; user: { id: number } | null }>;
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.user?.id === seed.voterId)).toBe(true);
    expect(rows.every((row) => !row.unique_key.includes("S12345"))).toBe(true);
    const stored = await prisma.electionVoter.findMany({ where: { electionId: seed.electionId } });
    expect(stored.some((row) => row.uniqueKey.startsWith("h:"))).toBe(true);
    expect(stored.some((row) => row.uniqueKey.includes("S12345"))).toBe(false);
  });

  it("creates an officer election live — no draft, no admin approval — with the voter allow-list", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const officerToken = await createTokenFor(seed.officerId);

    const assigned = await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "ReturningOfficer", email: "officer@example.test" },
      }),
    );
    expect(assigned.status).toBe(201);

    const now = Date.now();
    const created = await call(
      officerElectionsPOST,
      jsonRequest("/api/officer/elections", {
        method: "POST",
        token: officerToken,
        body: {
          title: "Officer Created Election",
          description: "Born open — nobody approves it.",
          voting_start_at: new Date(now + HOUR).toISOString(),
          voting_end_at: new Date(now + 2 * DAY).toISOString(),
          capacity_mode: "restricted",
          max_voters: null, // form sends explicit null for "no cap" — must not 400
          allowed_voters: ["voter@example.test", "ReturningOfficer", "ghost@example.test"],
        },
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: number;
      status: string;
      is_published: boolean;
      voters_added: number;
      unmatched_voters: string[];
    };
    expect(body.status).toBe("OPEN");
    expect(body.is_published).toBe(true);
    expect(body.voters_added).toBe(2);
    expect(body.unmatched_voters).toEqual(["ghost@example.test"]);

    const row = await prisma.election.findUnique({ where: { id: body.id } });
    expect(row?.status).toBe("OPEN");
    expect(row?.isPublished).toBe(true);
    expect(row?.eligibilityPolicy).toBe("voter_list");

    const voters = await prisma.electionVoter.findMany({ where: { electionId: body.id } });
    expect(voters).toHaveLength(2);
    expect(voters.every((voter) => voter.uniqueKey.startsWith("u:"))).toBe(true);
    expect(voters.map((voter) => voter.userId).sort()).toEqual(
      [seed.officerId, seed.voterId].sort(),
    );

    // A user who is not on the allow-list cannot vote in this election.
    const stranger = await prisma.user.create({
      data: {
        username: "stranger-voter",
        email: "stranger@example.test",
        firstName: "S",
        lastName: "Tranger",
        role: "voter",
        password: hashPassword("correct-horse-battery"),
      },
    });
    const strangerFull = await prisma.user.findUnique({
      where: { id: stranger.id },
      include: { department: true, section: { include: { department: true } } },
    });
    expect(await isEligibleToVote(row!, strangerFull!)).toBe(false);
  });

  it("files an officer election under the category the officer picks", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const officerToken = await createTokenFor(seed.officerId);

    const assigned = await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "ReturningOfficer", email: "officer@example.test" },
      }),
    );
    expect(assigned.status).toBe(201);

    const [studentUnion, staffUnion] = await Promise.all([
      prisma.electionCategory.create({
        data: {
          name: "Student Union",
          slug: "student-union",
          description: "Campus politics",
          createdBy: seed.adminId,
        },
      }),
      prisma.electionCategory.create({
        data: {
          name: "Staff Union",
          slug: "staff-union",
          description: "",
          createdBy: seed.adminId,
        },
      }),
    ]);

    const now = Date.now();
    const created = await call(
      officerElectionsPOST,
      jsonRequest("/api/officer/elections", {
        method: "POST",
        token: officerToken,
        body: {
          title: "Categorised Officer Election",
          description: "Filed under a category at creation.",
          voting_start_at: new Date(now + HOUR).toISOString(),
          voting_end_at: new Date(now + 2 * DAY).toISOString(),
          capacity_mode: "open",
          category_id: studentUnion.id,
        },
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: number };
    const row = await prisma.election.findUnique({ where: { id: createdBody.id } });
    expect(row?.categoryId).toBe(studentUnion.id);

    // The explore surfaces read the same link: the public category list (the
    // home tiles) counts the election.
    const categories = await call(categoriesGET, jsonRequest("/api/categories"));
    expect(categories.status).toBe(200);
    const listed = (await categories.json()) as Array<{
      id: number;
      election_count: number;
    }>;
    expect(listed.find((category) => category.id === studentUnion.id)?.election_count).toBe(1);

    // Moving or clearing the category from Edit election keeps it in sync.
    const moved = await call(
      officerElectionPATCH,
      jsonRequest(`/api/officer/elections/${createdBody.id}`, {
        method: "PATCH",
        token: officerToken,
        body: { category_id: staffUnion.id },
      }),
      { pk: String(createdBody.id) },
    );
    expect(moved.status).toBe(200);
    expect(
      (await prisma.election.findUnique({ where: { id: createdBody.id } }))?.categoryId,
    ).toBe(staffUnion.id);

    const cleared = await call(
      officerElectionPATCH,
      jsonRequest(`/api/officer/elections/${createdBody.id}`, {
        method: "PATCH",
        token: officerToken,
        body: { category_id: null },
      }),
      { pk: String(createdBody.id) },
    );
    expect(cleared.status).toBe(200);
    expect(
      (await prisma.election.findUnique({ where: { id: createdBody.id } }))?.categoryId,
    ).toBeNull();

    // An unknown category is refused before anything is created.
    const bogus = await call(
      officerElectionsPOST,
      jsonRequest("/api/officer/elections", {
        method: "POST",
        token: officerToken,
        body: {
          title: "Bogus Category Election",
          voting_start_at: new Date(now + HOUR).toISOString(),
          voting_end_at: new Date(now + 2 * DAY).toISOString(),
          capacity_mode: "open",
          category_id: 999999,
        },
      }),
    );
    expect(bogus.status).toBe(400);
    expect((await readJson(bogus)).category_id).toEqual(["This category is not available."]);
    expect(
      await prisma.election.findFirst({ where: { title: "Bogus Category Election" } }),
    ).toBeNull();
  });

  it("adds eligible voters by email or username and reports unmatched entries", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const officerToken = await createTokenFor(seed.officerId);

    await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "ReturningOfficer", email: "officer@example.test" },
      }),
    );

    // The admin scopes the officer by selecting them as the operator of the
    // seed election — registration itself carries no election.
    await call(
      adminElectionPATCH,
      jsonRequest(`/api/admin/elections/${seed.electionId}`, {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: seed.officerId },
      }),
      { pk: String(seed.electionId) },
    );

    const added = await call(
      votersPOST,
      jsonRequest(`/api/elections/${seed.electionId}/voters`, {
        method: "POST",
        token: officerToken,
        body: { accounts: ["voter@example.test", "Voter-One", "nobody@example.test"] },
      }),
      { pk: String(seed.electionId) },
    );
    expect(added.status).toBe(200);
    const result = (await added.json()) as {
      added: number;
      skipped: number;
      total: number;
      unmatched: string[];
    };
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(1);
    expect(result.unmatched).toEqual(["nobody@example.test"]);

    const stored = await prisma.electionVoter.findMany({
      where: { electionId: seed.electionId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].uniqueKey).toBe(`u:${seed.voterId}`);
  });

  it("regenerates a share token and gates a private election behind the invite link", async () => {
    const seed = await seedPlatform();
    const officerToken = await createTokenFor(seed.officerId);
    const adminToken = await createTokenFor(seed.adminId);

    await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "ReturningOfficer", email: "officer@example.test" },
      }),
    );

    // The admin scopes the officer by selecting them as the operator of the
    // seed election — registration itself carries no election.
    await call(
      adminElectionPATCH,
      jsonRequest(`/api/admin/elections/${seed.electionId}`, {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: seed.officerId },
      }),
      { pk: String(seed.electionId) },
    );

    await prisma.election.update({
      where: { id: seed.electionId },
      data: { visibility: "private", isPublished: true },
    });

    const missing = await call(
      publicElectionGET,
      jsonRequest(`/api/elections/public/${seed.electionSlug}`),
      { slug: seed.electionSlug },
    );
    expect(missing.status).toBe(404);

    const tokenResponse = await call(
      shareTokenPOST,
      jsonRequest(`/api/elections/${seed.electionId}/share-token`, {
        method: "POST",
        token: officerToken,
        body: { expires_in_days: 7 },
      }),
      { pk: String(seed.electionId) },
    );
    expect(tokenResponse.status).toBe(200);
    const share = (await tokenResponse.json()) as { share_token: string; invite_path: string };
    expect(share.share_token.length).toBeGreaterThan(10);
    expect(share.invite_path).toContain(share.share_token);

    const allowed = await call(
      publicElectionGET,
      jsonRequest(`/api/elections/public/${seed.electionSlug}?invite=${share.share_token}`),
      { slug: seed.electionSlug },
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { eligibility: unknown };
    expect(body.eligibility).toBeNull();
  });
});

describe("platform: campaigns and results", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lets an officer publish a campaign and an admin hide it from the public feed", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);
    const officerToken = await createTokenFor(seed.officerId);

    await call(
      assignOfficerPOST,
      jsonRequest("/api/admin/officers", {
        method: "POST",
        token: adminToken,
        body: { username: "ReturningOfficer", email: "officer@example.test" },
      }),
    );

    // The admin scopes the officer by selecting them as the operator of the
    // seed election — registration itself carries no election.
    await call(
      adminElectionPATCH,
      jsonRequest(`/api/admin/elections/${seed.electionId}`, {
        method: "PATCH",
        token: adminToken,
        body: { officer_id: seed.officerId },
      }),
      { pk: String(seed.electionId) },
    );

    const created = await call(
      officerCampaignsPOST,
      jsonRequest("/api/officer/campaigns", {
        method: "POST",
        token: officerToken,
        body: {
          election_id: seed.electionId,
          candidate_id: seed.candidateId,
          topic: "Lower fees, better labs",
          description: "A short campaign promise.",
          status: "PUBLISHED",
        },
      }),
    );
    expect(created.status).toBe(201);
    const campaign = await readJson(created);
    expect(campaign.status).toBe("PUBLISHED");

    const publicFeed = await call(publicCampaignsGET, jsonRequest("/api/campaigns"));
    const feed = (await publicFeed.json()) as Array<{ id: number; topic: string }>;
    expect(feed).toHaveLength(1);
    expect(feed[0]!.topic).toBe("Lower fees, better labs");

    const hidden = await call(
      adminCampaignPATCH,
      jsonRequest(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { status: "HIDDEN", moderation_note: "Off-topic." },
      }),
      { pk: String(campaign.id) },
    );
    expect(hidden.status).toBe(200);

    const after = await call(publicCampaignsGET, jsonRequest("/api/campaigns"));
    expect(((await after.json()) as unknown[]).length).toBe(0);
  });

  it("finalizes and publishes results, then serves them publicly", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);

    await prisma.election.update({
      where: { id: seed.electionId },
      data: { status: "OPEN", isPublished: true, allowLiveResults: true, resultVisibility: "live" },
    });

    const tooEarly = await call(
      resultsActionPOST,
      jsonRequest(`/api/admin/elections/${seed.electionId}/results`, {
        method: "POST",
        token: adminToken,
        body: { action: "finalize" },
      }),
      { pk: String(seed.electionId) },
    );
    expect(tooEarly.status).toBe(400);

    await prisma.election.update({
      where: { id: seed.electionId },
      data: { status: "CLOSED" },
    });

    const finalized = await call(
      resultsActionPOST,
      jsonRequest(`/api/admin/elections/${seed.electionId}/results`, {
        method: "POST",
        token: adminToken,
        body: { action: "finalize" },
      }),
      { pk: String(seed.electionId) },
    );
    expect(finalized.status).toBe(200);
    expect((await readJson(finalized)).result_finalized_at).toBeTruthy();

    const published = await call(
      resultsActionPOST,
      jsonRequest(`/api/admin/elections/${seed.electionId}/results`, {
        method: "POST",
        token: adminToken,
        body: { action: "publish" },
      }),
      { pk: String(seed.electionId) },
    );
    expect(published.status).toBe(200);
    expect((await readJson(published)).lifecycle_status).toBe("RESULTS_PUBLISHED");

    const publicResults = await call(
      electionResultsGET,
      jsonRequest(`/api/elections/${seed.electionId}/results`),
      { pk: String(seed.electionId) },
    );
    expect(publicResults.status).toBe(200);
  });

  it("reports aggregate votes without ever exposing a voter's choice", async () => {
    const seed = await seedPlatform();
    const adminToken = await createTokenFor(seed.adminId);

    await prisma.election.update({
      where: { id: seed.electionId },
      data: { status: "OPEN", isPublished: true },
    });
    await prisma.vote.create({
      data: {
        voterId: seed.voterId,
        electionId: seed.electionId,
        positionId: seed.positionId,
        candidateId: seed.candidateId,
        receiptCode: "rcpt-test",
      },
    });

    const response = await call(adminVotesGET, jsonRequest("/api/admin/votes", { token: adminToken }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("total_votes");
    expect(body).toContain("President");
    expect(body).not.toMatch(/"voter_id"|"voterId"/);
    expect(body).not.toMatch(/voter-one/);
    expect(body).not.toMatch(/rcpt-test/);
    const parsed = JSON.parse(body) as { total_votes: number };
    expect(parsed.total_votes).toBe(1);
  });
});
