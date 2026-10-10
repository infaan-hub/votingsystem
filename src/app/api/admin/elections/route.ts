import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, boolField, dateTimeField, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { serializeElectionList } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";
import { formatDateTime } from "@/src/lib/time";
import type { Election } from "@/src/generated/prisma/client";

const ELIGIBILITY_POLICIES = ["registered", "org_members", "voter_list", "invite_only", "open", "legacy_academic"] as const;
const RESULT_VISIBILITY = ["hidden", "admin_only", "officers", "live", "published", "public"] as const;

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

export function serializeElectionAdmin(election: Election) {
  return {
    ...serializeElectionList(election),
    slug: election.slug,
    status: election.status,
    eligibility_policy: election.eligibilityPolicy,
    result_visibility: election.resultVisibility,
    secret_ballot: election.secretBallot,
    timezone: election.timezone,
    allow_admins_to_vote: election.allowAdminsToVote,
    is_published: election.isPublished,
    registration_start_at: formatDateTime(election.registrationStartAt),
    registration_end_at: formatDateTime(election.registrationEndAt),
    category_id: election.categoryId,
    organization_id: election.organizationId,
  };
}

const route = makeRoute({
  permission: "admin",
  handlers: {
    GET: async () => {
      const elections = await prisma.election.findMany({
        orderBy: { createdAt: "desc" },
        include: { category: true, organization: true },
      });
      return json(elections.map((e) => serializeElectionAdmin(e)));
    },
    POST: async (req) => {
      const payload: Payload = await readPayload(req);
      const c = new Collector();
      const title = strField(c, payload, "title", { maxLength: 200 });
      const description = strField(c, payload, "description", { required: false, allowBlank: true, maxLength: 2000 });
      const categoryId = payload.category_id !== undefined ? Number(payload.category_id) : null;
      const organizationId = payload.organization_id !== undefined ? Number(payload.organization_id) : null;
      const campaignStart = dateTimeField(c, payload, "campaign_start_at", { required: false });
      const campaignEnd = dateTimeField(c, payload, "campaign_end_at", { required: false });
      const votingStart = dateTimeField(c, payload, "voting_start_at", { required: false });
      const votingEnd = dateTimeField(c, payload, "voting_end_at", { required: false });
      const registrationStart = dateTimeField(c, payload, "registration_start_at", { required: false, allowNull: true });
      const registrationEnd = dateTimeField(c, payload, "registration_end_at", { required: false, allowNull: true });
      const eligibilityPolicy = choiceField(c, payload, "eligibility_policy", ELIGIBILITY_POLICIES, { required: false, defaultValue: "registered" });
      const resultVisibility = choiceField(c, payload, "result_visibility", RESULT_VISIBILITY, { required: false, defaultValue: "live" });
      const secretBallot = boolField(c, payload, "secret_ballot", { required: false, defaultValue: false });
      const timezone = strField(c, payload, "timezone", { required: false, maxLength: 60 }) || "UTC";
      const allowAdminsToVote = boolField(c, payload, "allow_admins_to_vote", { required: false, defaultValue: false });
      const isPublished = boolField(c, payload, "is_published", { required: false, defaultValue: false });
      c.throwIfAny();

      if (!title) throw fieldErrors({ title: "This field is required." });

      const now = new Date();
      const cs = campaignStart ?? new Date(now.getTime() - 7 * 86400000);
      const ce = campaignEnd ?? new Date(now.getTime() + 7 * 86400000);
      const vs = votingStart ?? new Date(now.getTime() + 86400000);
      const ve = votingEnd ?? new Date(now.getTime() + 8 * 86400000);

      if (ce <= cs) throw fieldErrors({ campaign_end_at: "Campaign end must be after campaign start." });
      if (ve <= vs) throw fieldErrors({ voting_end_at: "Voting end must be after voting start." });
      if (vs < ce) throw fieldErrors({ voting_start_at: "Voting must start after the campaign ends." });

      const slug = await uniqueSlug(title);

      let created;
      try {
        created = await prisma.election.create({
          data: {
            title,
            slug,
            description,
            categoryId,
            organizationId,
            status: "DRAFT",
            eligibilityPolicy: eligibilityPolicy ?? "registered",
            resultVisibility: resultVisibility ?? "live",
            secretBallot: secretBallot ?? false,
            timezone,
            allowAdminsToVote: allowAdminsToVote ?? false,
            isPublished: isPublished ?? false,
            campaignStartAt: cs,
            campaignEndAt: ce,
            votingStartAt: vs,
            votingEndAt: ve,
            registrationStartAt: registrationStart ?? null,
            registrationEndAt: registrationEnd ?? null,
          },
          include: { category: true, organization: true },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ title: "An election with this title already exists." });
        }
        throw error;
      }
      return json(serializeElectionAdmin(created), 201);
    },
  },
});

export const GET = route;
export const POST = route;