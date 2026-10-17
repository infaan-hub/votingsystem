import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";
import { POST as votePOST } from "@/src/app/api/elections/[pk]/vote/route";

const HOUR = 60 * 60 * 1000;
let seq = 0;

async function seedElection(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: `Submission Election ${seq}`,
      slug: `submission-election-${seq}`,
      status: "OPEN",
      isPublished: true,
      campaignStartAt: new Date(now - 2 * HOUR),
      campaignEndAt: new Date(now + HOUR),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + 2 * HOUR),
      ...overrides,
    },
  });
  const position = await prisma.position.create({
    data: { electionId: election.id, name: "Chair", voterGroup: "all", maxSelections: 2 },
  });
  const candidateUser = await prisma.user.create({
    data: { username: `sub_cand_${seq}`, password: hashPassword("Pass1234!"), role: "voter" },
  });
  const secondCandidateUser = await prisma.user.create({
    data: { username: `sub_cand_b_${seq}`, password: hashPassword("Pass1234!"), role: "voter" },
  });
  const firstCandidate = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position.id,
      approved: true,
    },
  });
  const secondCandidate = await prisma.candidate.create({
    data: {
      userId: secondCandidateUser.id,
      electionId: election.id,
      positionId: position.id,
      approved: true,
    },
  });
  return { election, position, firstCandidate, secondCandidate };
}

async function makeVoter(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      username: `sub_voter_${seq}`,
      password: hashPassword("Pass1234!"),
      firstName: "Vee",
      lastName: `Voter${seq}`,
      email: `sub_voter_${seq}@example.com`,
      role: "voter",
      ...overrides,
    },
  });
  const token = await createTokenFor(user.id);
  return { user, token };
}

function voteRequest(
  electionId: number,
  token: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return jsonRequest(`/api/elections/${electionId}/vote/`, {
    method: "POST",
    token,
    body,
    headers,
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(resetDb);

describe("vote submissions", () => {
  it("records every choice of a multi-select question", async () => {
    const { election, position, firstCandidate, secondCandidate } = await seedElection();
    const { token } = await makeVoter();

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [
          { position_id: position.id, candidate_ids: [firstCandidate.id, secondCandidate.id] },
        ],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(String(body.receipt_code)).toHaveLength(24);

    const votes = await prisma.vote.findMany({ where: { electionId: election.id } });
    expect(votes).toHaveLength(2);
    expect(new Set(votes.map((row) => row.candidateId)).size).toBe(2);
    expect(await prisma.voteSubmission.count()).toBe(1);
    // Every row of one submission carries the same receipt.
    expect(new Set(votes.map((row) => row.receiptCode)).size).toBe(1);
  });

  it("replays the receipt when the same request is retried", async () => {
    const { election, position, firstCandidate } = await seedElection();
    const { token } = await makeVoter();
    const key = "retry-key-1";
    const body = {
      selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
      reauth: { password: "Pass1234!" },
    };

    const first = await call(
      votePOST,
      voteRequest(election.id, token, body, { "Idempotency-Key": key }),
      { pk: String(election.id) },
    );
    expect(first.status).toBe(201);
    const firstBody = await readJson(first);

    const retry = await call(
      votePOST,
      voteRequest(election.id, token, body, { "Idempotency-Key": key }),
      { pk: String(election.id) },
    );
    expect(retry.status).toBe(200);
    const retryBody = await readJson(retry);
    expect(retryBody.replayed).toBe(true);
    expect(retryBody.receipt_code).toBe(firstBody.receipt_code);
    expect(await prisma.vote.count()).toBe(1);
    expect(await prisma.voteSubmission.count()).toBe(1);
  });

  it("rejects a retry key reused with different selections", async () => {
    const { election, position, firstCandidate, secondCandidate } = await seedElection();
    const { token } = await makeVoter();
    const key = "retry-key-2";

    await call(
      votePOST,
      voteRequest(
        election.id,
        token,
        {
          selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
          reauth: { password: "Pass1234!" },
        },
        { "Idempotency-Key": key },
      ),
      { pk: String(election.id) },
    );

    const mismatch = await call(
      votePOST,
      voteRequest(
        election.id,
        token,
        {
          selections: [{ position_id: position.id, candidate_ids: [secondCandidate.id] }],
          reauth: { password: "Pass1234!" },
        },
        { "Idempotency-Key": key },
      ),
      { pk: String(election.id) },
    );
    expect(mismatch.status).toBe(409);
    expect(await prisma.vote.count()).toBe(1);
  });

  it("requires the identifier for identifier-based elections", async () => {
    const { election, position, firstCandidate } = await seedElection({
      voterIdMethod: "student_id",
    });
    const { token } = await makeVoter();

    const missing = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(missing.status).toBe(400);
    const missingBody = await readJson(missing);
    expect(missingBody.identifier_required).toBe(true);
    expect(await prisma.vote.count()).toBe(0);

    const provided = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
        identifier: "STU-2026-0042",
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(provided.status).toBe(201);
    expect(await prisma.vote.count()).toBe(1);
  });

  it("rejects a question the voter is not eligible for", async () => {
    const { election, firstCandidate } = await seedElection();
    const { token } = await makeVoter();
    const otherDepartment = await prisma.department.create({
      data: { name: "Law", code: "LAW", description: "" },
    });
    const scoped = await prisma.position.create({
      data: {
        electionId: election.id,
        name: "Law Rep",
        voterGroup: "all",
        departmentId: otherDepartment.id,
      },
    });
    const scopedCandidate = await prisma.candidate.create({
      data: {
        userId: firstCandidate.userId,
        electionId: election.id,
        positionId: scoped.id,
        approved: true,
      },
    });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [{ position_id: scoped.id, candidate_ids: [scopedCandidate.id] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("rejects invalid option ids instead of silently dropping them", async () => {
    const { election, position, firstCandidate } = await seedElection();
    const { token } = await makeVoter();

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id, "abc"] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("blocks a question already recorded by a legacy vote row", async () => {
    const { election, position, firstCandidate } = await seedElection();
    const { user, token } = await makeVoter();
    await prisma.vote.create({
      data: {
        voterId: user.id,
        electionId: election.id,
        positionId: position.id,
        candidateId: firstCandidate.id,
        receiptCode: "LEGACY-RECEIPT",
      },
    });

    const response = await call(
      votePOST,
      voteRequest(election.id, token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await readJson(response)).toLowerCase()).toContain("already voted");
    expect(await prisma.vote.count()).toBe(1);
  });

  it("enforces voter capacity", async () => {
    const { election, position, firstCandidate } = await seedElection({
      capacityMode: "restricted",
      maxVoters: 1,
    });
    const first = await makeVoter();
    const second = await makeVoter();

    const firstResponse = await call(
      votePOST,
      voteRequest(election.id, first.token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(firstResponse.status).toBe(201);

    const secondResponse = await call(
      votePOST,
      voteRequest(election.id, second.token, {
        selections: [{ position_id: position.id, candidate_ids: [firstCandidate.id] }],
        reauth: { password: "Pass1234!" },
      }),
      { pk: String(election.id) },
    );
    expect(secondResponse.status).toBe(400);
    expect(await prisma.vote.count()).toBe(1);
  });
});
