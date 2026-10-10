import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, strField, boolField, dateTimeField, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { serializeElectionAdmin } from "@/src/app/api/admin/elections/route";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";

const ELIGIBILITY_POLICIES = ["registered", "org_members", "voter_list", "invite_only", "open", "legacy_academic"] as const;
const RESULT_VISIBILITY = ["hidden", "admin_only", "officers", "live", "published", "public"] as const;

async function uniqueSlug(base: string, excludeId: number): Promise<string> {
  const root = slugify(base);
  const existing = await prisma.election.findMany({
    where: { slug: { startsWith: root }, id: { not: excludeId } },
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

const route = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const election = await prisma.election.findUnique({
        where: { id: Number(params.pk) },
        include: { category: true, organization: true },
      });
      if (!election) throw notFoundModel("Election");
      return json(serializeElectionAdmin(election));
    },
    PATCH: async (req, params) => {
      const pk = Number(params.pk);
      const existing = await prisma.election.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Election");

      const payload: Payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
      const c = new Collector();

      const title = has("title") ? strField(c, payload, "title", { required: false, maxLength: 200 }) : undefined;
      const description = has("description") ? strField(c, payload, "description", { required: false, allowBlank: true, maxLength: 2000 }) : undefined;
      const categoryId = has("category_id") ? (payload.category_id === null ? null : Number(payload.category_id)) : undefined;
      const organizationId = has("organization_id") ? (payload.organization_id === null ? null : Number(payload.organization_id)) : undefined;
      const campaignStart = has("campaign_start_at") ? dateTimeField(c, payload, "campaign_start_at", { required: false }) : undefined;
      const campaignEnd = has("campaign_end_at") ? dateTimeField(c, payload, "campaign_end_at", { required: false }) : undefined;
      const votingStart = has("voting_start_at") ? dateTimeField(c, payload, "voting_start_at", { required: false }) : undefined;
      const votingEnd = has("voting_end_at") ? dateTimeField(c, payload, "voting_end_at", { required: false }) : undefined;
      const registrationStart = has("registration_start_at") ? dateTimeField(c, payload, "registration_start_at", { required: false, allowNull: true }) : undefined;
      const registrationEnd = has("registration_end_at") ? dateTimeField(c, payload, "registration_end_at", { required: false, allowNull: true }) : undefined;
      const eligibilityPolicy = has("eligibility_policy") ? choiceField(c, payload, "eligibility_policy", ELIGIBILITY_POLICIES, { required: false }) : undefined;
      const resultVisibility = has("result_visibility") ? choiceField(c, payload, "result_visibility", RESULT_VISIBILITY, { required: false }) : undefined;
      const secretBallot = has("secret_ballot") ? boolField(c, payload, "secret_ballot", { required: false }) : undefined;
      const timezone = has("timezone") ? strField(c, payload, "timezone", { required: false, maxLength: 60 }) : undefined;
      const allowAdminsToVote = has("allow_admins_to_vote") ? boolField(c, payload, "allow_admins_to_vote", { required: false }) : undefined;
      const isPublished = has("is_published") ? boolField(c, payload, "is_published", { required: false }) : undefined;
      c.throwIfAny();

      if (title !== undefined && !title) throw fieldErrors({ title: "This field may not be blank." });

      const updates: Record<string, unknown> = {};
      if (title !== undefined) {
        updates.title = title;
        updates.slug = await uniqueSlug(title, pk);
      }
      if (description !== undefined) updates.description = description;
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (organizationId !== undefined) updates.organizationId = organizationId;
      if (campaignStart !== undefined) updates.campaignStartAt = campaignStart;
      if (campaignEnd !== undefined) updates.campaignEndAt = campaignEnd;
      if (votingStart !== undefined) updates.votingStartAt = votingStart;
      if (votingEnd !== undefined) updates.votingEndAt = votingEnd;
      if (registrationStart !== undefined) updates.registrationStartAt = registrationStart;
      if (registrationEnd !== undefined) updates.registrationEndAt = registrationEnd;
      if (eligibilityPolicy !== undefined) updates.eligibilityPolicy = eligibilityPolicy;
      if (resultVisibility !== undefined) updates.resultVisibility = resultVisibility;
      if (secretBallot !== undefined) updates.secretBallot = secretBallot;
      if (timezone !== undefined) updates.timezone = timezone;
      if (allowAdminsToVote !== undefined) updates.allowAdminsToVote = allowAdminsToVote;
      if (isPublished !== undefined) updates.isPublished = isPublished;

      // Validate time ordering if any time fields changed.
      const finalCS = (updates.campaignStartAt as Date) ?? existing.campaignStartAt;
      const finalCE = (updates.campaignEndAt as Date) ?? existing.campaignEndAt;
      const finalVS = (updates.votingStartAt as Date) ?? existing.votingStartAt;
      const finalVE = (updates.votingEndAt as Date) ?? existing.votingEndAt;
      if (finalCE <= finalCS) throw fieldErrors({ campaign_end_at: "Campaign end must be after campaign start." });
      if (finalVE <= finalVS) throw fieldErrors({ voting_end_at: "Voting end must be after voting start." });
      if (finalVS < finalCE) throw fieldErrors({ voting_start_at: "Voting must start after the campaign ends." });

      try {
        const updated = await prisma.election.update({
          where: { id: pk },
          data: updates,
          include: { category: true, organization: true },
        });
        return json(serializeElectionAdmin(updated));
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ title: "An election with this title already exists." });
        }
        throw error;
      }
    },
  },
});

export const GET = route;
export const PATCH = route;