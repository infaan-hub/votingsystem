import { json, makeRoute } from "@/src/lib/api";
import { Collector, strField, dateTimeField, choiceField, intField } from "@/src/lib/fields";
import { fieldErrors } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { managedElectionIds } from "@/src/lib/officer";
import { formatDateTime } from "@/src/lib/time";
import { readPayload, type Payload } from "@/src/lib/request";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";
import type { Election } from "@/src/generated/prisma/client";

const VOTER_ID_METHODS = [
  "account",
  "email",
  "phone",
  "membership",
  "employee",
  "student_id",
  "custom",
] as const;
const CAPACITY_MODES = ["open", "restricted"] as const;

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
  };
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
      c.throwIfAny();

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
            status: "DRAFT",
            isPublished: false,
            createdBy: officer.id,
            timezone,
            eligibilityPolicy: capacityMode === "open" ? "open" : "registered",
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
      return json(serializeCreated(created), 201);
    },
  },
});

export const GET = route;
export const POST = route;
