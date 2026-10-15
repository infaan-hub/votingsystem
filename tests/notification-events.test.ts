import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock web-push before any module under test imports it. vi.hoisted runs
// before vi.mock's factory is evaluated, so the shared spy is safe to close over.
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

import { POST as transitionPOST } from "@/src/app/api/admin/elections/[pk]/transition/route";
import { POST as resultsPOST } from "@/src/app/api/admin/elections/[pk]/results/route";
import { PATCH as candidatePATCH } from "@/src/app/api/admin/elections/[pk]/candidates/[candidate_id]/route";
import { PATCH as campaignPATCH } from "@/src/app/api/admin/campaigns/[pk]/route";
import { POST as votersPOST } from "@/src/app/api/elections/[pk]/voters/route";
import { DELETE as voterDELETE } from "@/src/app/api/elections/[pk]/voters/[voter_pk]/route";
import { DELETE as officerAssignmentDELETE } from "@/src/app/api/admin/officers/[pk]/route";
import { PATCH as schedulePATCH } from "@/src/app/api/admin/elections/[pk]/schedule/route";
import {
  DELETE as officerElectionDELETE,
  PATCH as officerElectionPATCH,
} from "@/src/app/api/officer/elections/[pk]/route";
import { POST as contactPOST } from "@/src/app/api/contact/route";
import { transitionElection } from "@/src/lib/elections";
import { runElectionReminders } from "@/src/lib/notifications/events";

// Valid-format dummy VAPID material (never used: web-push is mocked).
const DUMMY_PUBLIC_KEY =
  "BNUqFzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQzFQ";
const DUMMY_PRIVATE_KEY = "c3R1Yl9wcml2YXRlX2tleV9mb3JfdGVzdGluZ19vbmx5XzEyMzQ1Njc4OTA";

function stubVapidEnv() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = DUMMY_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = DUMMY_PRIVATE_KEY;
  process.env.VAPID_SUBJECT = "mailto:tests@example.invalid";
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let userSeq = 0;
let electionSeq = 0;

async function makeUser(
  name: string,
  role: "voter" | "officer" | "admin",
  options: { isActive?: boolean } = {},
) {
  userSeq += 1;
  const user = await prisma.user.create({
    data: {
      username: `${name}_${userSeq}`,
      password: hashPassword("Pass1234!"),
      role,
      isActive: options.isActive ?? true,
    },
  });
  return { user, token: await createTokenFor(user.id) };
}

type ElectionOverrides = Partial<{
  status: string;
  isPublished: boolean;
  eligibilityPolicy: string;
  voterIdMethod: string;
  resultVisibility: string;
  votingStartAt: Date;
  votingEndAt: Date;
  createdBy: number;
}>;

async function makeElection(overrides: ElectionOverrides = {}) {
  electionSeq += 1;
  const category = await prisma.electionCategory.create({
    data: { name: `Category ${electionSeq}`, slug: `category-${electionSeq}` },
  });
  const now = Date.now();
  return prisma.election.create({
    data: {
      title: `Election ${electionSeq}`,
      slug: `election-${electionSeq}`,
      categoryId: category.id,
      status: "READY",
      isPublished: true,
      campaignStartAt: new Date(now - 7 * DAY),
      campaignEndAt: new Date(now - HOUR),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + DAY),
      timezone: "UTC",
      ...overrides,
    },
  });
}

async function makePosition(electionId: number, voterGroup = "all") {
  electionSeq += 1;
  return prisma.position.create({
    data: { electionId, name: `Seat ${electionSeq}`, voterGroup },
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("EventDrivenNotificationTests", () => {
  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    stubVapidEnv();
  });

  /* ------------------------------------------------------------------ *
   * A. Voting opens                                                      *
   * ------------------------------------------------------------------ */

  it("opens voting: notifies only eligible voters, survives provider failure, never duplicates", async () => {
    const v1 = await makeUser("open_voter_a", "voter");
    const v2 = await makeUser("open_voter_b", "voter");
    const officer = await makeUser("open_officer", "officer");
    const admin = await makeUser("open_admin", "admin");
    const inactive = await makeUser("open_inactive", "voter", { isActive: false });

    const election = await makeElection({ status: "READY" });
    await makePosition(election.id);

    // One recipient has a device; the provider fails transiently. The
    // transition must hold and the outbox row must record the retry.
    await prisma.pushSubscription.create({
      data: {
        userId: v1.user.id,
        endpoint: "https://push.example.invalid/open-fanout",
        p256dh: "k",
        auth: "a",
      },
    });
    sendNotification.mockRejectedValueOnce({ statusCode: 503, body: "Unavailable" });

    const response = await call(
      transitionPOST,
      jsonRequest(`/api/admin/elections/${election.id}/transition`, {
        method: "POST",
        token: admin.token,
        body: { status: "OPEN" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(200);

    // Only eligible, active non-admin accounts were notified.
    const rows = await prisma.notification.findMany({ where: { tag: "election-open" } });
    const recipients = rows.map((row) => row.recipientId).sort((a, b) => a - b);
    expect(recipients).toEqual(
      [v1.user.id, v2.user.id, officer.user.id].sort((a, b) => a - b),
    );
    expect(recipients).not.toContain(admin.user.id);
    expect(recipients).not.toContain(inactive.user.id);
    expect(
      rows.every((row) => row.idempotencyKey?.startsWith(`election-${election.id}-open:`)),
    ).toBe(true);

    // Business state held despite the provider failure; delivery is queued.
    const stored = await prisma.election.findUnique({ where: { id: election.id } });
    expect(stored?.status).toBe("OPEN");
    const delivery = await prisma.pushDelivery.findFirst({});
    expect(delivery?.status).toBe("queued");
    expect(delivery?.attemptCount).toBe(1);

    // Repeating the transition is rejected and cannot duplicate the event.
    const repeat = await call(
      transitionPOST,
      jsonRequest(`/api/admin/elections/${election.id}/transition`, {
        method: "POST",
        token: admin.token,
        body: { status: "OPEN" },
      }),
      { pk: String(election.id) },
    );
    expect(repeat.status).toBe(400);
    expect(await prisma.notification.count({ where: { tag: "election-open" } })).toBe(3);
  });

  it("shares lifecycle events between the admin route and transitionElection", async () => {
    const voter = await makeUser("helper_voter", "voter");
    const election = await makeElection({ status: "READY" });
    await makePosition(election.id);

    // Failed transition → no state change, no notification.
    await expect(transitionElection(election, "RESULTS_PUBLISHED")).rejects.toThrow();
    expect(await prisma.notification.count({ where: { tag: "election-open" } })).toBe(0);

    // The shared helper fires the same idempotent event as the route.
    await transitionElection(election, "OPEN");
    const rows = await prisma.notification.findMany({ where: { tag: "election-open" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(voter.user.id);
    expect(rows[0].idempotencyKey).toBe(`election-${election.id}-open:${voter.user.id}`);
  });

  it("honors restricted voter lists for the open event", async () => {
    const listed = await makeUser("listed_voter", "voter");
    const unlisted = await makeUser("unlisted_voter", "voter");
    const officer = await makeUser("list_officer", "officer");
    const admin = await makeUser("list_admin", "admin");

    const election = await makeElection({ status: "READY", eligibilityPolicy: "voter_list" });
    await prisma.electionVoter.create({
      data: {
        electionId: election.id,
        uniqueKey: `u:${listed.user.id}`,
        userId: listed.user.id,
      },
    });

    const response = await call(
      transitionPOST,
      jsonRequest(`/api/admin/elections/${election.id}/transition`, {
        method: "POST",
        token: admin.token,
        body: { status: "OPEN" },
      }),
      { pk: String(election.id) },
    );
    expect(response.status).toBe(200);

    const rows = await prisma.notification.findMany({ where: { tag: "election-open" } });
    expect(rows.map((row) => row.recipientId)).toEqual([listed.user.id]);
    expect(rows.map((row) => row.recipientId)).not.toContain(unlisted.user.id);
    expect(rows.map((row) => row.recipientId)).not.toContain(officer.user.id);
  });

  /* ------------------------------------------------------------------ *
   * B. Results published                                                 *
   * ------------------------------------------------------------------ */

  it("sends the results event only after RESULTS_PUBLISHED, never on close or finalize", async () => {
    const voter = await makeUser("results_voter", "voter");
    const admin = await makeUser("results_admin", "admin");
    const election = await makeElection({ status: "CLOSED", resultVisibility: "public" });
    await makePosition(election.id);

    const finalize = await call(
      resultsPOST,
      jsonRequest(`/api/admin/elections/${election.id}/results`, {
        method: "POST",
        token: admin.token,
        body: { action: "finalize" },
      }),
      { pk: String(election.id) },
    );
    expect(finalize.status).toBe(200);
    // CLOSED/finalize alone never produces a results notification.
    expect(await prisma.notification.count({ where: { tag: "election-results" } })).toBe(0);

    const publish = await call(
      resultsPOST,
      jsonRequest(`/api/admin/elections/${election.id}/results`, {
        method: "POST",
        token: admin.token,
        body: { action: "publish" },
      }),
      { pk: String(election.id) },
    );
    expect(publish.status).toBe(200);

    const rows = await prisma.notification.findMany({ where: { tag: "election-results" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(voter.user.id);
    expect(rows[0].idempotencyKey).toBe(`election-${election.id}-results:${voter.user.id}`);
    expect(rows[0].body).toBe(`Results for ${election.title} have been published.`);

    // Retried publish cannot duplicate the event.
    const again = await call(
      resultsPOST,
      jsonRequest(`/api/admin/elections/${election.id}/results`, {
        method: "POST",
        token: admin.token,
        body: { action: "publish" },
      }),
      { pk: String(election.id) },
    );
    expect(again.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-results" } })).toBe(1);
  });

  it("withholds the results notification while the visibility policy hides results", async () => {
    const voter = await makeUser("hidden_voter", "voter");
    const admin = await makeUser("hidden_admin", "admin");
    const election = await makeElection({
      status: "CLOSED",
      resultVisibility: "hidden",
      // Clock has not passed votingEndAt, so the policy still applies.
      votingEndAt: new Date(Date.now() + DAY),
    });
    await makePosition(election.id);

    const publish = await call(
      resultsPOST,
      jsonRequest(`/api/admin/elections/${election.id}/results`, {
        method: "POST",
        token: admin.token,
        body: { action: "publish" },
      }),
      { pk: String(election.id) },
    );
    expect(publish.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-results" } })).toBe(0);
    // The state change itself still succeeded.
    const stored = await prisma.election.findUnique({ where: { id: election.id } });
    expect(stored?.status).toBe("RESULTS_PUBLISHED");
    expect(voter.user.id).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------------ *
   * C. Candidate review                                                  *
   * ------------------------------------------------------------------ */

  it("notifies the candidate once per real review and loops assigned officers in on rejection", async () => {
    const candidateUser = await makeUser("candidate_user", "voter");
    const officer = await makeUser("review_officer", "officer");
    const admin = await makeUser("review_admin", "admin");
    const election = await makeElection({ status: "NOMINATIONS" });
    const position = await makePosition(election.id);
    // Officers are scoped to a single election — never "all".
    await prisma.officerAssignment.create({
      data: { officerId: officer.user.id, scope: "election", electionId: election.id },
    });
    const candidate = await prisma.candidate.create({
      data: {
        electionId: election.id,
        positionId: position.id,
        userId: candidateUser.user.id,
        approved: false,
      },
    });

    const patch = (body: Record<string, unknown>) =>
      call(
        candidatePATCH,
        jsonRequest(
          `/api/admin/elections/${election.id}/candidates/${candidate.id}/`,
          { method: "PATCH", token: admin.token, body },
        ),
        { pk: String(election.id), candidate_id: String(candidate.id) },
      );

    // Approval → exactly one notification, to the candidate's real user.
    expect((await patch({ approved: true })).status).toBe(200);
    let rows = await prisma.notification.findMany({ where: { tag: "candidate-review" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(candidateUser.user.id);
    expect(rows[0].idempotencyKey).toMatch(
      new RegExp(`^candidate-${candidate.id}-approved-u\\d+:${candidateUser.user.id}$`),
    );

    // Repeated unchanged PATCH → status already approved → silent.
    expect((await patch({ approved: true })).status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "candidate-review" } })).toBe(1);

    // Rejection → candidate plus the assigned officer, distinct keys.
    expect((await patch({ approved: false })).status).toBe(200);
    rows = await prisma.notification.findMany({
      where: { tag: "candidate-review" },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(3);
    const recipients = rows.map((row) => row.recipientId);
    expect(recipients).toContain(candidateUser.user.id);
    expect(recipients).toContain(officer.user.id);
    expect(
      rows.some((row) => row.idempotencyKey?.includes(`candidate-${candidate.id}-rejected-officers-u`)),
    ).toBe(true);
    // Approval and rejection use different event versions (reversal ≠ retry).
    const approvalKey = rows.find((row) => row.idempotencyKey?.includes("-approved-u"))!
      .idempotencyKey!;
    const rejectionKey = rows.find(
      (row) =>
        row.idempotencyKey?.includes("-rejected-u") &&
        !row.idempotencyKey.includes("-rejected-officers-"),
    )!.idempotencyKey!;
    const approvalVersion = approvalKey.split("-u")[1]!.split(":")[0];
    const rejectionVersion = rejectionKey.split("-u")[1]!.split(":")[0];
    expect(approvalVersion).not.toBe(rejectionVersion);
    // No reviewer identity or internal notes in payloads.
    expect(JSON.stringify(rows)).not.toContain("admin");

    // Repeat of the same rejection stays silent.
    expect((await patch({ approved: false })).status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "candidate-review" } })).toBe(3);
  });

  /* ------------------------------------------------------------------ *
   * D. Campaign moderation                                               *
   * ------------------------------------------------------------------ */

  it("moderation notifies the owner only on real status changes, without the note", async () => {
    const owner = await makeUser("campaign_owner", "officer");
    const admin = await makeUser("campaign_admin", "admin");
    const election = await makeElection({ status: "NOMINATIONS" });
    const position = await makePosition(election.id);
    const candidate = await prisma.candidate.create({
      data: { electionId: election.id, positionId: position.id, userId: owner.user.id },
    });
    const campaign = await prisma.campaign.create({
      data: {
        electionId: election.id,
        candidateId: candidate.id,
        ownerId: owner.user.id,
        topic: "Manifesto",
        status: "PUBLISHED",
      },
    });

    const patch = (body: Record<string, unknown>) =>
      call(
        campaignPATCH,
        jsonRequest(`/api/admin/campaigns/${campaign.id}/`, {
          method: "PATCH",
          token: admin.token,
          body,
        }),
        { pk: String(campaign.id) },
      );

    const hide = await patch({ status: "HIDDEN", moderation_note: "SECRET internal note" });
    expect(hide.status).toBe(200);
    let rows = await prisma.notification.findMany({ where: { tag: "campaign-review" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(owner.user.id);
    expect(rows[0].idempotencyKey).toMatch(
      new RegExp(`^campaign-${campaign.id}-HIDDEN-u\\d+:${owner.user.id}$`),
    );
    // The private moderation note never reaches the payload.
    expect(rows[0].body).not.toContain("SECRET internal note");

    // Repeating the same decision is a no-op for notifications.
    expect(
      (await patch({ status: "HIDDEN", moderation_note: "SECRET internal note" })).status,
    ).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "campaign-review" } })).toBe(1);

    // A legitimate reversal is a distinct event.
    expect((await patch({ status: "PUBLISHED" })).status).toBe(200);
    rows = await prisma.notification.findMany({
      where: { tag: "campaign-review" },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].idempotencyKey).toMatch(new RegExp(`^campaign-${campaign.id}-PUBLISHED-u\\d+:`));
    expect(rows[1].idempotencyKey).not.toBe(rows[0].idempotencyKey);
  });

  /* ------------------------------------------------------------------ *
   * E. Voter added                                                       *
   * ------------------------------------------------------------------ */

  it("notifies only genuinely new voter-list entries, never bogus ids", async () => {
    const existingVoter = await makeUser("vlist_existing", "voter");
    const freshVoter = await makeUser("vlist_fresh", "voter");
    const officer = await makeUser("vlist_officer", "officer");
    const election = await makeElection({ status: "READY", createdBy: officer.user.id });
    await prisma.electionVoter.create({
      data: {
        electionId: election.id,
        uniqueKey: `u:${existingVoter.user.id}`,
        userId: existingVoter.user.id,
      },
    });

    const body = {
      user_ids: [existingVoter.user.id, freshVoter.user.id, 999999],
      identifiers: ["ID-123"],
    };
    const add = () =>
      call(
        votersPOST,
        jsonRequest(`/api/elections/${election.id}/voters/`, {
          method: "POST",
          token: officer.token,
          body,
        }),
        { pk: String(election.id) },
      );

    const first = await add();
    expect(first.status).toBe(200);
    const firstBody = await readJson(first);
    expect(firstBody.added).toBe(3); // existing skipped; bogus id + identifier inserted
    expect(firstBody.skipped).toBe(1);

    // Only the newly inserted real account is notified; identifier-only rows
    // and unknown user ids have no resolvable recipient.
    const rows = await prisma.notification.findMany({ where: { tag: "voter-added" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(freshVoter.user.id);
    expect(rows[0].idempotencyKey).toBe(
      `election-${election.id}-voter-added:${freshVoter.user.id}`,
    );

    // Retried identical upload → nothing newly inserted → silent.
    const repeat = await add();
    expect(repeat.status).toBe(200);
    expect((await readJson(repeat)).added).toBe(0);
    expect(await prisma.notification.count({ where: { tag: "voter-added" } })).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * E2. Voter removed                                                    *
   * ------------------------------------------------------------------ */

  it("notifies a removed voter with accurate remaining-eligibility wording", async () => {
    const kept = await makeUser("vremove_voter", "voter");
    const gone = await makeUser("vremove_officer", "officer");
    const actor = await makeUser("vremove_actor", "officer");
    const election = await makeElection({ status: "READY", createdBy: actor.user.id });
    // Position group restricted to plain voters: the officer on the list has
    // no other eligibility rule, while the voter keeps one after removal.
    await makePosition(election.id, "staff");
    await prisma.electionVoter.createMany({
      data: [
        { electionId: election.id, uniqueKey: `u:${kept.user.id}`, userId: kept.user.id },
        { electionId: election.id, uniqueKey: `u:${gone.user.id}`, userId: gone.user.id },
      ],
    });

    const remove = (voterRowId: number) =>
      call(
        voterDELETE,
        jsonRequest(`/api/elections/${election.id}/voters/${voterRowId}/`, {
          method: "DELETE",
          token: actor.token,
        }),
        { pk: String(election.id), voter_pk: String(voterRowId) },
      );

    const goneRow = await prisma.electionVoter.findFirst({
      where: { electionId: election.id, userId: gone.user.id },
    });
    const keptRow = await prisma.electionVoter.findFirst({
      where: { electionId: election.id, userId: kept.user.id },
    });
    expect((await remove(goneRow!.id)).status).toBe(204);
    expect((await remove(keptRow!.id)).status).toBe(204);

    const rows = await prisma.notification.findMany({
      where: { tag: "voter-removed" },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    const forGone = rows.find((row) => row.recipientId === gone.user.id)!;
    const forKept = rows.find((row) => row.recipientId === kept.user.id)!;
    expect(forGone.body).toContain("no longer listed as an eligible voter");
    expect(forKept.body).toContain("still qualifies to vote");
    expect(forGone.idempotencyKey).toBe(
      `election-${election.id}-voter-removed:${gone.user.id}`,
    );
  });

  /* ------------------------------------------------------------------ *
   * F. Officer revoked                                                   *
   * ------------------------------------------------------------------ */

  it("revokes officer access once and stays silent on a repeated delete", async () => {
    const officer = await makeUser("revoked_officer", "officer");
    const admin = await makeUser("revoked_admin", "admin");
    const election = await makeElection({});
    const assignment = await prisma.officerAssignment.create({
      data: { officerId: officer.user.id, scope: "election", electionId: election.id },
    });

    const remove = () =>
      call(
        officerAssignmentDELETE,
        jsonRequest(`/api/admin/officers/${assignment.id}/`, {
          method: "DELETE",
          token: admin.token,
        }),
        { pk: String(assignment.id) },
      );

    expect((await remove()).status).toBe(200);
    const rows = await prisma.notification.findMany({ where: { tag: "officer-revoked" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(officer.user.id);
    expect(rows[0].idempotencyKey).toBe(
      `assignment-${assignment.id}-revoked:${officer.user.id}`,
    );
    expect(rows[0].body).toBe("Your election officer assignment has been revoked.");

    // The repeated DELETE finds an already-inactive assignment → silent.
    expect((await remove()).status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "officer-revoked" } })).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * G. Election schedule changed                                         *
   * ------------------------------------------------------------------ */

  it("pings voters only when the voting schedule really changes (admin and officer paths)", async () => {
    const voter = await makeUser("schedule_voter", "voter");
    const admin = await makeUser("schedule_admin", "admin");
    const officer = await makeUser("schedule_officer", "officer");
    const election = await makeElection({ status: "READY", createdBy: officer.user.id });
    await makePosition(election.id, "staff");

    const adminPatch = (body: Record<string, unknown>) =>
      call(
        schedulePATCH,
        jsonRequest(`/api/admin/elections/${election.id}/schedule/`, {
          method: "PATCH",
          token: admin.token,
          body,
        }),
        { pk: String(election.id) },
      );

    const newStart = new Date(election.votingStartAt.getTime() + DAY);
    const newEnd = new Date(election.votingEndAt.getTime() + DAY);

    // Real change → one notification keyed by both normalized instants.
    const first = await adminPatch({
      voting_start_at: newStart.toISOString(),
      voting_end_at: newEnd.toISOString(),
    });
    expect(first.status).toBe(200);
    let rows = await prisma.notification.findMany({ where: { tag: "election-rescheduled" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(voter.user.id);
    expect(rows[0].idempotencyKey).toBe(
      `election-${election.id}-schedule-${newStart.getTime()}-${newEnd.getTime()}:${voter.user.id}`,
    );
    expect(rows[0].body).toContain("UTC");

    // Duplicate PATCH with identical persisted values → no event.
    const duplicate = await adminPatch({
      voting_start_at: newStart.toISOString(),
      voting_end_at: newEnd.toISOString(),
    });
    expect(duplicate.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-rescheduled" } })).toBe(1);

    // End-only change → a distinguishable revision.
    const laterEnd = new Date(newEnd.getTime() + DAY);
    expect((await adminPatch({ voting_end_at: laterEnd.toISOString() })).status).toBe(200);
    rows = await prisma.notification.findMany({
      where: { tag: "election-rescheduled" },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].idempotencyKey).toBe(
      `election-${election.id}-schedule-${newStart.getTime()}-${laterEnd.getTime()}:${voter.user.id}`,
    );

    // The officer update path behaves identically.
    const officerEnd = new Date(laterEnd.getTime() + DAY);
    const officerUpdate = await call(
      officerElectionPATCH,
      jsonRequest(`/api/officer/elections/${election.id}/`, {
        method: "PATCH",
        token: officer.token,
        body: { voting_end_at: officerEnd.toISOString() },
      }),
      { pk: String(election.id) },
    );
    expect(officerUpdate.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-rescheduled" } })).toBe(3);

    // A never-published draft stays silent.
    const draft = await makeElection({ status: "DRAFT", isPublished: false });
    const draftUpdate = await call(
      schedulePATCH,
      jsonRequest(`/api/admin/elections/${draft.id}/schedule/`, {
        method: "PATCH",
        token: admin.token,
        body: { voting_end_at: new Date(draft.votingEndAt.getTime() + DAY).toISOString() },
      }),
      { pk: String(draft.id) },
    );
    expect(draftUpdate.status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-rescheduled" } })).toBe(3);
  });

  /* ------------------------------------------------------------------ *
   * H. Contact message                                                   *
   * ------------------------------------------------------------------ */

  it("fans contact messages out to active administrators only, without message content", async () => {
    const admin = await makeUser("contact_admin", "admin");
    await makeUser("contact_admin_off", "admin", { isActive: false });
    await makeUser("contact_officer", "officer");
    await makeUser("contact_voter", "voter");

    const submit = () =>
      call(
        contactPOST,
        jsonRequest("/api/contact/", {
          method: "POST",
          body: {
            name: "Ada",
            email: "ada@example.invalid",
            subject: "Ballot access",
            message: "I cannot reach the polling page, please help me with my ballot.",
          },
        }),
      );

    const first = await submit();
    expect(first.status).toBe(201);
    const contactId = (await readJson(first)).id as number;

    const rows = await prisma.notification.findMany({ where: { tag: "contact-new" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(admin.user.id);
    expect(rows[0].idempotencyKey).toBe(`contact-${contactId}:${admin.user.id}`);
    expect(rows[0].targetUrl).toBe("/admin/dashboard");
    expect(rows[0].body).toBe("A new contact message has been received.");
    // Neither the message text nor sender details leak into the payload.
    expect(JSON.stringify(rows)).not.toContain("ada@example.invalid");
    expect(JSON.stringify(rows).toLowerCase()).not.toContain("ballot");

    // With no active administrators the message still persists, and the
    // fan-out simply records zero recipients.
    await prisma.user.updateMany({ where: { role: "admin" }, data: { isActive: false } });
    const second = await submit();
    expect(second.status).toBe(201);
    expect(await prisma.contactMessage.count()).toBe(2);
    expect(await prisma.notification.count({ where: { tag: "contact-new" } })).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * B2. Archived / cancelled                                             *
   * ------------------------------------------------------------------ */

  it("announces archive and cancellation only for previously public elections", async () => {
    const voter = await makeUser("archive_voter", "voter");
    const admin = await makeUser("archive_admin", "admin");
    const officer = await makeUser("archive_officer", "officer");

    const archive = (electionId: number) =>
      call(
        transitionPOST,
        jsonRequest(`/api/admin/elections/${electionId}/transition`, {
          method: "POST",
          token: admin.token,
          body: { status: "ARCHIVED" },
        }),
        { pk: String(electionId) },
      );

    // Previously public election → the eligible audience is told.
    const publicElection = await makeElection({
      status: "PUBLISHED",
      createdBy: officer.user.id,
    });
    await makePosition(publicElection.id, "staff");
    expect((await archive(publicElection.id)).status).toBe(200);
    let rows = await prisma.notification.findMany({ where: { tag: "election-archived" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientId).toBe(voter.user.id);
    expect(rows[0].idempotencyKey).toBe(
      `election-${publicElection.id}-archived:${voter.user.id}`,
    );

    // Drafts were never public → silent.
    const draft = await makeElection({ status: "DRAFT", createdBy: officer.user.id });
    await makePosition(draft.id, "staff");
    expect((await archive(draft.id)).status).toBe(200);
    expect(await prisma.notification.count({ where: { tag: "election-archived" } })).toBe(1);

    // Hard delete (cancellation) of a previously public election → notice,
    // resolved while the eligibility rows still existed.
    const doomed = await makeElection({ status: "PUBLISHED", createdBy: officer.user.id });
    await makePosition(doomed.id, "staff");
    const remove = await call(
      officerElectionDELETE,
      jsonRequest(`/api/officer/elections/${doomed.id}/`, {
        method: "DELETE",
        token: officer.token,
      }),
      { pk: String(doomed.id) },
    );
    expect(remove.status).toBe(204);
    rows = await prisma.notification.findMany({ where: { tag: "election-removed" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotencyKey).toBe(`election-${doomed.id}-removed:${voter.user.id}`);

    // Deleting a draft → no cancellation notice.
    const draftDoomed = await makeElection({ status: "DRAFT", createdBy: officer.user.id });
    const removeDraft = await call(
      officerElectionDELETE,
      jsonRequest(`/api/officer/elections/${draftDoomed.id}/`, {
        method: "DELETE",
        token: officer.token,
      }),
      { pk: String(draftDoomed.id) },
    );
    expect(removeDraft.status).toBe(204);
    expect(await prisma.notification.count({ where: { tag: "election-removed" } })).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * Large fan-out                                                        *
   * ------------------------------------------------------------------ */

  it("persists a recoverable outbox for large fan-outs without blocking the transition", async () => {
    const admin = await makeUser("large_admin", "admin");
    const voterIds: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const created = await prisma.user.create({
        data: {
          username: `large_voter_${i}_${Date.now().toString(36)}`,
          password: hashPassword("Pass1234!"),
          role: "voter",
        },
      });
      voterIds.push(created.id);
    }
    const election = await makeElection({ status: "READY" });
    await makePosition(election.id);
    await prisma.pushSubscription.createMany({
      data: [
        { userId: voterIds[0], endpoint: "https://push.example.invalid/large-0", p256dh: "k", auth: "a" },
        { userId: voterIds[1], endpoint: "https://push.example.invalid/large-1", p256dh: "k", auth: "a" },
      ],
    });

    const response = await call(
      transitionPOST,
      jsonRequest(`/api/admin/elections/${election.id}/transition`, {
        method: "POST",
        token: admin.token,
        body: { status: "OPEN" },
      }),
      { pk: String(election.id) },
    );
    // The business action is never blocked or rolled back by delivery work.
    expect(response.status).toBe(200);
    const stored = await prisma.election.findUnique({ where: { id: election.id } });
    expect(stored?.status).toBe("OPEN");

    expect(await prisma.notification.count({ where: { tag: "election-open" } })).toBe(30);
    // Outbox rows are persisted synchronously, so deferred attempts above the
    // inline threshold remain recoverable by the retry drain.
    const deliveries = await prisma.pushDelivery.findMany({});
    expect(deliveries).toHaveLength(2);
    expect(
      deliveries.every((row) => ["pending", "queued", "accepted"].includes(row.status)),
    ).toBe(true);
  });

  /* ------------------------------------------------------------------ *
   * Scheduled reminders (library helper; no platform cron)            *
   * ------------------------------------------------------------------ */

  it("sends closing/opening reminders deduplicated per schedule revision", async () => {
    const voter = await makeUser("cron_voter", "voter");
    const now = Date.now();
    const closingElection = await makeElection({
      status: "OPEN",
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + HOUR),
    });
    await makePosition(closingElection.id);
    const openingElection = await makeElection({
      status: "READY",
      votingStartAt: new Date(now + 30 * 60 * 1000),
      votingEndAt: new Date(now + DAY),
    });
    await makePosition(openingElection.id);
    const endedElection = await makeElection({
      status: "OPEN",
      votingStartAt: new Date(now - DAY),
      votingEndAt: new Date(now - HOUR),
    });
    await makePosition(endedElection.id);

    const summary = await runElectionReminders(new Date(now));
    expect(summary.closingChecked).toBe(1);
    expect(summary.openingChecked).toBe(1);
    expect(summary.closingNotified).toBe(1);
    expect(summary.openingNotified).toBe(1);

    const closingRows = await prisma.notification.findMany({ where: { tag: "election-closing" } });
    expect(closingRows).toHaveLength(1);
    expect(closingRows[0].recipientId).toBe(voter.user.id);
    expect(closingRows[0].idempotencyKey).toBe(
      `election-${closingElection.id}-closing-${closingElection.votingEndAt.getTime()}:${voter.user.id}`,
    );

    const openingRows = await prisma.notification.findMany({
      where: { tag: "election-opening" },
    });
    expect(openingRows).toHaveLength(1);
    expect(openingRows[0].idempotencyKey).toBe(
      `election-${openingElection.id}-opening-${openingElection.votingStartAt.getTime()}:${voter.user.id}`,
    );

    // An election whose voting already ended is never reminded.
    expect(
      await prisma.notification.count({
        where: { idempotencyKey: { startsWith: `election-${endedElection.id}-closing` } },
      }),
    ).toBe(0);

    // Repeat run → fully deduplicated, still re-checking state.
    const secondSummary = await runElectionReminders(new Date(now));
    expect(secondSummary.closingChecked).toBe(1);
    expect(secondSummary.closingNotified).toBe(0);
    expect(secondSummary.openingNotified).toBe(0);
    expect(await prisma.notification.count({ where: { tag: "election-closing" } })).toBe(1);
    expect(await prisma.notification.count({ where: { tag: "election-opening" } })).toBe(1);
  });
});
