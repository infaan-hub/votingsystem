import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, dateTimeField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { formatDateTime } from "@/src/lib/time";
import type { ElectionRequest } from "@/src/generated/prisma/client";

export const REQUEST_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "CANCELLED",
] as const;

/** Legal status transitions. Prevents duplicate approvals and reversals. */
export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export type ElectionRequestRow = ElectionRequest & {
  requester?: { id: number; username: string; firstName: string; lastName: string; email: string } | null;
  category?: { id: number; name: string; slug: string } | null;
};

export function serializeElectionRequest(request: ElectionRequestRow) {
  return {
    id: request.id,
    title: request.title,
    category_name: request.categoryName,
    category_id: request.categoryId,
    category: request.category
      ? { id: request.category.id, name: request.category.name, slug: request.category.slug }
      : null,
    organization: request.organization,
    description: request.description,
    purpose: request.purpose,
    start_at: formatDateTime(request.startAt),
    end_at: formatDateTime(request.endAt),
    expected_voters: request.expectedVoters,
    election_type: request.electionType,
    voter_id_method: request.voterIdMethod,
    positions_text: request.positionsText,
    reason: request.reason,
    contact_info: request.contactInfo,
    status: request.status,
    decision_note: request.decisionNote,
    decided_by: request.decidedBy,
    decided_at: formatDateTime(request.decidedAt),
    assigned_officer_id: request.assignedOfficerId,
    election_id: request.electionId,
    requester: request.requester
      ? {
          id: request.requester.id,
          username: request.requester.username,
          full_name: `${request.requester.firstName} ${request.requester.lastName}`.trim(),
          email: request.requester.email,
        }
      : null,
    created_at: formatDateTime(request.createdAt),
    updated_at: formatDateTime(request.updatedAt),
  };
}

export const REQUESTER_INCLUDE = {
  requester: true,
  category: true,
} as const;


const route = makeRoute({
  permission: "authenticated",
  handlers: {
    /** The signed-in user's own request history. */
    GET: async (_req, _params, state) => {
      const user = requireStateUser(state);
      const requests = await prisma.electionRequest.findMany({
        where: { requesterId: user.id },
        include: REQUESTER_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(requests.map((request) => serializeElectionRequest(request)));
    },
    POST: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);
      const c = new Collector();
      const title = strField(c, payload, "title", { maxLength: 200 });
      const categoryName = strField(c, payload, "category_name", {
        required: false, allowBlank: true, maxLength: 120,
      });
      const organization = strField(c, payload, "organization", {
        required: false, allowBlank: true, maxLength: 200,
      });
      const description = strField(c, payload, "description", {
        required: false, allowBlank: true, maxLength: 4000,
      });
      const purpose = strField(c, payload, "purpose", {
        required: false, allowBlank: true, maxLength: 2000,
      });
      const startAt = dateTimeField(c, payload, "start_at");
      const endAt = dateTimeField(c, payload, "end_at");
      const expectedVotersRaw = payload.expected_voters;
      const expectedVoters =
        expectedVotersRaw === undefined || expectedVotersRaw === null || expectedVotersRaw === ""
          ? 0
          : Number(expectedVotersRaw);
      const electionType = strField(c, payload, "election_type", {
        required: false, allowBlank: true, maxLength: 40,
      });
      const voterIdMethod = strField(c, payload, "voter_id_method", {
        required: false, allowBlank: true, maxLength: 40,
      });
      const positionsText = strField(c, payload, "positions_text", {
        required: false, allowBlank: true, maxLength: 4000,
      });
      const reason = strField(c, payload, "reason", {
        required: false, allowBlank: true, maxLength: 4000,
      });
      const contactInfo = strField(c, payload, "contact_info", {
        required: false, allowBlank: true, maxLength: 200,
      });

      if (Number.isNaN(expectedVoters) || expectedVoters < 0) {
        c.field("expected_voters", "Expected voters must be zero or a positive number.");
      }
      if (!categoryName && (payload.category_id === undefined || payload.category_id === null || payload.category_id === "")) {
        c.field("category_name", "Choose a category or describe a new one.");
      }
      c.throwIfAny();

      if (!title) throw fieldErrors({ title: "This field is required." });
      if (!startAt) throw fieldErrors({ start_at: "This field is required." });
      if (!endAt) throw fieldErrors({ end_at: "This field is required." });
      if (endAt <= startAt) {
        throw fieldErrors({ end_at: "The end date must be after the start date." });
      }

      // An explicitly chosen category must exist; an unknown id is never silently accepted.
      let categoryId: number | null = null;
      if (payload.category_id !== undefined && payload.category_id !== null && payload.category_id !== "") {
        categoryId = Number(payload.category_id);
        const category = await prisma.electionCategory.findUnique({
          where: { id: categoryId },
          select: { id: true },
        });
        if (!category) throw fieldErrors({ category_id: "That category does not exist." });
      }

      const created = await prisma.electionRequest.create({
        data: {
          requesterId: user.id,
          title,
          categoryName,
          categoryId,
          organization,
          description,
          purpose,
          startAt,
          endAt,
          expectedVoters,
          electionType: electionType || "public",
          voterIdMethod: voterIdMethod || "account",
          positionsText,
          reason,
          contactInfo,
          status: "PENDING",
        },
        include: REQUESTER_INCLUDE,
      });

      await recordAudit({
        actorId: user.id,
        action: "request.create",
        entityType: "ElectionRequest",
        entityId: created.id,
        summary: `Election request submitted: ${created.title}`,
        ipAddress: clientIp(req),
      });

      return json(serializeElectionRequest(created), 201);
    },
  },
});

export const GET = route;
export const POST = route;
