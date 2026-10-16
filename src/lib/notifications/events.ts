import { prisma } from "@/src/lib/db";
import { notify, type NotifyOutcome } from "@/src/lib/notifications/notify";
import { LIST_BASED_POLICIES } from "@/src/lib/eligibility";
import { eligibleUserIdsForPosition, resultsVisible, VOTING_ROLES } from "@/src/lib/services";
import { formatDateTime } from "@/src/lib/time";
import type { UserWithRelations } from "@/src/lib/auth";
import type { Election } from "@/src/generated/prisma/client";

/**
 * Event-driven notification wiring.
 *
 * Every state change that should ping users resolves its recipients from
 * authoritative data here — position eligibility, voter lists, record
 * ownership, officer assignments — never from request input. Each helper:
 *
 *  - routes through `notify()` with a stable idempotency key so retries,
 *    repeated requests and concurrent writers cannot create duplicates;
 *  - runs inside `runEvent`, so a notification failure is logged and never
 *    fails the business action that triggered it;
 *  - logs only ids, counts and statuses — never message bodies, identifiers,
 *    moderation notes or subscription secrets.
 *
 * Keys follow the existing `{event}:{recipient}` convention (notify() appends
 * the recipient scope). Event-specific revisions (timestamps of the actual
 * persisted flip) keep legitimate reversals distinguishable from retries.
 */

/** Statuses from which archiving/removal is a public cancellation event. */
export const PUBLIC_ACTIVE_STATUSES = new Set(["PUBLISHED", "NOMINATIONS", "READY", "OPEN"]);

const CLOSING_REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h before voting ends
const OPENING_REMINDER_WINDOW_MS = 60 * 60 * 1000; // 1h before voting starts

type NotifySummary = {
  created: number;
  deduplicated: number;
  deliveriesQueued: number;
};

function summarize(outcome: NotifyOutcome): NotifySummary {
  return {
    created: outcome.createdIds.length,
    deduplicated: outcome.duplicateOf.length,
    deliveriesQueued: outcome.deliveriesQueued,
  };
}

/** Structured, privacy-safe log line (ids/counts/statuses only). */
function logEvent(event: string, detail: Record<string, unknown>, outcome: string) {
  console.log(`[notify-event] ${event} ${JSON.stringify(detail)} ${outcome}`);
}

/**
 * Runs one notification event, converting any failure into a log line.
 * Returns the event's summary, or null when it failed.
 */
async function runEvent<T extends NotifySummary>(
  event: string,
  detail: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    const summary = await run();
    logEvent(event, detail, JSON.stringify({ outcome: "ok", ...summary }));
    return summary;
  } catch (error) {
    logEvent(
      event,
      detail,
      JSON.stringify({
        outcome: "error",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return null;
  }
}

/**
 * Single source of truth for "who may vote in this election", mirroring
 * `checkElectionEligibility`:
 *
 *  - list-based policies (and identifier-verified lists) admit only
 *    account-bound voter-list rows — position eligibility cannot bypass a
 *    required list;
 *  - otherwise the union of position eligibility (identical to the
 *    announcement pipeline) and explicit voter-list rows.
 *
 * Deactivated accounts and admin accounts are always excluded; identifier-only
 * rows (no linked account) can never receive notifications.
 */
export async function electionRecipientIds(election: Election): Promise<number[]> {
  const listRows = await prisma.electionVoter.findMany({
    where: { electionId: election.id, userId: { not: null } },
    select: { userId: true },
  });
  const listIds = [
    ...new Set(listRows.map((row) => row.userId).filter((id): id is number => id !== null)),
  ];

  const listBased = LIST_BASED_POLICIES.has(election.eligibilityPolicy);
  const requiresIdentifier = election.voterIdMethod !== "account";
  const hasList = await prisma.electionVoter.count({ where: { electionId: election.id } });
  const needsListEntry =
    listBased || (requiresIdentifier && hasList > 0 && election.eligibilityPolicy !== "open");

  const ids = new Set<number>(listIds);
  if (!needsListEntry) {
    const positions = await prisma.position.findMany({
      where: { electionId: election.id },
      include: { department: true, section: { include: { department: true } } },
    });
    for (const position of positions) {
      for (const id of await eligibleUserIdsForPosition(position)) ids.add(id);
    }
  }

  if (!ids.size) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] }, isActive: true, role: { in: VOTING_ROLES } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/**
 * Officers who actually administer this election: platform-wide assignments,
 * assignments scoped to this election or its organization, plus the creator.
 * Only active accounts with an officer/admin role qualify.
 */
export async function assignedOfficerIds(
  election: Pick<Election, "id" | "createdBy" | "organizationId">,
): Promise<number[]> {
  const assignments = await prisma.officerAssignment.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: "all" },
        { scope: "election", electionId: election.id },
        ...(election.organizationId
          ? [{ scope: "organization", organizationId: election.organizationId }]
          : []),
      ],
    },
    select: { officerId: true },
  });
  const ids = new Set<number>(assignments.map((row) => row.officerId));
  if (election.createdBy) ids.add(election.createdBy);
  if (!ids.size) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] }, isActive: true, role: { in: ["officer", "admin"] } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/* ------------------------------------------------------------------ *
 * Lifecycle events (shared by every transition entry point)            *
 * ------------------------------------------------------------------ */

/**
 * Fires the right event by comparing the persisted previous status with the
 * persisted result — never by reading a status after an update and assuming a
 * transition happened. Call only AFTER the update has committed.
 */
export async function notifyElectionStatusChange(
  prevStatus: string,
  election: Election,
): Promise<void> {
  if (prevStatus === election.status) return;
  if (election.status === "OPEN") {
    await notifyElectionOpened(election);
  } else if (election.status === "RESULTS_PUBLISHED") {
    await notifyElectionResultsPublished(election);
  } else if (election.status === "ARCHIVED" && PUBLIC_ACTIVE_STATUSES.has(prevStatus)) {
    await notifyElectionArchived(election, prevStatus);
  }
}

/** Voting opened (admin transition route + shared transition helper). */
export async function notifyElectionOpened(election: Election): Promise<void> {
  await runEvent("election.open", { electionId: election.id }, async () => {
    const recipients = await electionRecipientIds(election);
    const outcome = await notify({
      recipientIds: recipients,
      title: "Voting is now open",
      body: `Voting has started for ${election.title}. Review the election details and cast your vote if eligible.`,
      targetUrl: `/elections/${election.slug}`,
      tag: "election-open",
      category: "election",
      idempotencyKey: `election-${election.id}-open`,
      data: { electionId: election.id },
    });
    return { recipients: recipients.length, ...summarize(outcome) };
  });
}

/**
 * Results genuinely published. Recipients are filtered through the election's
 * own `resultVisibility` policy, and the payload never contains totals,
 * winners, participation or any other restricted detail.
 */
export async function notifyElectionResultsPublished(election: Election): Promise<void> {
  await runEvent("election.results_published", { electionId: election.id }, async () => {
    const ids = await electionRecipientIds(election);
    if (!ids.length) {
      return { recipients: 0, created: 0, deduplicated: 0, deliveriesQueued: 0 };
    }
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true },
    });
    // Enforce resultVisibility per recipient before anything is queued.
    const allowed = users
      .filter((user) => resultsVisible(election, user as unknown as UserWithRelations))
      .map((user) => user.id);
    const outcome = await notify({
      recipientIds: allowed,
      title: "Election results are available",
      body: `Results for ${election.title} have been published.`,
      targetUrl: `/elections/${election.slug}`,
      tag: "election-results",
      category: "election",
      idempotencyKey: `election-${election.id}-results`,
      data: { electionId: election.id },
    });
    return { recipients: allowed.length, ...summarize(outcome) };
  });
}

/**
 * Result card published by an election officer. Unlike the lifecycle fan-out
 * above, recipients are exactly the accounts that cast a ballot in this
 * election — resolved from the Vote table, never from request input — and the
 * notification opens the published result card itself.
 */
export async function notifyElectionResultsReady(election: Election): Promise<void> {
  await runEvent("election.result_card_published", { electionId: election.id }, async () => {
    const votes = await prisma.vote.findMany({
      where: { electionId: election.id },
      select: { voterId: true },
      distinct: ["voterId"],
    });
    if (!votes.length) {
      return { recipients: 0, created: 0, deduplicated: 0, deliveriesQueued: 0 };
    }
    const users = await prisma.user.findMany({
      where: { id: { in: votes.map((vote) => vote.voterId) }, isActive: true },
      select: { id: true },
    });
    const outcome = await notify({
      recipientIds: users.map((user) => user.id),
      title: "Election results are published",
      body: `The results for ${election.title} are out. Open the result card to see the winner.`,
      targetUrl: `/results/${election.slug}`,
      tag: "election-result-card",
      category: "election",
      idempotencyKey: `election-${election.id}-result-card`,
      data: { electionId: election.id },
    });
    return { recipients: users.length, ...summarize(outcome) };
  });
}

/** Archive announced only when the election was previously public. */
export async function notifyElectionArchived(
  election: Election,
  prevStatus: string,
): Promise<void> {
  await runEvent(
    "election.archived",
    { electionId: election.id, prevStatus },
    async () => {
      const recipients = await electionRecipientIds(election);
      const outcome = await notify({
        recipientIds: recipients,
        title: "Election no longer active",
        body: "This election has been archived and is no longer active.",
        targetUrl: "/elections",
        tag: "election-archived",
        category: "election",
        idempotencyKey: `election-${election.id}-archived`,
        data: { electionId: election.id },
      });
      return { recipients: recipients.length, ...summarize(outcome) };
    },
  );
}

/**
 * Hard deletion (cancellation) of a previously public election. Recipients
 * must be resolved BEFORE the delete — the cascade removes positions and
 * voter lists — and passed in here.
 */
export async function notifyElectionRemoved(
  election: Pick<Election, "id" | "title">,
  recipientIds: number[],
): Promise<void> {
  await runEvent("election.removed", { electionId: election.id }, async () => {
    const outcome = await notify({
      recipientIds,
      title: "Election no longer available",
      body: `This election has been removed and is no longer available.`,
      targetUrl: "/elections",
      tag: "election-removed",
      category: "election",
      idempotencyKey: `election-${election.id}-removed`,
      data: { electionId: election.id },
    });
    return { recipients: recipientIds.length, ...summarize(outcome) };
  });
}

/**
 * Voting schedule changed (admin schedule route + officer update route).
 * Fires only when the persisted instants actually differ; the key carries both
 * normalized timestamps so start-only, end-only and combined revisions stay
 * distinct while retries of an unchanged schedule stay silent. Draft (never
 * published) elections do not ping voters.
 */
export async function notifyElectionRescheduled(
  previous: Pick<Election, "votingStartAt" | "votingEndAt">,
  election: Election,
): Promise<void> {
  const startChanged = previous.votingStartAt.getTime() !== election.votingStartAt.getTime();
  const endChanged = previous.votingEndAt.getTime() !== election.votingEndAt.getTime();
  if (!startChanged && !endChanged) return;
  if (!election.isPublished) return;

  await runEvent(
    "election.rescheduled",
    { electionId: election.id, startChanged, endChanged },
    async () => {
      const recipients = await electionRecipientIds(election);
      const timezone = election.timezone || "UTC";
      const start = formatDateTime(election.votingStartAt, timezone);
      const end = formatDateTime(election.votingEndAt, timezone);
      const outcome = await notify({
        recipientIds: recipients,
        title: "Election schedule changed",
        body: `Voting for ${election.title} now runs ${start} to ${end} (${timezone}).`,
        targetUrl: `/elections/${election.slug}`,
        tag: "election-rescheduled",
        category: "election",
        idempotencyKey:
          `election-${election.id}-schedule-` +
          `${election.votingStartAt.getTime()}-${election.votingEndAt.getTime()}`,
        data: {
          electionId: election.id,
          votingStartAt: election.votingStartAt.toISOString(),
          votingEndAt: election.votingEndAt.toISOString(),
        },
      });
      return { recipients: recipients.length, ...summarize(outcome) };
    },
  );
}

/* ------------------------------------------------------------------ *
 * Ownership / assignment events                                        *
 * ------------------------------------------------------------------ */

/**
 * Candidate review decision. `version` is the timestamp of the actual
 * guarded flip (CAS on the previous value), so a retried PATCH that finds the
 * status already changed stays silent, while a legitimate later reversal
 * produces a new key and notifies again. On rejection the assigned officers
 * receive a follow-up under a distinct event key.
 */
export async function notifyCandidateReviewed(
  election: Pick<Election, "id" | "title" | "slug" | "createdBy" | "organizationId">,
  candidate: { id: number; userId: number },
  approved: boolean,
  version: number,
): Promise<void> {
  const decision = approved ? "approved" : "rejected";
  await runEvent(
    "candidate.reviewed",
    { electionId: election.id, candidateId: candidate.id, decision, version },
    async () => {
      const outcome = await notify({
        recipientIds: [candidate.userId],
        title: approved ? "Candidate application approved" : "Candidate application update",
        body: approved
          ? `Your candidate application for ${election.title} has been approved.`
          : `Your candidate application for ${election.title} was not approved.`,
        targetUrl: `/elections/${election.slug}`,
        tag: "candidate-review",
        category: "election",
        idempotencyKey: `candidate-${candidate.id}-${decision}-u${version}`,
        data: { electionId: election.id, candidateId: candidate.id },
      });

      let officersNotified = 0;
      if (!approved) {
        const officers = (await assignedOfficerIds(election)).filter(
          (id) => id !== candidate.userId,
        );
        if (officers.length) {
          const officerOutcome = await notify({
            recipientIds: officers,
            title: "Candidate application update",
            body: `A candidate application for ${election.title} was not approved.`,
            targetUrl: `/elections/${election.slug}`,
            tag: "candidate-review",
            category: "election",
            idempotencyKey: `candidate-${candidate.id}-rejected-officers-u${version}`,
            data: { electionId: election.id, candidateId: candidate.id },
          });
          officersNotified = officerOutcome.createdIds.length;
        }
      }
      return { ...summarize(outcome), deliveriesQueued: outcome.deliveriesQueued, officersNotified };
    },
  );
}

/**
 * Campaign moderation decision. `version` is the moderatedAt instant of the
 * guarded flip; retries that find the status already set stay silent. The
 * moderation note is never part of the payload.
 */
export async function notifyCampaignModerated(
  campaign: { id: number; topic: string; ownerId: number | null },
  status: string,
  version: number,
): Promise<void> {
  await runEvent(
    "campaign.moderated",
    { campaignId: campaign.id, status, ownerId: campaign.ownerId ?? 0, version },
    async () => {
      if (campaign.ownerId === null) {
        // Ownerless campaigns have no resolvable recipient; recorded above.
        return { recipients: 0, created: 0, deduplicated: 0, deliveriesQueued: 0 };
      }
      const content =
        status === "PUBLISHED"
          ? {
              title: "Campaign published",
              body: `Your campaign "${campaign.topic}" is now visible to voters.`,
            }
          : status === "HIDDEN"
            ? {
                title: "Campaign hidden",
                body: `Your campaign "${campaign.topic}" has been hidden from voters.`,
              }
            : status === "REJECTED"
              ? {
                  title: "Campaign update",
                  body: `Your campaign "${campaign.topic}" was not approved.`,
                }
              : {
                  title: "Campaign status updated",
                  body: `The status of your campaign "${campaign.topic}" was updated.`,
                };
      const outcome = await notify({
        recipientIds: [campaign.ownerId],
        title: content.title,
        body: content.body,
        targetUrl: "/elections",
        tag: "campaign-review",
        category: "campaign",
        idempotencyKey: `campaign-${campaign.id}-${status}-u${version}`,
        data: { campaignId: campaign.id, status },
      });
      return { recipients: 1, ...summarize(outcome) };
    },
  );
}

/** Officer assignment revoked (soft delete of the assignment). */
export async function notifyOfficerRevoked(
  assignment: { id: number; officerId: number },
): Promise<void> {
  await runEvent("officer.revoked", { assignmentId: assignment.id }, async () => {
    const outcome = await notify({
      recipientIds: [assignment.officerId],
      title: "Election officer access updated",
      body: "Your election officer assignment has been revoked.",
      targetUrl: "/officer/dashboard",
      tag: "officer-revoked",
      category: "officer",
      idempotencyKey: `assignment-${assignment.id}-revoked`,
      data: { assignmentId: assignment.id },
    });
    return { recipients: 1, ...summarize(outcome) };
  });
}

/* ------------------------------------------------------------------ *
 * Voter-list events                                                    *
 * ------------------------------------------------------------------ */

/**
 * Accounts newly bound to the voter list. The caller passes only rows whose
 * list entry was actually created (pre-existing rows are excluded); this
 * helper additionally filters to active ballot-capable accounts, so bogus or
 * deactivated user ids in a request can never be notified.
 */
export async function notifyVotersAdded(
  election: Pick<Election, "id" | "title" | "slug">,
  userIds: number[],
): Promise<void> {
  const wanted = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!wanted.length) return;

  await runEvent(
    "election.voter_added",
    { electionId: election.id, requested: wanted.length },
    async () => {
      const users = await prisma.user.findMany({
        where: { id: { in: wanted }, isActive: true, role: { in: VOTING_ROLES } },
        select: { id: true },
      });
      const outcome = await notify({
        recipientIds: users.map((user) => user.id),
        title: "You have been added to an election",
        body: `You are now listed as an eligible voter for ${election.title}. Review the election details and voting schedule.`,
        targetUrl: `/elections/${election.slug}`,
        tag: "voter-added",
        category: "election",
        idempotencyKey: `election-${election.id}-voter-added`,
        data: { electionId: election.id },
      });
      return { recipients: users.length, ...summarize(outcome) };
    },
  );
}

/**
 * Voter-list entry removed. `stillEligible` must be computed AFTER the delete
 * (position-based or other rules may still qualify the account) so the wording
 * never claims revoked access the user does not actually have — and never
 * implies voting rights that were really revoked.
 */
export async function notifyVoterRemoved(
  election: Pick<Election, "id" | "title" | "slug">,
  userId: number,
  stillEligible: boolean,
): Promise<void> {
  await runEvent(
    "election.voter_removed",
    { electionId: election.id, userId, stillEligible },
    async () => {
      const users = await prisma.user.findMany({
        where: { id: userId, isActive: true, role: { in: VOTING_ROLES } },
        select: { id: true },
      });
      const outcome = await notify({
        recipientIds: users.map((user) => user.id),
        title: "Voter list updated",
        body: stillEligible
          ? `Your manual voter-list entry for ${election.title} was removed, but your account still qualifies to vote in this election.`
          : `You are no longer listed as an eligible voter for ${election.title}.`,
        targetUrl: `/elections/${election.slug}`,
        tag: "voter-removed",
        category: "election",
        idempotencyKey: `election-${election.id}-voter-removed`,
        data: { electionId: election.id },
      });
      return { recipients: users.length, ...summarize(outcome) };
    },
  );
}

/* ------------------------------------------------------------------ *
 * Support inbox                                                        *
 * ------------------------------------------------------------------ */

/**
 * New contact message → every active administrator. Recipients come from the
 * database (never from the public form), and the payload carries no sender
 * details and none of the message text.
 */
export async function notifyContactReceived(contactId: number): Promise<void> {
  await runEvent("contact.received", { contactId }, async () => {
    const admins = await prisma.user.findMany({
      where: { role: "admin", isActive: true },
      select: { id: true },
    });
    const outcome = await notify({
      recipientIds: admins.map((admin) => admin.id),
      title: "New contact message",
      body: "A new contact message has been received.",
      targetUrl: "/admin/messages",
      tag: "contact-new",
      category: "contact",
      idempotencyKey: `contact-${contactId}`,
      data: { contactId },
    });
    return { recipients: admins.length, ...summarize(outcome) };
  });
}

/**
 * Administrator reply on a contact message → the sender's account, when the
 * message was submitted while signed in. The reply text is the notification
 * body so the sender can read it straight from the bell (or the push), and
 * tapping it opens the contact page to write back. Anonymous messages have no
 * account to notify; the reply is still stored on the message.
 */
export async function notifyContactReplied(contactId: number): Promise<void> {
  await runEvent("contact.replied", { contactId }, async () => {
    const contact = await prisma.contactMessage.findUnique({
      where: { id: contactId },
      include: { user: { select: { id: true, isActive: true } } },
    });
    if (!contact?.reply || !contact.userId || !contact.user?.isActive) {
      return { recipients: 0, created: 0, deduplicated: 0, deliveriesQueued: 0 };
    }
    const outcome = await notify({
      recipientIds: [contact.userId],
      title: `Reply: ${contact.subject}`.slice(0, 180),
      body: contact.reply,
      targetUrl: "/contact",
      tag: `contact-reply-${contactId}`,
      category: "contact",
      // A fresh key per reply revision so a corrected reply notifies again
      // while retries of the same write dedupe.
      idempotencyKey: `contact-reply-${contactId}-${contact.repliedAt?.getTime() ?? 0}`,
      data: { contactId },
    });
    return { recipients: 1, ...summarize(outcome) };
  });
}

/* ------------------------------------------------------------------ *
 * Scheduled reminders (driven by the platform scheduler)               *
 * ------------------------------------------------------------------ */

export type ReminderRunSummary = {
  closingChecked: number;
  closingNotified: number;
  openingChecked: number;
  openingNotified: number;
};

/**
 * "Voting ends soon" / "Voting opens soon" reminders.
 *
 * Callable from any authenticated job (manual trigger, uptime monitor, or a
 * once-daily platform cron — the hosting plan here only allows daily crons, so
 * no schedule is configured in vercel.json). Every run re-reads persisted
 * election state, so an election that already closed, was archived or was
 * rescheduled is skipped, and the idempotency key (built from the actual
 * schedule instant) dedupes repeat runs of the same window. The notification's
 * own createdAt is the real send time — nothing here claims a reminder fired
 * "on schedule".
 */
export async function runElectionReminders(now: Date = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    closingChecked: 0,
    closingNotified: 0,
    openingChecked: 0,
    openingNotified: 0,
  };

  const closing = await prisma.election.findMany({
    where: {
      status: "OPEN",
      isPublished: true,
      votingEndAt: { gt: now, lte: new Date(now.getTime() + CLOSING_REMINDER_WINDOW_MS) },
    },
  });
  summary.closingChecked = closing.length;
  for (const election of closing) {
    const result = await runEvent(
      "election.closing_soon",
      { electionId: election.id },
      async () => {
        const recipients = await electionRecipientIds(election);
        const timezone = election.timezone || "UTC";
        const outcome = await notify({
          recipientIds: recipients,
          title: "Voting ends soon",
          body: `Voting for ${election.title} ends at ${formatDateTime(election.votingEndAt, timezone)} (${timezone}). Cast your ballot before the deadline.`,
          targetUrl: `/elections/${election.slug}`,
          tag: "election-closing",
          category: "election",
          idempotencyKey: `election-${election.id}-closing-${election.votingEndAt.getTime()}`,
          data: { electionId: election.id },
        });
        return { recipients: recipients.length, ...summarize(outcome) };
      },
    );
    summary.closingNotified += result?.created ?? 0;
  }

  const opening = await prisma.election.findMany({
    where: {
      status: { in: ["PUBLISHED", "NOMINATIONS", "READY", "OPEN"] },
      isPublished: true,
      votingStartAt: { gt: now, lte: new Date(now.getTime() + OPENING_REMINDER_WINDOW_MS) },
    },
  });
  summary.openingChecked = opening.length;
  for (const election of opening) {
    const result = await runEvent(
      "election.opening_soon",
      { electionId: election.id },
      async () => {
        const recipients = await electionRecipientIds(election);
        const timezone = election.timezone || "UTC";
        const outcome = await notify({
          recipientIds: recipients,
          title: "Voting opens soon",
          body: `Voting for ${election.title} opens at ${formatDateTime(election.votingStartAt, timezone)} (${timezone}).`,
          targetUrl: `/elections/${election.slug}`,
          tag: "election-opening",
          category: "election",
          idempotencyKey: `election-${election.id}-opening-${election.votingStartAt.getTime()}`,
          data: { electionId: election.id },
        });
        return { recipients: recipients.length, ...summarize(outcome) };
      },
    );
    summary.openingNotified += result?.created ?? 0;
  }

  return summary;
}
