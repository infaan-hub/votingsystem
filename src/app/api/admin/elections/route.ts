import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, boolField, dateTimeField, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { notify } from "@/src/lib/notifications/notify";
import { serializeElectionAdmin as serializeElectionAdminDetail } from "@/src/lib/elections";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";
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
  // One shared field set for every console; delegating keeps the two admin
  // payloads from drifting. `status` stays the lifecycle enum here because the
  // admin screens switch on it (the shared serializer puts it in
  // `lifecycle_status` and keeps the clock-based `status`).
  return {
    ...serializeElectionAdminDetail(election),
    status: election.status,
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
      // Ballot counts travel with the list so the delete dialog can state
      // exactly how many cast votes disappear with the election.
      const grouped = elections.length
        ? await prisma.vote.groupBy({
            by: ["electionId"],
            where: { electionId: { in: elections.map((e) => e.id) } },
            _count: { _all: true },
          })
        : [];
      const votesByElection = new Map(
        grouped.map((row) => [row.electionId, row._count._all]),
      );
      return json(
        elections.map((e) => ({
          ...serializeElectionAdmin(e),
          vote_count: votesByElection.get(e.id) ?? 0,
        })),
      );
    },
    POST: async (req, _params, state) => {
      const admin = requireStateAdmin(state);
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

      // Establishing an election optionally selects the single officer who
      // will operate it — that assignment is the officer's entire scope.
      const officerId =
        payload.officer_id !== undefined && payload.officer_id !== null
          ? Number(payload.officer_id)
          : null;

      let operator: { id: number; username: string } | null = null;
      if (officerId !== null) {
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
        // One election per officer: reject an officer who already operates a
        // different election until that assignment is revoked.
        const active = await prisma.officerAssignment.findMany({
          where: { officerId, isActive: true, scope: "election", NOT: { electionId: null } },
          include: { election: { select: { title: true } } },
        });
        if (active.length) {
          const busy = active[0];
          throw fieldErrors({
            officer_id: `That officer already operates ${busy.election ? `“${busy.election.title}”` : "another election"}. Revoke that assignment first.`,
          });
        }
        operator = account;
      }

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

      // Bind the selected officer as the election's single operator.
      if (operator) {
        const assignment = await prisma.officerAssignment.create({
          data: {
            officerId: operator.id,
            scope: "election",
            electionId: created.id,
            assignedBy: admin.id,
            isActive: true,
            note: `Selected when the admin established “${created.title}”.`,
          },
        });
        await recordAudit({
          actorId: admin.id,
          action: "admin.officer.assign",
          entityType: "OfficerAssignment",
          entityId: assignment.id,
          summary: `Officer ${operator.username} selected to operate “${created.title}”`,
          detail: { electionId: created.id },
          ipAddress: clientIp(req),
        });
        try {
          await notify({
            recipientIds: [operator.id],
            title: "You were appointed as an election officer",
            body: `An administrator selected you to operate the election “${created.title}”.`,
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

      return json(serializeElectionAdmin(created), 201);
    },
  },
});

export const GET = route;
export const POST = route;