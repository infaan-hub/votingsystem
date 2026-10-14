import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, strField, intField, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { uniqueElectionSlug, serializeElectionAdmin } from "@/src/lib/elections";
import {
  serializeElectionRequest,
  REQUESTER_INCLUDE,
  REQUEST_TRANSITIONS,
  type ElectionRequestRow,
} from "@/src/lib/election-requests";
import { notify } from "@/src/lib/notifications/notify";

const DECISION_FIELDS = [
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
] as const;

/**
 * Approval creates a DRAFT election pre-filled from the request and links it
 * back. It never publishes: publication still requires an officer (or admin)
 * to complete the election builder and pass `assertPublishable`.
 */
async function createDraftFromRequest(
  request: ElectionRequestRow,
  actorId: number,
) {
  const start = request.startAt;
  const end = request.endAt;
  const slug = await uniqueElectionSlug(request.title);
  const description = [request.description, request.purpose].filter(Boolean).join("\n\n");

  return prisma.election.create({
    data: {
      title: request.title,
      slug,
      description,
      categoryId: request.categoryId,
      status: "DRAFT",
      eligibilityPolicy: request.electionType === "restricted" ? "voter_list" : "registered",
      voterIdMethod: request.voterIdMethod,
      resultVisibility: "published",
      timezone: "UTC",
      isPublished: false,
      campaignStartAt: start,
      campaignEndAt: end,
      votingStartAt: start,
      votingEndAt: end,
      createdBy: actorId,
      approvedRequestId: request.id,
      rulesText: request.purpose || request.reason || "",
    },
  });
}

export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status");
      const requests = await prisma.electionRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        include: REQUESTER_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(requests.map((request) => serializeElectionRequest(request)));
    },
  },
});

export const PATCH = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = (await prisma.electionRequest.findUnique({
        where: { id: pk },
        include: REQUESTER_INCLUDE,
      })) as ElectionRequestRow | null;
      if (!existing) throw notFoundModel("ElectionRequest");

      const payload = await readPayload(req);
      const c = new Collector();
      const status = choiceField(c, payload, "status", DECISION_FIELDS)!;
      const decisionNote = strField(c, payload, "decision_note", {
        required: false, allowBlank: true, maxLength: 2000,
      });
      const assignedOfficerId = payload.assigned_officer_id
        ? intField(c, payload, "assigned_officer_id")
        : null;
      c.throwIfAny();

      const allowed = REQUEST_TRANSITIONS[existing.status] ?? [];
      if (!status || !allowed.includes(status)) {
        throw fieldErrors({
          status: `Cannot move a ${existing.status} request to ${status}.`,
        });
      }
      if ((status === "REJECTED" || status === "CHANGES_REQUESTED") && !decisionNote?.trim()) {
        throw fieldErrors({ decision_note: "Explain the decision so the requester can act on it." });
      }

      if (assignedOfficerId) {
        const officer = await prisma.user.findFirst({
          where: { id: assignedOfficerId, role: "officer", isActive: true },
          select: { id: true },
        });
        if (!officer) throw fieldErrors({ assigned_officer_id: "That election officer does not exist." });
      }

      // Approvals create at most one election; a repeat call is refused rather
      // than silently producing a duplicate draft.
      if (status === "APPROVED" && existing.electionId) {
        throw fieldErrors({ status: "This request has already been approved." });
      }

      let electionId = existing.electionId;
      let election = null;
      if (status === "APPROVED") {
        election = await createDraftFromRequest(existing, admin.id);
        electionId = election.id;
      }

      const updated = (await prisma.electionRequest.update({
        where: { id: existing.id },
        data: {
          status,
          decisionNote: decisionNote ?? existing.decisionNote,
          decidedBy: admin.id,
          decidedAt: new Date(),
          assignedOfficerId: assignedOfficerId ?? existing.assignedOfficerId,
          electionId,
        },
        include: REQUESTER_INCLUDE,
      })) as ElectionRequestRow;

      if (assignedOfficerId && electionId) {
        await prisma.officerAssignment.create({
          data: {
            officerId: assignedOfficerId,
            scope: "election",
            electionId,
            assignedBy: admin.id,
            note: `Assigned via election request #${existing.id}`,
          },
        });
      }

      await recordAudit({
        actorId: admin.id,
        action: `admin.request.${status.toLowerCase()}`,
        entityType: "ElectionRequest",
        entityId: existing.id,
        summary: `Request "${existing.title}" moved to ${status}`,
        detail: { electionId },
        ipAddress: clientIp(req),
      });

      // Notify the requester of the decision (in-app + push to their devices).
      if (status !== "UNDER_REVIEW") {
        try {
          const headline =
            status === "APPROVED"
              ? "Your election request was approved"
              : status === "REJECTED"
                ? "Your election request was rejected"
                : "Changes requested on your election request";
          const detail =
            status === "APPROVED"
              ? "A draft election was created from your request. An officer will finish setup before it goes live."
              : decisionNote?.trim() || "Open the request for details.";
          await notify({
            recipientIds: [existing.requesterId],
            title: headline,
            body: `${existing.title}: ${detail}`.slice(0, 300),
            targetUrl: "/dashboard",
            tag: `election-request-${existing.id}-${status}`,
            category: "election_request",
            idempotencyKey: `election-request-${existing.id}-${status}`,
            data: { electionRequestId: existing.id, status },
          });
        } catch {
          // Delivery failures must never fail the decision itself.
        }
      }

      return json({
        request: serializeElectionRequest(updated),
        election: election ? serializeElectionAdmin(election) : null,
      });
    },
  },
});
