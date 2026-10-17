import { json, makeRoute } from "@/src/lib/api";
import { Collector, strField, dateTimeField, choiceField, intField } from "@/src/lib/fields";
import { fieldErrors } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { managedElectionIds } from "@/src/lib/officer";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { formatDateTime } from "@/src/lib/time";
import { readPayload, type Payload } from "@/src/lib/request";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";
import { notifyVotersAdded } from "@/src/lib/notifications/events";
import { CAPACITY_MODES, VOTER_ID_METHODS } from "@/src/lib/eligibility";
import type { Election } from "@/src/generated/prisma/client";

const MAX_ALLOWED_VOTERS = 500;

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  const existing = await prisma.election.findMany({
    where: { slug: { startsWith: root } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((e) => e.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

type GroupedCount = { electionId: number; _count: { _all: number } };

function countMap(rows: GroupedCount[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.electionId, row._count._all);
  return map;
}

function serializeCreated(election: Election) {
  const tz = election.timezone || "UTC";
  return {
    id: election.id,
    slug: election.slug,
    title: election.title,
    status: election.status,
    is_published: election.isPublished,
    visibility: election.visibility,
    capacity_mode: election.capacityMode,
    max_voters: election.maxVoters,
    voting_start_at: formatDateTime(election.votingStartAt, tz),
    voting_end_at: formatDateTime(election.votingEndAt, tz),
    campaign_start_at: formatDateTime(election.campaignStartAt, tz),
    campaign_end_at: formatDateTime(election.campaignEndAt, tz),
  };
}

/**
 * Resolves allow-list entries (email or username) to active accounts so the
 * eligibility list stores real `u:<id>` rows — the only form that grants
 * voting rights when voters identify with their platform account.
 */
async function resolveAllowedAccounts(entries: string[]): Promise<{
  userIds: number[];
  unmatched: string[];
}> {
  const normalized = [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))];
  if (!normalized.length) return { userIds: [], unmatched: [] };
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: normalized.flatMap((entry) => [
        { username: { equals: entry, mode: "insensitive" as const } },
        { email: { equals: entry, mode: "insensitive" as const } },
      ]),
    },
    select: { id: true, username: true, email: true },
  });
  const byKey = new Map<string, number>();
  for (const user of users) {
    byKey.set(user.username.toLowerCase(), user.id);
    byKey.set(user.email.toLowerCase(), user.id);
  }
  const userIds: number[] = [];
  const unmatched: string[] = [];
  const seen = new Set<number>();
  for (const entry of normalized) {
    const userId = byKey.get(entry.toLowerCase());
    if (userId === undefined) {
      unmatched.push(entry);
    } else if (!seen.has(userId)) {
      seen.add(userId);
      userIds.push(userId);
    }
  }
  return { userIds, unmatched };
}

const route = makeRoute({
  permission: "officer",
  handlers: {
    GET: async (_req, _params, state) => {
      const officer = requireStateOfficer(state);
      const ids = await managedElectionIds(officer);
      const elections = await prisma.election.findMany({
        where: ids === null ? { status: { not: "ARCHIVED" } } : { id: { in: ids } },
        include: { category: true },
        orderBy: { votingStartAt: "desc" },
      });
      const scopeIds = elections.map((election) => election.id);

      const [positionCounts, candidateCounts, voteCounts, campaignCounts, voterCounts] =
        await Promise.all([
          prisma.position.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.candidate.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.vote.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
          prisma.campaign.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds }, status: "PUBLISHED" },
            _count: { _all: true },
          }),
          prisma.electionVoter.groupBy({
            by: ["electionId"],
            where: { electionId: { in: scopeIds } },
            _count: { _all: true },
          }),
        ]);

      const positions = countMap(positionCounts);
      const candidates = countMap(candidateCounts);
      const votes = countMap(voteCounts);
      const publishedCampaigns = countMap(campaignCounts);
      const eligibleVoters = countMap(voterCounts);

      return json(
        elections.map((election) => {
          const tz = election.timezone || "UTC";
          return {
            id: election.id,
            slug: election.slug,
            title: election.title,
            status: election.status,
            is_published: election.isPublished,
            visibility: election.visibility,
            voting_start_at: formatDateTime(election.votingStartAt, tz),
            voting_end_at: formatDateTime(election.votingEndAt, tz),
            campaign_start_at: formatDateTime(election.campaignStartAt, tz),
            campaign_end_at: formatDateTime(election.campaignEndAt, tz),
            category: election.category
              ? { id: election.category.id, name: election.category.name }
              : null,
            counts: {
              positions: positions.get(election.id) ?? 0,
              candidates: candidates.get(election.id) ?? 0,
              votes: votes.get(election.id) ?? 0,
              published_campaigns: publishedCampaigns.get(election.id) ?? 0,
              eligible_voters: eligibleVoters.get(election.id) ?? 0,
            },
          };
        }),
      );
    },
    POST: async (req, _params, state) => {
      const officer = requireStateOfficer(state);
      const payload: Payload = await readPayload(req);
      const c = new Collector();
      const title = strField(c, payload, "title", { maxLength: 200 });
      const description = strField(c, payload, "description", {
        required: false,
        allowBlank: true,
        maxLength: 2000,
      });
      const votingStart = dateTimeField(c, payload, "voting_start_at", {});
      const votingEnd = dateTimeField(c, payload, "voting_end_at", {});
      const rulesText = strField(c, payload, "rules_text", {
        required: false,
        allowBlank: true,
        maxLength: 4000,
      });
      const voterIdMethod = choiceField(c, payload, "voter_id_method", VOTER_ID_METHODS, {
        required: false,
        defaultValue: "account",
      });
      const voterIdLabel = strField(c, payload, "voter_id_label", {
        required: false,
        allowBlank: true,
        maxLength: 120,
      });
      const capacityMode = choiceField(c, payload, "capacity_mode", CAPACITY_MODES, {
        required: false,
        defaultValue: "restricted",
      });
      const maxVoters = intField(c, payload, "max_voters", { required: false });
      const timezone = strField(c, payload, "timezone", { required: false, maxLength: 60 }) || "UTC";
      // Optional explore category: the home page tiles and the /categories
      // pages list elections through this link. Blank/null means "no category".
      const rawCategory = payload.category_id;
      let categoryId: number | null = null;
      if (rawCategory !== undefined && rawCategory !== null && String(rawCategory).trim() !== "") {
        const parsed = Number(rawCategory);
        if (!Number.isInteger(parsed) || parsed < 1) {
          c.field("category_id", "Select a valid category.");
        } else {
          categoryId = parsed;
        }
      }
      c.throwIfAny();

      // Emails or usernames of the people allowed to vote (capacity "restricted").
      const rawAllowed = payload.allowed_voters;
      if (rawAllowed !== undefined && rawAllowed !== null && !Array.isArray(rawAllowed)) {
        throw fieldErrors({ allowed_voters: "Expected a list of emails or usernames." });
      }
      const allowedVoters: string[] = [];
      for (const entry of ((rawAllowed as unknown[] | null) ?? [])) {
        if (typeof entry !== "string" && typeof entry !== "number") {
          throw fieldErrors({ allowed_voters: "Every entry must be an email or username." });
        }
        const value = String(entry).trim();
        if (value) allowedVoters.push(value);
      }
      if (allowedVoters.length > MAX_ALLOWED_VOTERS) {
        throw fieldErrors({
          allowed_voters: `A maximum of ${MAX_ALLOWED_VOTERS} voters may be listed per election.`,
        });
      }

      if (!title) throw fieldErrors({ title: "This field is required." });
      if (voterIdMethod === "custom" && !voterIdLabel.trim()) {
        throw fieldErrors({ voter_id_label: "A label is required for a custom identifier." });
      }
      if (votingEnd && votingStart && votingEnd <= votingStart) {
        throw fieldErrors({ voting_end_at: "Voting end must be after voting start." });
      }
      if (
        capacityMode !== "open" &&
        maxVoters !== undefined &&
        maxVoters !== null &&
        maxVoters < 1
      ) {
        throw fieldErrors({ max_voters: "Maximum voters must be at least 1." });
      }

      if (!votingStart || !votingEnd) {
        throw fieldErrors({ voting_start_at: "This field is required." });
      }
      if (categoryId !== null) {
        const category = await prisma.electionCategory.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          throw fieldErrors({ category_id: "This category is not available." });
        }
      }
      const vs = votingStart;
      const ve = votingEnd;
      const slug = await uniqueSlug(title);

      let created: Election;
      try {
        created = await prisma.election.create({
          data: {
            title,
            slug,
            description,
            // Officers publish their own elections: created live, with no
            // draft stage and no administrator approval. The vote endpoint
            // still enforces the voting window the officer scheduled.
            status: "OPEN",
            isPublished: true,
            createdBy: officer.id,
            timezone,
            categoryId,
            eligibilityPolicy: capacityMode === "open" ? "open" : "voter_list",
            capacityMode: capacityMode ?? "restricted",
            maxVoters: capacityMode === "open" ? null : (maxVoters ?? null),
            rulesText,
            voterIdMethod: voterIdMethod ?? "account",
            voterIdLabel: voterIdMethod === "custom" ? voterIdLabel.trim() : "",
            // Campaign runs up to the voting open moment by default.
            campaignStartAt: new Date(vs.getTime() - 7 * 86400000),
            campaignEndAt: vs,
            votingStartAt: vs,
            votingEndAt: ve,
          },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ title: "An election with this title already exists." });
        }
        throw error;
      }

      // Attach the allow-list for restricted elections. Unmatched entries are
      // reported back so the officer can fix typos or register missing voters.
      let votersAdded = 0;
      let unmatchedVoters: string[] = [];
      if (capacityMode !== "open" && allowedVoters.length) {
        const resolved = await resolveAllowedAccounts(allowedVoters);
        unmatchedVoters = resolved.unmatched;
        if (resolved.userIds.length) {
          await prisma.electionVoter.createMany({
            data: resolved.userIds.map((userId) => ({
              electionId: created.id,
              uniqueKey: `u:${userId}`,
              userId,
              label: "",
            })),
            skipDuplicates: true,
          });
          votersAdded = await prisma.electionVoter.count({
            where: { electionId: created.id },
          });
          // Fresh election: every resolved account is a new list entry.
          await notifyVotersAdded(created, resolved.userIds);
        }
      }

      await recordAudit({
        actorId: officer.id,
        action: "officer.election.create",
        entityType: "Election",
        entityId: created.id,
        summary: `Election "${created.title}" created`,
        detail: {
          capacity_mode: created.capacityMode,
          voters_added: votersAdded,
          unmatched_voters: unmatchedVoters.length,
        },
        ipAddress: clientIp(req),
      });

      return json({ ...serializeCreated(created), voters_added: votersAdded, unmatched_voters: unmatchedVoters }, 201);
    },
  },
});

export const GET = route;
export const POST = route;
