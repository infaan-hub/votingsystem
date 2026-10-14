import { formatDateTime } from "@/src/lib/time";
import type { ElectionRequest } from "@/src/generated/prisma/client";

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
