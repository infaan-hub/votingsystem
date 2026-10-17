import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword, verifyPassword } from "@/src/lib/password";
import { GoogleNetworkError, verifyGoogleIdentity } from "@/src/lib/google";
import {
  call,
  createTokenFor,
  jsonRequest,
  multipartRequest,
  resetDb,
} from "./helpers";

import { GET as healthGET } from "@/src/app/api/health/route";
import { POST as loginPOST } from "@/src/app/api/auth/login/route";
import { POST as logoutPOST } from "@/src/app/api/auth/logout/route";
import { GET as meGET } from "@/src/app/api/auth/me/route";
import { POST as registerAdminPOST } from "@/src/app/api/auth/register/admin/route";
import { POST as registerVoterPOST } from "@/src/app/api/auth/register/voter/route";
import { POST as googlePOST } from "@/src/app/api/auth/google/route";
import { GET as electionListGET } from "@/src/app/api/elections/route";
import { GET as electionPublicDetailGET } from "@/src/app/api/elections/public/[slug]/route";
import { GET as electionDetailGET } from "@/src/app/api/elections/[pk]/route";
import { GET as electionImageGET } from "@/src/app/api/elections/[pk]/image/route";
import { GET as electionCampaignsGET } from "@/src/app/api/elections/[pk]/campaigns/route";
import { GET as electionBallotGET } from "@/src/app/api/elections/[pk]/ballot/route";
import { GET as electionResultsGET } from "@/src/app/api/elections/[pk]/results/route";
import { GET as electionStatsGET } from "@/src/app/api/elections/[pk]/stats/route";
import { GET as candidatePhotoGET } from "@/src/app/api/candidates/[pk]/photo/route";
import { PATCH as meProfilePATCH } from "@/src/app/api/users/me/route";
import { GET as candidateVideoGET } from "@/src/app/api/candidates/[pk]/campaign-video/route";
import { USER_INCLUDE } from "@/src/lib/auth";
import { normalizeBallotSelections, submitBallot } from "@/src/lib/vote-submit";
import { POST as adminVotersPOST } from "@/src/app/api/admin/voters/route";
import { GET as adminUsersGET } from "@/src/app/api/admin/users/route";
import { PATCH as adminUserPATCH, DELETE as adminUserDELETE } from "@/src/app/api/admin/users/[user_id]/route";
import { POST as adminCandidatePOST } from "@/src/app/api/admin/elections/[pk]/candidates/route";
import {
  PATCH as adminCandidatePATCH,
  DELETE as adminCandidateDELETE,
} from "@/src/app/api/admin/elections/[pk]/candidates/[candidate_id]/route";
import { PATCH as campaignPATCH } from "@/src/app/api/candidate/elections/[pk]/campaign/route";
import { PATCH as schedulePATCH } from "@/src/app/api/admin/elections/[pk]/schedule/route";
import { POST as scheduleSavePOST } from "@/src/app/api/admin/elections/[pk]/schedule/save/route";
import { POST as announcementsPOST } from "@/src/app/api/admin/elections/[pk]/announcements/route";
import { POST as noticesSavePOST } from "@/src/app/api/admin/elections/[pk]/notices/save/route";

vi.mock("@/src/lib/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/google")>();
  return {
    ...actual,
    verifyGoogleIdentity: vi.fn(),
  };
});

const mockedVerify = vi.mocked(verifyGoogleIdentity);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const GIF_BYTES = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const MP4_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
]);

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function seedApi() {
  const department = await prisma.department.create({
    data: { name: "Information Technology", code: "IT", description: "" },
  });
  const section = await prisma.section.create({
    data: { departmentId: department.id, name: "Year 3", code: "Y3", description: "" },
  });
  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: "University Leadership Election 2026",
      slug: "university-leadership-election-2026",
      description:
        "Digital voting for students and staff with real-time campaign visibility.",
      campaignStartAt: new Date(now - 3 * DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now - 2 * HOUR),
      votingEndAt: new Date(now + 4 * HOUR),
      allowLiveResults: true,
      status: "OPEN",
    },
  });
  const hiddenElection = await prisma.election.create({
    data: {
      title: "Hidden Results Election",
      slug: "hidden-results-election",
      description: "Results should stay hidden to guests while voting is active.",
      campaignStartAt: new Date(now - DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + HOUR),
      allowLiveResults: false,
      resultVisibility: "hidden",
      status: "OPEN",
    },
  });
  const position = await prisma.position.create({
    data: {
      electionId: election.id,
      name: "President",
      departmentId: department.id,
      sectionId: section.id,
      voterGroup: "student",
    },
  });
  const hiddenPosition = await prisma.position.create({
    data: {
      electionId: hiddenElection.id,
      name: "Chairperson",
      voterGroup: "student",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      username: "admin",
      password: hashPassword("Admin123!"),
      firstName: "System",
      lastName: "Admin",
      role: "admin",
    },
  });
  const voter = await prisma.user.create({
    data: {
      username: "student_a",
      password: hashPassword("Pass1234!"),
      firstName: "Asha",
      lastName: "Noor",
      role: "voter",
      departmentId: department.id,
      sectionId: section.id,
    },
  });
  const candidateUser = await prisma.user.create({
    data: {
      username: "candidate_a",
      password: hashPassword("Pass1234!"),
      firstName: "Juma",
      lastName: "Ali",
      role: "voter",
      departmentId: department.id,
      sectionId: section.id,
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position.id,
      departmentId: department.id,
      sectionId: section.id,
      slogan: "Forward together",
      approved: true,
    },
  });
  const hiddenCandidateUser = await prisma.user.create({
    data: {
      username: "hidden_candidate",
      password: hashPassword("Pass1234!"),
      firstName: "Sami",
      lastName: "Omar",
      role: "voter",
    },
  });
  const hiddenCandidate = await prisma.candidate.create({
    data: {
      userId: hiddenCandidateUser.id,
      electionId: hiddenElection.id,
      positionId: hiddenPosition.id,
      slogan: "Quiet progress",
      approved: true,
    },
  });
  const voterToken = await createTokenFor(voter.id);

  return {
    department,
    section,
    election,
    hiddenElection,
    position,
    hiddenPosition,
    adminUser,
    voter,
    candidateUser,
    candidate,
    hiddenCandidate,
    voterToken,
  };
}

async function adminTokenFor(adminUserId: number): Promise<string> {
  return createTokenFor(adminUserId);
}

describe("VotingApiTests", () => {
  beforeEach(async () => {
    await resetDb();
    mockedVerify.mockReset();
  });

  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it("answers the health endpoint", async () => {
    const response = await call(healthGET, jsonRequest("/api/health/"));
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "ok" });
  });

  it("serves the public election endpoints", async () => {
    const { election, position } = await seedApi();

    const listResponse = await call(electionListGET, jsonRequest("/api/elections/"));
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(2);

    const detailResponse = await call(
      electionDetailGET,
      jsonRequest(`/api/elections/${election.id}/`),
      { pk: String(election.id) },
    );
    expect(detailResponse.status).toBe(200);
    expect((await readJson(detailResponse)).id).toBe(election.id);

    const campaignsResponse = await call(
      electionCampaignsGET,
      jsonRequest(`/api/elections/${election.id}/campaigns/`),
      { pk: String(election.id) },
    );
    expect(campaignsResponse.status).toBe(200);
    const campaigns = await readJson(campaignsResponse);
    expect((campaigns.positions as Array<{ name: string }>)[0].name).toBe(position.name);

    // Tallies are only readable once the results are explicitly published;
    // the caller here is anonymous, so publishing must flip the answer.
    await prisma.election.update({
      where: { id: election.id },
      data: { resultPublishedAt: new Date() },
    });

    const statsResponse = await call(
      electionStatsGET,
      jsonRequest(`/api/elections/${election.id}/stats/`),
      { pk: String(election.id) },
    );
    expect(statsResponse.status).toBe(200);
    expect((await readJson(statsResponse)).election_id).toBe(election.id);

    const resultsResponse = await call(
      electionResultsGET,
      jsonRequest(`/api/elections/${election.id}/results/`),
      { pk: String(election.id) },
    );
    expect(resultsResponse.status).toBe(200);
    const results = await readJson(resultsResponse);
    expect(results).toHaveProperty("stats");
    expect(results).toHaveProperty("winners");
  });

  it("reports has_voted and the caller's own my_vote record", async () => {
    const { department, election, position, candidate, voter, voterToken } = await seedApi();
    const detailPath = `/api/elections/public/${election.slug}/`;

    // Anonymous callers get no personalisation and no ballot record.
    const anonymousList = await call(electionListGET, jsonRequest("/api/elections/"));
    const anonymousEntries = (await anonymousList.json()) as Array<{
      id: number;
      has_voted: boolean;
    }>;
    expect(anonymousEntries.every((entry) => entry.has_voted === false)).toBe(true);
    const anonymousDetail = await call(
      electionPublicDetailGET,
      jsonRequest(detailPath),
      { slug: election.slug },
    );
    const anonymousBody = await readJson(anonymousDetail);
    expect((anonymousBody.election as { has_voted: boolean }).has_voted).toBe(false);
    expect(anonymousBody.my_vote).toBeNull();

    // The signed-in voter has not voted yet.
    const beforeList = await call(
      electionListGET,
      jsonRequest("/api/elections/", { token: voterToken }),
    );
    const beforeEntries = (await beforeList.json()) as Array<{
      id: number;
      has_voted: boolean;
    }>;
    expect(beforeEntries.find((entry) => entry.id === election.id)?.has_voted).toBe(false);
    const beforeDetail = await call(
      electionPublicDetailGET,
      jsonRequest(detailPath, { token: voterToken }),
      { slug: election.slug },
    );
    const beforeBody = await readJson(beforeDetail);
    expect((beforeBody.election as { has_voted: boolean }).has_voted).toBe(false);
    expect(beforeBody.my_vote).toEqual({ has_voted: false, votes: [] });

    // Record a vote (the ballot API itself is exercised by the voting tests).
    await prisma.vote.create({
      data: {
        voterId: voter.id,
        electionId: election.id,
        positionId: position.id,
        candidateId: candidate.id,
        receiptCode: "API-TEST-RECEIPT",
      },
    });

    const afterList = await call(
      electionListGET,
      jsonRequest("/api/elections/", { token: voterToken }),
    );
    const afterEntries = (await afterList.json()) as Array<{
      id: number;
      has_voted: boolean;
    }>;
    expect(afterEntries.find((entry) => entry.id === election.id)?.has_voted).toBe(true);

    const afterDetail = await call(
      electionPublicDetailGET,
      jsonRequest(detailPath, { token: voterToken }),
      { slug: election.slug },
    );
    const afterBody = await readJson(afterDetail);
    expect((afterBody.election as { has_voted: boolean }).has_voted).toBe(true);
    const myVote = afterBody.my_vote as {
      has_voted: boolean;
      votes: Array<Record<string, unknown>>;
    };
    expect(myVote.has_voted).toBe(true);
    expect(myVote.votes).toHaveLength(1);
    expect(myVote.votes[0]).toMatchObject({
      position_id: position.id,
      position_name: position.name,
      choice: "Juma Ali",
      candidate_id: candidate.id,
    });

    // Another voter never sees the first voter's ballot.
    const other = await prisma.user.create({
      data: {
        username: "other_voter",
        password: hashPassword("Pass1234!"),
        firstName: "Other",
        lastName: "Voter",
        role: "voter",
        departmentId: department.id,
      },
    });
    const otherToken = await createTokenFor(other.id);
    const otherDetail = await call(
      electionPublicDetailGET,
      jsonRequest(detailPath, { token: otherToken }),
      { slug: election.slug },
    );
    const otherBody = await readJson(otherDetail);
    expect((otherBody.election as { has_voted: boolean }).has_voted).toBe(false);
    expect(otherBody.my_vote).toEqual({ has_voted: false, votes: [] });
  });

  it("blocks hidden results from guests", async () => {
    const { hiddenElection } = await seedApi();
    const response = await call(
      electionResultsGET,
      jsonRequest(`/api/elections/${hiddenElection.id}/results/`),
      { pk: String(hiddenElection.id) },
    );
    expect(response.status).toBe(403);
    expect((await readJson(response)).detail).toBe(
      "Results are not published yet.",
    );
  });

  it("runs the login/me/logout flow", async () => {
    await seedApi();

    const loginResponse = await call(
      loginPOST,
      jsonRequest("/api/auth/login/", {
        method: "POST",
        body: { username: "student_a", password: "Pass1234!" },
      }),
    );
    expect(loginResponse.status).toBe(200);
    const { token } = (await readJson(loginResponse)) as { token: string };

    const meResponse = await call(
      meGET,
      jsonRequest("/api/auth/me/", { token }),
    );
    expect(meResponse.status).toBe(200);
    expect((await readJson(meResponse)).username).toBe("student_a");

    const logoutResponse = await call(
      logoutPOST,
      jsonRequest("/api/auth/logout/", { method: "POST", token }),
    );
    expect(logoutResponse.status).toBe(204);
  });

  it("refuses anonymous admin self-registration but allows an admin to create one", async () => {
    const { adminUser } = await seedApi();
    const anonymous = await call(
      registerAdminPOST,
      jsonRequest("/api/auth/register/admin/", {
        method: "POST",
        body: {
          full_name: "Election Master",
          username: "chief_admin",
          email: "chief@example.com",
          staff_id: "ADM-100",
          password: "AdminPass123!",
          confirm_password: "AdminPass123!",
        },
      }),
    );
    expect([401, 403]).toContain(anonymous.status);

    const token = await adminTokenFor(adminUser.id);
    const response = await call(
      registerAdminPOST,
      jsonRequest("/api/auth/register/admin/", {
        method: "POST",
        token,
        body: {
          full_name: "Election Master",
          username: "chief_admin",
          email: "chief@example.com",
          staff_id: "ADM-100",
          password: "AdminPass123!",
          confirm_password: "AdminPass123!",
        },
      }),
    );
    expect(response.status).toBe(201);
    const payload = await readJson(response);
    const user = payload.user as Record<string, unknown>;
    expect(user.role).toBe("admin");
    expect(user.username).toBe("chief_admin");
    expect(payload.token).toBeTruthy();
  });

  it("registers a new voter", async () => {
    await seedApi();
    const response = await call(
      registerVoterPOST,
      jsonRequest("/api/auth/register/voter/", {
        method: "POST",
        body: {
          first_name: "Neema",
          last_name: "Suleiman",
          username: "neema_2026",
          email: "neema@example.com",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
        },
      }),
    );
    expect(response.status).toBe(201);
    const payload = await readJson(response);
    const user = payload.user as Record<string, unknown>;
    expect(user.role).toBe("voter");
    expect(payload.token).toBeTruthy();
  });

  it("registers a new voter from a single full name", async () => {
    await seedApi();
    const response = await call(
      registerVoterPOST,
      jsonRequest("/api/auth/register/voter/", {
        method: "POST",
        body: {
          full_name: "Amara Njeri",
          username: "amara_n",
          email: "amara@example.com",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
        },
      }),
    );
    expect(response.status).toBe(201);
    const created = await prisma.user.findUnique({ where: { username: "amara_n" } });
    expect(created?.firstName).toBe("Amara");
    expect(created?.lastName).toBe("Njeri");
    expect(created?.email).toBe("amara@example.com");
  });

  it("rejects a duplicate email at registration, case-insensitively", async () => {
    await seedApi();
    const first = await call(
      registerVoterPOST,
      jsonRequest("/api/auth/register/voter/", {
        method: "POST",
        body: {
          first_name: "First",
          last_name: "Owner",
          username: "first_owner",
          email: "Owner@Example.com",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
        },
      }),
    );
    expect(first.status).toBe(201);

    const duplicate = await call(
      registerVoterPOST,
      jsonRequest("/api/auth/register/voter/", {
        method: "POST",
        body: {
          first_name: "Second",
          last_name: "Owner",
          username: "second_owner",
          email: "owner@example.com",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
        },
      }),
    );
    expect(duplicate.status).toBe(400);
    expect((await readJson(duplicate)).email).toEqual([
      "A user with that email already exists.",
    ]);
  });

  it("lets a signed-in user save their WhatsApp phone number", async () => {
    const { voter } = await seedApi();
    const token = await createTokenFor(voter.id);

    const saved = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { phone_number: "+255 712 345 678" },
      }),
    );
    expect(saved.status).toBe(200);
    expect((await readJson(saved)).phone_number).toBe("+255 712 345 678");
    const row = await prisma.user.findUnique({ where: { id: voter.id } });
    expect(row?.phoneNumber).toBe("+255 712 345 678");

    const invalid = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { phone_number: "call-me" },
      }),
    );
    expect(invalid.status).toBe(400);

    const cleared = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { phone_number: "" },
      }),
    );
    expect(cleared.status).toBe(200);
    expect((await readJson(cleared)).phone_number).toBe(null);
  });

  it("lets a signed-in user edit their name and email but never their role", async () => {
    const { voter } = await seedApi();
    const token = await createTokenFor(voter.id);

    // A phone number saved earlier must survive a later name-only edit.
    const saved = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { phone_number: "+255 712 345 678" },
      }),
    );
    expect(saved.status).toBe(200);

    // Changing the address needs the current password; without it the account
    // keeps the old one.
    const unconfirmed = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { email: "moved@example.com" },
      }),
    );
    expect(unconfirmed.status).toBe(400);
    expect((await readJson(unconfirmed)).current_password).toEqual([
      "Enter your current password to change your email address.",
    ]);

    const edited = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: {
          first_name: "Asha",
          last_name: "Mwinyi",
          email: "Asha.Mwinyi@Example.com",
          current_password: "Pass1234!",
        },
      }),
    );
    expect(edited.status).toBe(200);
    const payload = await readJson(edited);
    expect(payload.full_name).toBe("Asha Mwinyi");
    expect(payload.first_name).toBe("Asha");
    expect(payload.last_name).toBe("Mwinyi");
    expect(payload.email).toBe("asha.mwinyi@example.com");
    expect(payload.phone_number).toBe("+255 712 345 678");
    expect(payload.role).toBe("voter");

    const row = await prisma.user.findUnique({ where: { id: voter.id } });
    expect(row?.firstName).toBe("Asha");
    expect(row?.lastName).toBe("Mwinyi");
    expect(row?.email).toBe("asha.mwinyi@example.com");
    expect(row?.phoneNumber).toBe("+255 712 345 678");

    // Role and account status are administrator-only fields.
    const escalated = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { role: "admin" },
      }),
    );
    expect(escalated.status).toBe(400);
    expect((await readJson(escalated)).role).toEqual([
      "You cannot change your own role. An administrator can update it for you.",
    ]);
    const unchanged = await prisma.user.findUnique({ where: { id: voter.id } });
    expect(unchanged?.role).toBe("voter");
    expect(unchanged?.isActive).toBe(true);
  });

  it("changes the password only with the current one and requires a fresh choice", async () => {
    const { voter } = await seedApi();
    const token = await createTokenFor(voter.id);

    // Wrong current password → refused, and the stored credential is untouched.
    const wrong = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: {
          current_password: "WrongPass123!",
          password: "NewPass123!",
          confirm_password: "NewPass123!",
        },
      }),
    );
    expect(wrong.status).toBe(400);
    expect((await readJson(wrong)).current_password).toEqual(["That password is incorrect."]);

    // Reusing the current password as the new one is refused too.
    const reuse = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: {
          current_password: "Pass1234!",
          password: "Pass1234!",
          confirm_password: "Pass1234!",
        },
      }),
    );
    expect(reuse.status).toBe(400);
    expect((await readJson(reuse)).password).toEqual([
      "Choose a password you have not used for this account.",
    ]);

    // The successful change swaps the credential used to sign in.
    const changed = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: {
          current_password: "Pass1234!",
          password: "NewPass123!",
          confirm_password: "NewPass123!",
        },
      }),
    );
    expect(changed.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: voter.id } });
    expect(verifyPassword("NewPass123!", row.password)).toBe(true);
    expect(verifyPassword("Pass1234!", row.password)).toBe(false);
  });

  it("rejects a profile email another account already uses", async () => {
    const { voter } = await seedApi();
    const token = await createTokenFor(voter.id);
    await prisma.user.create({
      data: {
        username: "email_owner",
        password: hashPassword("Pass1234!"),
        email: "owner@example.com",
        role: "voter",
      },
    });

    const duplicate = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { email: "Owner@Example.com" },
      }),
    );
    expect(duplicate.status).toBe(400);
    expect((await readJson(duplicate)).email).toEqual(["This email is already in use."]);

    const invalid = await call(
      meProfilePATCH,
      jsonRequest("/api/users/me/", {
        method: "PATCH",
        token,
        body: { email: "not-an-email" },
      }),
    );
    expect(invalid.status).toBe(400);

    // The account keeps its own address when the edit is refused.
    const row = await prisma.user.findUnique({ where: { id: voter.id } });
    expect(row?.email).toBe("");
  });

  it("creates a voter through Google when the email is new", async () => {
    await seedApi();
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    mockedVerify.mockResolvedValue({
      sub: "google-user-1",
      email: "googlevoter@example.com",
      email_verified: true,
      name: "Google Voter",
    });

    const response = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { credential: "google-token", role: "voter" },
      }),
    );
    expect(response.status).toBe(200);
    const user = (await readJson(response)).user as Record<string, unknown>;
    expect(user.email).toBe("googlevoter@example.com");
    expect(user.role).toBe("voter");
    expect(user.auth_provider).toBe("google");
  });

  it("accepts the Google popup code flow", async () => {
    await seedApi();
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    mockedVerify.mockResolvedValue({
      sub: "google-user-code-flow",
      email: "popupvoter@example.com",
      email_verified: true,
      name: "Popup Voter",
    });

    const response = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { code: "google-popup-code", role: "voter" },
      }),
    );
    expect(response.status).toBe(200);
    const user = (await readJson(response)).user as Record<string, unknown>;
    expect(user.email).toBe("popupvoter@example.com");
  });

  it("refuses to silently link an existing password account by email", async () => {
    const { candidateUser } = await seedApi();
    await prisma.user.update({
      where: { id: candidateUser.id },
      data: { email: "candidate_link@example.com" },
    });
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    mockedVerify.mockResolvedValue({
      sub: "candidate-google-id",
      email: "candidate_link@example.com",
      email_verified: true,
      name: "Juma Ali",
    });

    // Whoever pre-registered the address would keep their password, so the
    // Google identity is never attached without proving account ownership.
    const response = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { credential: "google-token", role: "candidate" },
      }),
    );
    expect(response.status).toBe(403);
    expect(String((await readJson(response)).detail).toLowerCase()).toContain(
      "sign in with your username and password",
    );
    const unchanged = await prisma.user.findUnique({ where: { id: candidateUser.id } });
    expect(unchanged?.googleId).toBeNull();
  });

  it("rejects creating a new admin through Google", async () => {
    await seedApi();
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    mockedVerify.mockResolvedValue({
      sub: "new-admin-google-id",
      email: "newadmin@example.com",
      email_verified: true,
      name: "New Admin",
    });

    const response = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { credential: "google-token", role: "admin" },
      }),
    );
    expect(response.status).toBe(400);
    expect(String((await readJson(response)).detail).toLowerCase()).toContain("not linked");
  });

  it("refuses an unlinked admin email, then signs the admin in once linked", async () => {
    const { adminUser } = await seedApi();
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { email: "admin-portal@example.com" },
    });
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    mockedVerify.mockResolvedValue({
      sub: "admin-google-id",
      email: "admin-portal@example.com",
      email_verified: true,
      name: "System Admin",
    });

    const unlinked = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { credential: "google-token", role: "voter" },
      }),
    );
    expect(unlinked.status).toBe(403);

    await prisma.user.update({
      where: { id: adminUser.id },
      data: { googleId: "admin-google-id", authProvider: "google" },
    });
    const linked = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { credential: "google-token", role: "voter" },
      }),
    );
    expect(linked.status).toBe(200);
    const payload = await readJson(linked);
    expect((payload.user as Record<string, unknown>).role).toBe("admin");
    const row = await prisma.user.findUnique({ where: { id: adminUser.id } });
    expect(row?.lastLogin).not.toBeNull();
  });

  it("handles Google token exchange failures", async () => {
    await seedApi();
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    mockedVerify.mockRejectedValue(new GoogleNetworkError("network down"));

    const response = await call(
      googlePOST,
      jsonRequest("/api/auth/google/", {
        method: "POST",
        body: { code: "google-popup-code", role: "voter" },
      }),
    );
    expect(response.status).toBe(503);
    expect(String((await readJson(response)).detail).toLowerCase()).toContain(
      "temporarily unavailable",
    );
  });

  it("lets an admin create voters, candidates, schedules and announcements", async () => {
    const { election, position, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const voterResponse = await call(
      adminVotersPOST,
      jsonRequest("/api/admin/voters/", {
        method: "POST",
        token,
        body: {
          username: "new_voter",
          email: "newvoter@example.com",
          first_name: "New",
          last_name: "Voter",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
          role: "voter",
        },
      }),
    );
    expect(voterResponse.status).toBe(201);
    expect(((await readJson(voterResponse)).user as Record<string, unknown>).username).toBe(
      "new_voter",
    );

    const candidateResponse = await call(
      adminCandidatePOST,
      jsonRequest(`/api/admin/elections/${election.id}/candidates/`, {
        method: "POST",
        token,
        body: {
          position_name: position.name,
          username: "new_candidate",
          email: "candidate@example.com",
          first_name: "New",
          last_name: "Candidate",
          password: "Candidate123!",
          confirm_password: "Candidate123!",
          slogan: "Forward now",
          manifesto: "Serve the students well.",
          approved: true,
        },
      }),
      { pk: String(election.id) },
    );
    expect(candidateResponse.status).toBe(201);
    expect(
      ((await readJson(candidateResponse)).user as Record<string, unknown>).username,
    ).toBe("new_candidate");

    const candidateByNameResponse = await call(
      adminCandidatePOST,
      jsonRequest(`/api/admin/elections/${election.id}/candidates/`, {
        method: "POST",
        token,
        body: {
          position_name: position.name,
          username: "candidate_by_name",
          email: "candidatebyname@example.com",
          first_name: "Typed",
          last_name: "Position",
          password: "Candidate123!",
          confirm_password: "Candidate123!",
          slogan: "Typed flow",
          manifesto: "Serve through typed position.",
          approved: true,
        },
      }),
      { pk: String(election.id) },
    );
    expect(candidateByNameResponse.status).toBe(201);
    expect(
      ((await readJson(candidateByNameResponse)).user as Record<string, unknown>).username,
    ).toBe("candidate_by_name");

    const newPositionResponse = await call(
      adminCandidatePOST,
      jsonRequest(`/api/admin/elections/${election.id}/candidates/`, {
        method: "POST",
        token,
        body: {
          position_name: "Secretary General",
          username: "candidate_new_position",
          email: "newposition@example.com",
          first_name: "New",
          last_name: "Office",
          password: "Candidate123!",
          confirm_password: "Candidate123!",
          slogan: "New office",
          manifesto: "Serve in a newly created office.",
          approved: true,
        },
      }),
      { pk: String(election.id) },
    );
    expect(newPositionResponse.status).toBe(201);
    expect(
      ((await readJson(newPositionResponse)).user as Record<string, unknown>).username,
    ).toBe("candidate_new_position");
    const createdPosition = await prisma.position.findFirst({
      where: { electionId: election.id, name: "Secretary General" },
    });
    expect(createdPosition).not.toBeNull();

    const photoResponse = await call(
      adminCandidatePOST,
      multipartRequest(`/api/admin/elections/${election.id}/candidates/`, {
        method: "POST",
        token,
        fields: {
          position_name: "Treasurer",
          username: "candidate_with_photo",
          email: "candidatephoto@example.com",
          first_name: "Photo",
          last_name: "Candidate",
          password: "Candidate123!",
          confirm_password: "Candidate123!",
        },
        files: {
          photo: { name: "candidate.gif", type: "image/gif", bytes: GIF_BYTES },
        },
      }),
      { pk: String(election.id) },
    );
    expect(photoResponse.status).toBe(201);
    const photoPayload = await readJson(photoResponse);
    expect(photoPayload.photo_url).toBeTruthy();
    const fetchedPhoto = await call(
      candidatePhotoGET,
      jsonRequest(String(photoPayload.photo)),
      { pk: String((photoPayload as { id: number }).id) },
    );
    expect(fetchedPhoto.status).toBe(200);
    expect(fetchedPhoto.headers.get("Content-Type")).toBe("image/gif");

    const scheduleResponse = await call(
      schedulePATCH,
      jsonRequest(`/api/admin/elections/${election.id}/schedule/`, {
        method: "PATCH",
        token,
        body: {
          title: "Updated University Leadership Election 2026",
          description: "Updated election schedule.",
        },
      }),
      { pk: String(election.id) },
    );
    expect(scheduleResponse.status).toBe(200);
    expect((await readJson(scheduleResponse)).title).toBe(
      "Updated University Leadership Election 2026",
    );

    const announcementResponse = await call(
      announcementsPOST,
      jsonRequest(`/api/admin/elections/${election.id}/announcements/`, {
        method: "POST",
        token,
        body: {
          title: "Voting Notice",
          message: "Voting begins soon.",
          announcement_type: "notice",
          is_pinned: true,
        },
      }),
      { pk: String(election.id) },
    );
    expect(announcementResponse.status).toBe(201);
    expect((await readJson(announcementResponse)).title).toBe("Voting Notice");
  });

  it("saves an election schedule through the dedicated API", async () => {
    const { election, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);
    const now = Date.now();

    const response = await call(
      scheduleSavePOST,
      multipartRequest(`/api/admin/elections/${election.id}/schedule/save/`, {
        method: "POST",
        token,
        fields: {
          title: "Saved Through Dedicated Schedule API",
          description: "Dedicated schedule save endpoint.",
          campaign_start_at: new Date(now - DAY).toISOString(),
          campaign_end_at: new Date(now + DAY).toISOString(),
          voting_start_at: new Date(now + 2 * DAY).toISOString(),
          voting_end_at: new Date(now + 3 * DAY).toISOString(),
          allow_live_results: "False",
          announce_winners_automatically: "False",
          is_published: "True",
        },
        files: {
          image: { name: "election.gif", type: "image/gif", bytes: GIF_BYTES },
        },
      }),
      { pk: String(election.id) },
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.title).toBe("Saved Through Dedicated Schedule API");
    expect(payload.image_url).toBeTruthy();
    const imageResponse = await call(
      electionImageGET,
      jsonRequest(String(payload.image)),
      { pk: String(election.id) },
    );
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("Content-Type")).toBe("image/gif");
    expect(payload.allow_live_results).toBe(false);
    expect(payload.announce_winners_automatically).toBe(false);
  });

  it("posts an election notice through the dedicated API", async () => {
    const { election, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const response = await call(
      noticesSavePOST,
      jsonRequest(`/api/admin/elections/${election.id}/notices/save/`, {
        method: "POST",
        token,
        body: {
          title: "Dedicated Notice API",
          message: "This notice is posted through its own API.",
          announcement_type: "notice",
          publish_at: new Date(Date.now() + HOUR).toISOString(),
          is_pinned: true,
        },
      }),
      { pk: String(election.id) },
    );

    expect(response.status).toBe(201);
    const payload = await readJson(response);
    expect(payload.title).toBe("Dedicated Notice API");
    expect(payload.is_pinned).toBe(true);
  });

  it("rejects duplicate usernames when admins create voters", async () => {
    const { adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const response = await call(
      adminVotersPOST,
      jsonRequest("/api/admin/voters/", {
        method: "POST",
        token,
        body: {
          username: "student_a",
          email: "duplicate@example.com",
          first_name: "Duplicate",
          last_name: "User",
          password: "VotePass123!",
          confirm_password: "VotePass123!",
          role: "voter",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      username: ["A user with that username already exists."],
    });
  });

  it("rejects duplicate usernames when admins create candidates", async () => {
    const { election, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const response = await call(
      adminCandidatePOST,
      jsonRequest(`/api/admin/elections/${election.id}/candidates/`, {
        method: "POST",
        token,
        body: {
          position_name: "President",
          username: "candidate_a",
          email: "candidate@example.com",
          first_name: "Duplicate",
          last_name: "Candidate",
          password: "Candidate123!",
          confirm_password: "Candidate123!",
          approved: true,
        },
      }),
      { pk: String(election.id) },
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toHaveProperty("username");
  });

  it("lets an admin list, update and delete users", async () => {
    const { voter, candidateUser, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const listResponse = await call(adminUsersGET, jsonRequest("/api/admin/users/", { token }));
    expect(listResponse.status).toBe(200);
    const listed = ((await readJson(listResponse)).users as Array<{ username: string }>).map(
      (user) => user.username,
    );
    expect(listed).toContain(voter.username);
    expect(listed).toContain(candidateUser.username);
    expect(listed).not.toContain(adminUser.username);

    const updateResponse = await call(
      adminUserPATCH,
      jsonRequest(`/api/admin/users/${voter.id}/`, {
        method: "PATCH",
        token,
        body: {
          username: "student_a_updated",
          email: "student.updated@example.com",
          first_name: "Asha",
          last_name: "Updated",
          role: "officer",
        },
      }),
      { user_id: String(voter.id) },
    );
    expect(updateResponse.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: voter.id } });
    expect(updated?.username).toBe("student_a_updated");
    expect(updated?.role).toBe("officer");

    const deleteResponse = await call(
      adminUserDELETE,
      jsonRequest(`/api/admin/users/${voter.id}/`, { method: "DELETE", token }),
      { user_id: String(voter.id) },
    );
    expect(deleteResponse.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: voter.id } })).toBeNull();
  });

  it("rejects admin targets on the admin user detail endpoint", async () => {
    const { adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const response = await call(
      adminUserPATCH,
      jsonRequest(`/api/admin/users/${adminUser.id}/`, {
        method: "PATCH",
        token,
        body: { first_name: "Root" },
      }),
      { user_id: String(adminUser.id) },
    );
    expect(response.status).toBe(404);
  });

  it("lets an admin update and delete a candidate", async () => {
    const { election, candidate, candidateUser, adminUser } = await seedApi();
    const token = await adminTokenFor(adminUser.id);

    const updateResponse = await call(
      adminCandidatePATCH,
      multipartRequest(`/api/admin/elections/${election.id}/candidates/${candidate.id}/`, {
        method: "PATCH",
        token,
        fields: {
          username: "candidate_a_updated",
          email: "candidate.updated@example.com",
          first_name: "Juma",
          last_name: "Updated",
          position_name: "Vice President",
          slogan: "Updated slogan",
          manifesto: "Updated manifesto",
          approved: "True",
        },
      }),
      { pk: String(election.id), candidate_id: String(candidate.id) },
    );
    expect(updateResponse.status).toBe(200);
    const payload = await readJson(updateResponse);
    expect((payload.user as Record<string, unknown>).username).toBe("candidate_a_updated");
    expect(payload.slogan).toBe("Updated slogan");
    const newPosition = await prisma.position.findFirst({
      where: { electionId: election.id, name: "Vice President" },
    });
    expect(newPosition).not.toBeNull();

    const deleteResponse = await call(
      adminCandidateDELETE,
      jsonRequest(
        `/api/admin/elections/${election.id}/candidates/${candidate.id}/`,
        { method: "DELETE", token },
      ),
      { pk: String(election.id), candidate_id: String(candidate.id) },
    );
    expect(deleteResponse.status).toBe(204);
    expect(await prisma.candidate.findUnique({ where: { id: candidate.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: candidateUser.id } })).toBeNull();
  });

  it("serves the ballot and accepts votes", async () => {
    const { election, candidate, voter, voterToken } = await seedApi();

    const ballotResponse = await call(
      electionBallotGET,
      jsonRequest(`/api/elections/${election.id}/ballot/`, { token: voterToken }),
      { pk: String(election.id) },
    );
    expect(ballotResponse.status).toBe(200);
    const ballot = await readJson(ballotResponse);
    expect(ballot.is_voting_open).toBe(true);
    expect((ballot.positions as Array<{ name: string }>)[0].name).toBe("President");

    // Cast through the real submission service: multi-row handling, receipts
    // and the duplicate guard are the same code the vote endpoint runs.
    const voterRow = (await prisma.user.findUniqueOrThrow({
      where: { id: voter.id },
      include: USER_INCLUDE,
    }))!;
    const positionId = (ballot.positions as Array<{ id: number }>)[0].id;
    const entries = await normalizeBallotSelections(election, voterRow, [
      { position_id: positionId, candidate_ids: [candidate.id] },
    ]);
    const cast = await submitBallot({ user: voterRow, election, entries });
    expect(cast.receiptCode).toHaveLength(24);

    await expect(
      submitBallot({ user: voterRow, election, entries }),
    ).rejects.toMatchObject({ status: 400 });

    const campaignsResponse = await call(
      electionCampaignsGET,
      jsonRequest(`/api/elections/${election.id}/campaigns/`),
      { pk: String(election.id) },
    );
    const campaigns = await readJson(campaignsResponse);
    const positions = campaigns.positions as Array<{
      candidates: Array<{ vote_total: number }>;
    }>;
    // Public surfaces never expose a tally before publication.
    expect(positions[0].candidates[0].vote_total).toBe(0);

    await prisma.election.update({
      where: { id: election.id },
      data: { resultPublishedAt: new Date() },
    });
    const publishedCampaigns = await readJson(
      await call(
        electionCampaignsGET,
        jsonRequest(`/api/elections/${election.id}/campaigns/`),
        { pk: String(election.id) },
      ),
    );
    const publishedPositions = publishedCampaigns.positions as Array<{
      candidates: Array<{ vote_total: number }>;
    }>;
    expect(publishedPositions[0].candidates[0].vote_total).toBe(1);
    expect(voter.id).toBeTruthy();
  });

  it("blocks hidden live stats from guests", async () => {
    const { hiddenElection } = await seedApi();
    const response = await call(
      electionStatsGET,
      jsonRequest(`/api/elections/${hiddenElection.id}/stats/`),
      { pk: String(hiddenElection.id) },
    );
    expect(response.status).toBe(403);
    expect((await readJson(response)).detail).toBe(
      "Statistics are not published yet.",
    );
  });

  it("lets a candidate upload a campaign video file", async () => {
    const { election, position, department, section } = await seedApi();
    const campaignUser = await prisma.user.create({
      data: {
        username: "campaign_owner",
        password: hashPassword("Pass1234!"),
        firstName: "Campaign",
        lastName: "Owner",
        role: "voter",
        departmentId: department.id,
        sectionId: section.id,
      },
    });
    const campaignCandidate = await prisma.candidate.create({
      data: {
        userId: campaignUser.id,
        electionId: election.id,
        positionId: position.id,
        departmentId: department.id,
        sectionId: section.id,
        approved: true,
      },
    });
    const token = await createTokenFor(campaignUser.id);

    const response = await call(
      campaignPATCH,
      multipartRequest(`/api/candidate/elections/${election.id}/campaign/`, {
        method: "PATCH",
        token,
        fields: {
          slogan: "Video campaign",
          manifesto: "Campaign with uploaded media.",
        },
        files: {
          campaign_video: {
            name: "campaign.mp4",
            type: "video/mp4",
            bytes: MP4_BYTES,
          },
        },
      }),
      { pk: String(election.id) },
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.slogan).toBe("Video campaign");
    expect(payload.campaign_video_url).toBeTruthy();
    const videoResponse = await call(
      candidateVideoGET,
      jsonRequest(String(payload.campaign_video_url)),
      { pk: String(campaignCandidate.id) },
    );
    expect(videoResponse.status).toBe(200);
    expect(videoResponse.headers.get("Content-Type")).toBe("video/mp4");
    // iOS/Android only play videos whose endpoints answer Range requests.
    expect(videoResponse.headers.get("Accept-Ranges")).toBe("bytes");
    const rangedResponse = await call(
      candidateVideoGET,
      jsonRequest(String(payload.campaign_video_url), {
        headers: { Range: "bytes=0-3" },
      }),
      { pk: String(campaignCandidate.id) },
    );
    expect(rangedResponse.status).toBe(206);
    expect(rangedResponse.headers.get("Content-Range")).toMatch(/^bytes 0-3\/\d+$/);
    expect((await rangedResponse.arrayBuffer()).byteLength).toBe(4);
    const stored = await prisma.candidate.findUnique({
      where: { id: campaignCandidate.id },
    });
    expect(stored?.campaignVideoBytes?.length ?? 0).toBeGreaterThan(0);
  });
});
