import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, strField, boolField, dateTimeField, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { notify } from "@/src/lib/notifications/notify";
import { notifyOfficerRevoked } from "@/src/lib/notifications/events";
import { serializeElectionAdmin } from "@/src/app/api/admin/elections/route";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";
import { isValidTimeZone } from "@/src/lib/time";

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
    PATCH: async (req, params, state) => {
      const admin = requireStateAdmin(state);
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

      // A running or finished election's schedule is frozen: widening the
      // window mid-vote, or flipping the public flag on a live election, would
      // silently disenfranchise voters.
      const scheduleTouched =
        campaignStart !== undefined ||
        campaignEnd !== undefined ||
        votingStart !== undefined ||
        votingEnd !== undefined;
      if (["OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"].includes(existing.status)) {
        const frozen: Record<string, string> = {};
        if (scheduleTouched) {
          frozen.voting_start_at = "The voting schedule is frozen once voting has started.";
        }
        if (isPublished !== undefined) {
          frozen.is_published = "Publish state follows the lifecycle and cannot be changed here.";
        }
        if (Object.keys(frozen).length) throw fieldErrors(frozen);
      }

      if (timezone !== undefined && !isValidTimeZone(timezone || "UTC")) {
        throw fieldErrors({ timezone: "Use an IANA timezone name like Africa/Lagos." });
      }

      if (typeof categoryId === "number") {
        const category = await prisma.electionCategory.findUnique({
          where: { id: categoryId },
          select: { id: true },
        });
        if (!category) throw fieldErrors({ category_id: "This category does not exist." });
      }

      if (title !== undefined && !title) throw fieldErrors({ title: "This field may not be blank." });

      // Optional operator selection: which single officer operates this
      // election. `null` clears the current operator; an omitted key leaves it
      // untouched. Every officer is scoped to exactly one election, so an
      // officer already operating a different election is refused here.
      const officerIdProvided = has("officer_id");
      const officerId = !officerIdProvided
        ? undefined
        : payload.officer_id === null || payload.officer_id === undefined
          ? null
          : Number(payload.officer_id);

      let newOperator: { id: number; username: string } | null = null;
      if (officerIdProvided && officerId != null) {
        if (!Number.isInteger(officerId)) {
          throw fieldErrors({ officer_id: "Choose an existing election officer account." });
        }
        const account = await prisma.user.findUnique({
          where: { id: officerId },
          select: { id: true, username: true, role: true },
        });
        if (!account || account.role !== "officer") {
          throw fieldErrors({ officer_id: "Choose an existing election officer account." });
        }
        // One election per officer: reject a officer who already operates a
        // different election until that assignment is revoked.
        const active = await prisma.officerAssignment.findMany({
          where: { officerId, isActive: true, scope: "election", NOT: { electionId: null } },
          include: { election: { select: { title: true } } },
        });
        const conflict = active.find((row) => row.electionId !== pk);
        if (conflict) {
          throw fieldErrors({
            officer_id: `That officer already operates ${conflict.election ? `“${conflict.election.title}”` : "another election"}. Revoke that assignment first.`,
          });
        }
        newOperator = account;
      }

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

      // Validate time ordering only when the PATCH actually changes a time
      // field: legacy or seeded elections can legitimately overlap the
      // campaign and voting windows, and a title, flag or operator edit
      // must not be refused for a violation this request didn't create.
      if (scheduleTouched) {
        const finalCS = (updates.campaignStartAt as Date) ?? existing.campaignStartAt;
        const finalCE = (updates.campaignEndAt as Date) ?? existing.campaignEndAt;
        const finalVS = (updates.votingStartAt as Date) ?? existing.votingStartAt;
        const finalVE = (updates.votingEndAt as Date) ?? existing.votingEndAt;
        if (finalCE <= finalCS) throw fieldErrors({ campaign_end_at: "Campaign end must be after campaign start." });
        if (finalVE <= finalVS) throw fieldErrors({ voting_end_at: "Voting end must be after voting start." });
        if (finalVS < finalCE) throw fieldErrors({ voting_start_at: "Voting must start after the campaign ends." });
      }

      try {
        const updated = await prisma.election.update({
          where: { id: pk },
          data: updates,
          include: { category: true, organization: true },
        });

        // Operator swap: only when the requested operator differs from the
        // current one. Assignments are deactivated, never hard deleted — the
        // audit trail depends on them remaining queryable.
        if (officerIdProvided) {
          const current = await prisma.officerAssignment.findFirst({
            where: { electionId: pk, isActive: true, scope: "election" },
            select: { id: true, officerId: true },
          });
          const targetId = newOperator?.id ?? null;
          if ((current?.officerId ?? null) !== targetId) {
            if (current) {
              await prisma.officerAssignment.update({
                where: { id: current.id },
                data: { isActive: false },
              });
              await notifyOfficerRevoked({ id: current.id, officerId: current.officerId });
              await recordAudit({
                actorId: admin.id,
                action: "admin.officer.revoke",
                entityType: "OfficerAssignment",
                entityId: current.id,
                summary: `Officer assignment #${current.id} revoked (operator of “${updated.title}” changed)`,
                ipAddress: clientIp(req),
              });
            }
            if (newOperator) {
              const assignment = await prisma.officerAssignment.create({
                data: {
                  officerId: newOperator.id,
                  scope: "election",
                  electionId: pk,
                  assignedBy: admin.id,
                  isActive: true,
                  note: `Operator of “${updated.title}”.`,
                },
              });
              await recordAudit({
                actorId: admin.id,
                action: "admin.officer.assign",
                entityType: "OfficerAssignment",
                entityId: assignment.id,
                summary: `Officer ${newOperator.username} selected to operate “${updated.title}”`,
                detail: { electionId: pk },
                ipAddress: clientIp(req),
              });
              try {
                await notify({
                  recipientIds: [newOperator.id],
                  title: "You were appointed as an election officer",
                  body: `An administrator selected you to operate the election “${updated.title}”.`,
                  targetUrl: "/officer/dashboard",
                  tag: `officer-appointed-${assignment.id}`,
                  category: "officer",
                  idempotencyKey: `officer-appointed-${assignment.id}`,
                  data: { assignmentId: assignment.id, scope: "election" },
                });
              } catch {
                // Never fail the assignment because push delivery failed.
              }
            }
          }
        }

        return json(serializeElectionAdmin(updated));
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ title: "An election with this title already exists." });
        }
        throw error;
      }
    },

    /**
     * DELETE: permanently remove an election (admin only, audited).
     *
     * Administrators may delete an election at any stage, including one that
     * already holds cast ballots: every dependent row — positions, candidates,
     * ballot options, announcements, campaigns, officer assignments and votes —
     * is removed with it through ON DELETE CASCADE. The removed ballot count
     * lands in the audit entry (and in the response) so a destroyed election is
     * still traceable in the log; officers stay blocked, and the UI keeps
     * archiving beside Delete as the non-destructive option.
     */
    DELETE: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = await prisma.election.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Election");

      // Recorded only — the cascade removes these ballots with the election.
      const votes = await prisma.vote.count({ where: { electionId: pk } });

      try {
        await prisma.election.delete({ where: { id: pk } });
      } catch (error) {
        // P2003 (foreign key) / P2014 (required relation): something still
        // references the election. Refuse with the same guidance, not a 500.
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "P2003" || code === "P2014") {
          throw new ApiError(409, {
            detail: "This election still has dependent records and cannot be deleted — archive it instead.",
          });
        }
        throw error;
      }

      await recordAudit({
        actorId: admin.id,
        action: "admin.election.delete",
        entityType: "Election",
        entityId: pk,
        summary: `Election “${existing.title}” deleted`,
        detail: { slug: existing.slug, status: existing.status, votes_deleted: votes },
        ipAddress: clientIp(req),
      });

      return json({ deleted: true, id: pk, votes_deleted: votes });
    },
  },
});

export const GET = route;
export const PATCH = route;
export const DELETE = route;