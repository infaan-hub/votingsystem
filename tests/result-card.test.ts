import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock web-push before any module under test imports it, so notify() never
// performs a real network call.
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { GET as resultCardGET } from "@/src/app/api/elections/[pk]/result-card/route";
import { POST as publishPOST } from "@/src/app/api/officer/elections/[pk]/results/route";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let seq = 0;

async function makeUser(name: string, role: "voter" | "officer" | "admin") {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      username: `${name}_${seq}`,
      firstName: name,
      lastName: "Tester",
      password: hashPassword("Pass1234!"),
      role,
    },
  });
  return { user, token: await createTokenFor(user.id) };
}

type ElectionOverrides = {
  createdBy?: number;
  isPublished?: boolean;
  votingEndAt?: Date;
  resultVisibility?: string;
};

/** Voting window already closed unless overridden — the publish precondition. */
async function makeElection(overrides: ElectionOverrides = {}) {
  seq += 1;
  const now = Date.now();
  const category = await prisma.electionCategory.create({
    data: { name: `Category ${seq}`, slug: `category-rc-${seq}` },
  });
  return prisma.election.create({
    data: {
      title: `Chancellor Race ${seq}`,
      slug: `chancellor-race-${seq}`,
      categoryId: category.id,
      status: "OPEN",
      isPublished: overrides.isPublished ?? true,
      campaignStartAt: new Date(now - 7 * DAY),
      campaignEndAt: new Date(now - 2 * DAY),
      votingStartAt: new Date(now - 2 * DAY),
      votingEndAt: overrides.votingEndAt ?? new Date(now - HOUR),
      timezone: "UTC",
      createdBy: overrides.createdBy ?? null,
      resultVisibility: overrides.resultVisibility ?? "live",
    },
  });
}

async function makeBallot(electionId: number, positionName: string, candidateNames: string[]) {
  const position = await prisma.position.create({
    data: { electionId, name: positionName, order: 0 },
  });
  const candidates = [];
  for (const name of candidateNames) {
    const candidateUser = await makeUser(name, "voter");
    const candidate = await prisma.candidate.create({
      data: { electionId, positionId: position.id, userId: candidateUser.user.id, approved: true },
    });
    candidates.push(candidate);
  }
  return { position, candidates };
}

async function castVote(
  electionId: number,
  positionId: number,
  candidateId: number,
  voterId: number,
) {
  seq += 1;
  await prisma.vote.create({
    data: {
      electionId,
      positionId,
      candidateId,
      voterId,
      receiptCode: `receipt-${seq}`,
    },
  });
}

type CardPayload = {
  election: { id: number; slug: string; title: string; published: boolean };
  winner: { candidate_id: number; name: string; votes: number; percentage: number } | null;
  candidates: {
    candidate_id: number;
    name: string;
    votes: number;
    percentage: number;
    position_name: string;
  }[];
  totals: { votes: number; candidates: number };
};

function cardRequest(slugOrId: string | number, token?: string) {
  return jsonRequest(`/api/elections/${slugOrId}/result-card/`, { token });
}

function publishRequest(electionId: number, token: string) {
  return jsonRequest(`/api/officer/elections/${electionId}/results/`, {
    method: "POST",
    token,
    body: { action: "publish" },
  });
}

describe("ElectionResultCardTests", () => {
  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("hides an unpublished card from the public but lets the officer preview it", async () => {
    const officer = await makeUser("officer", "officer");
    const voter = await makeUser("voter", "voter");
    const election = await makeElection({ createdBy: officer.user.id });
    const { position, candidates } = await makeBallot(election.id, "Chancellor", ["Alice", "Bob"]);
    await castVote(election.id, position.id, candidates[0]!.id, voter.user.id);

    const anonymous = await call(resultCardGET, cardRequest(election.id), {
      pk: String(election.id),
    });
    expect(anonymous.status).toBe(403);
    expect(JSON.stringify(await anonymous.json())).toContain("not been published");

    const asVoter = await call(resultCardGET, cardRequest(election.id, voter.token), {
      pk: String(election.id),
    });
    expect(asVoter.status).toBe(403);

    const asOfficer = await call(
      resultCardGET,
      cardRequest(election.id, officer.token),
      { pk: String(election.id) },
    );
    expect(asOfficer.status).toBe(200);
    const preview = (await asOfficer.json()) as CardPayload;
    expect(preview.election.published).toBe(false);
    expect(preview.winner?.candidate_id).toBe(candidates[0]!.id);
    expect(preview.winner?.votes).toBe(1);
    expect(preview.winner?.percentage).toBe(100);
    expect(preview.totals).toEqual({ votes: 1, candidates: 2 });

    // The public slug addresses the same election.
    const bySlug = await call(resultCardGET, cardRequest(election.slug, officer.token), {
      pk: election.slug,
    });
    expect(bySlug.status).toBe(200);
  });

  it("hides unpublished cards of unpublished elections behind a 404", async () => {
    const officer = await makeUser("officer", "officer");
    const election = await makeElection({ createdBy: officer.user.id, isPublished: false });
    await makeBallot(election.id, "Chancellor", ["Alice"]);

    const anonymous = await call(resultCardGET, cardRequest(election.id), {
      pk: String(election.id),
    });
    expect(anonymous.status).toBe(404);
  });

  it("publishes to the voters who took part, exactly once, and opens the card publicly", async () => {
    const officer = await makeUser("officer", "officer");
    const election = await makeElection({ createdBy: officer.user.id });
    const { position, candidates } = await makeBallot(election.id, "Chancellor", ["Alice", "Bob"]);

    const voterOne = await makeUser("voter_one", "voter");
    const voterTwo = await makeUser("voter_two", "voter");
    await castVote(election.id, position.id, candidates[0]!.id, voterOne.user.id);
    await castVote(election.id, position.id, candidates[1]!.id, voterTwo.user.id);

    const published = await call(publishPOST, publishRequest(election.id, officer.token), {
      pk: String(election.id),
    });
    expect(published.status).toBe(200);

    const stored = await prisma.election.findUnique({ where: { id: election.id } });
    expect(stored?.resultPublishedAt).not.toBeNull();
    expect(stored?.resultFinalizedAt).not.toBeNull();
    expect(stored?.isPublished).toBe(true);

    // Only the two accounts that cast a ballot are notified.
    const notifications = await prisma.notification.findMany({
      where: { tag: "election-result-card" },
    });
    expect(notifications).toHaveLength(2);
    expect(new Set(notifications.map((row) => row.recipientId))).toEqual(
      new Set([voterOne.user.id, voterTwo.user.id]),
    );
    for (const row of notifications) {
      expect(row.targetUrl).toBe(`/results/${election.slug}`);
      expect(row.category).toBe("election");
      expect(row.idempotencyKey).toBe(`election-${election.id}-result-card:${row.recipientId}`);
    }

    // Publishing again is idempotent: no new notifications.
    const again = await call(publishPOST, publishRequest(election.id, officer.token), {
      pk: String(election.id),
    });
    expect(again.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-result-card" } })).toBe(2);

    // Anyone can now open the card, addressed by slug, with the tallied shares.
    const cardResponse = await call(resultCardGET, cardRequest(election.slug), {
      pk: election.slug,
    });
    expect(cardResponse.status).toBe(200);
    const card = (await cardResponse.json()) as CardPayload;
    expect(card.election.published).toBe(true);
    expect(card.winner?.candidate_id).toBe(candidates[0]!.id);
    expect(card.candidates).toHaveLength(2);
    expect(card.candidates[0]!.votes).toBe(1);
    expect(card.candidates[0]!.percentage).toBe(50);
    expect(card.candidates[1]!.percentage).toBe(50);
    expect(card.candidates[0]!.position_name).toBe("Chancellor");
  });

  it("refuses to publish while voting runs, without ballots, or out of scope", async () => {
    const officer = await makeUser("officer", "officer");
    const voter = await makeUser("voter", "voter");

    // Voting is still open.
    const running = await makeElection({
      createdBy: officer.user.id,
      votingEndAt: new Date(Date.now() + HOUR),
    });
    const early = await call(publishPOST, publishRequest(running.id, officer.token), {
      pk: String(running.id),
    });
    expect(early.status).toBe(400);
    expect(JSON.stringify(await early.json())).toContain("after voting has ended");

    // Voting closed but nobody voted.
    const empty = await makeElection({ createdBy: officer.user.id });
    await makeBallot(empty.id, "Chancellor", ["Alice"]);
    const noBallots = await call(publishPOST, publishRequest(empty.id, officer.token), {
      pk: String(empty.id),
    });
    expect(noBallots.status).toBe(400);
    expect(JSON.stringify(await noBallots.json())).toContain("no ballots");

    // A different officer cannot publish it…
    const outsider = await makeUser("outsider", "officer");
    const scoped = await makeElection({ createdBy: officer.user.id });
    const ballot = await makeBallot(scoped.id, "Chancellor", ["Alice"]);
    await castVote(scoped.id, ballot.position.id, ballot.candidates[0]!.id, voter.user.id);
    const outOfScope = await call(publishPOST, publishRequest(scoped.id, outsider.token), {
      pk: String(scoped.id),
    });
    expect(outOfScope.status).toBe(403);

    // …and a voter never can.
    const asVoter = await call(publishPOST, publishRequest(scoped.id, voter.token), {
      pk: String(scoped.id),
    });
    expect(asVoter.status).toBe(403);

    // Still unpublished after every refused attempt.
    const stored = await prisma.election.findUnique({ where: { id: scoped.id } });
    expect(stored?.resultPublishedAt).toBeNull();
    expect(await prisma.notification.count({ where: { tag: "election-result-card" } })).toBe(0);
  });
});
