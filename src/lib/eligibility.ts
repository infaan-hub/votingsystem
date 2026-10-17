import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/src/lib/db";
import type { Election } from "@/src/generated/prisma/client";
import type { UserWithRelations } from "@/src/lib/auth";

/** Roles that may ever cast a ballot (admins need `allowAdminsToVote`). */
export const BALLOT_ROLES = ["voter", "officer"];

/** Policies that only admit people on the officer's eligibility list. */
export const LIST_BASED_POLICIES = new Set(["voter_list", "org_members", "invite_only"]);

/** How a voter proves identity at the ballot; shared by the officer API. */
export const VOTER_ID_METHODS = [
  "account",
  "email",
  "phone",
  "membership",
  "employee",
  "student_id",
  "custom",
] as const;

export const CAPACITY_MODES = ["restricted", "open"] as const;

/**
 * Deterministic, per-election digest of a voter identifier.
 *
 * Salting per election means the same membership number in two elections
 * produces unrelated digests, so a leaked table cannot be cross-matched.
 * The clear-text identifier is never persisted.
 */
export function identifierDigest(electionId: number, rawIdentifier: string): string {
  const normalized = rawIdentifier.trim().toLowerCase().replace(/\s+/g, "");
  return createHash("sha256")
    .update(`ev1:${electionId}:${normalized}`)
    .digest("hex");
}

export type EligibilityResult = {
  eligible: boolean;
  /** User-facing explanation when `eligible` is false. */
  reason: string;
  /** Whether the current election requires an identifier input. */
  requiresIdentifier: boolean;
  /** Human label for that input, e.g. "Student ID". */
  identifierLabel: string;
  /**
   * True when the supplied identifier was matched against the officer's
   * pre-registered list (real verification) rather than merely collected.
   */
  identifierVerified: boolean;
  /** True when the officer has declared a finite voter capacity. */
  capacityRestricted: boolean;
  maxVoters: number | null;
  eligibleVoters: number;
};

function labelFor(election: Election): string {
  if (election.voterIdMethod === "custom" && election.voterIdLabel.trim()) {
    return election.voterIdLabel.trim();
  }
  const labels: Record<string, string> = {
    account: "Account",
    email: "Email address",
    phone: "Phone number",
    membership: "Membership number",
    employee: "Employee ID",
    student_id: "Student ID",
    custom: election.voterIdLabel.trim() || "Identifier",
  };
  return labels[election.voterIdMethod] ?? "Identifier";
}

/**
 * Server-side eligibility decision for one voter in one election.
 *
 * Free-text `rulesText` is displayed to voters but never consulted here —
 * only structured fields drive the decision.
 */
export async function checkElectionEligibility(
  election: Election,
  user: UserWithRelations | null,
  providedIdentifier?: string | null,
): Promise<EligibilityResult> {
  const requiresIdentifier = election.voterIdMethod !== "account";
  const identifierLabel = labelFor(election);
  const base: EligibilityResult = {
    eligible: false,
    reason: "",
    requiresIdentifier,
    identifierLabel,
    identifierVerified: false,
    capacityRestricted: election.capacityMode === "restricted",
    maxVoters: election.maxVoters,
    eligibleVoters: 0,
  };

  if (!election.isPublished) {
    return { ...base, reason: "This election is not published." };
  }
  if (!user) {
    return { ...base, reason: "Sign in to check whether you can vote." };
  }
  if (!user.isActive) {
    return { ...base, reason: "This account is deactivated." };
  }
  if (user.role === "admin" && !election.allowAdminsToVote) {
    return { ...base, reason: "Administrator accounts cannot vote in this election." };
  }
  if (user.role !== "admin" && !BALLOT_ROLES.includes(user.role)) {
    return { ...base, reason: "This account role cannot cast a ballot." };
  }

  const listBased = LIST_BASED_POLICIES.has(election.eligibilityPolicy);
  const identifier = (providedIdentifier ?? "").trim();

  if (requiresIdentifier && !identifier) {
    return {
      ...base,
      reason: `Enter your ${identifierLabel} to confirm eligibility.`,
    };
  }

  const hasList = await prisma.electionVoter.count({ where: { electionId: election.id } });

  // Capacity: only when the officer declared a finite cap. An open public
  // election has no declared participant limit.
  if (election.capacityMode === "restricted" && election.maxVoters !== null) {
    const participants = await prisma.vote.groupBy({
      by: ["voterId"],
      where: { electionId: election.id },
    });
    if (participants.length >= election.maxVoters) {
      return { ...base, reason: "This election has reached its voter capacity." };
    }
  }

  /**
   * A list is required for list-based policies, and also when the officer
   * demanded an identifier *and* has registered one — a declared ID method
   * with a real list behind it is actual verification.
   */
  const needsListEntry =
    listBased ||
    (requiresIdentifier && hasList > 0 && election.eligibilityPolicy !== "open");

  if (needsListEntry) {
    if (hasList === 0) {
      return {
        ...base,
        reason: listBased
          ? "You are not on this election's eligibility list."
          : `Your ${identifierLabel} is not registered for this election.`,
      };
    }

    const byAccount = await prisma.electionVoter.findFirst({
      where: { electionId: election.id, userId: user.id },
    });

    let byIdentifier: { userId: number | null } | null = null;
    if (requiresIdentifier) {
      const digest = identifierDigest(election.id, identifier);
      byIdentifier = await prisma.electionVoter.findFirst({
        where: { electionId: election.id, uniqueKey: `h:${digest}` },
        select: { userId: true },
      });
    }

    if (!byAccount && !byIdentifier) {
      return {
        ...base,
        reason: requiresIdentifier
          ? `That ${identifierLabel} is not on this election's list.`
          : "You are not on this election's eligibility list.",
      };
    }
    if (byIdentifier?.userId && byIdentifier.userId !== user.id) {
      return {
        ...base,
        reason: `That ${identifierLabel} is registered to a different account.`,
      };
    }
    if (byAccount && requiresIdentifier && !byIdentifier) {
      return {
        ...base,
        reason: `That ${identifierLabel} does not match our records.`,
      };
    }

    base.identifierVerified = requiresIdentifier && byIdentifier !== null;
  } else {
    // No list behind the method: the identifier is collected as a check,
    // never presented as verification.
    base.identifierVerified = false;
  }

  base.eligible = true;
  base.eligibleVoters = hasList;
  return base;
}

/** Convenience wrapper returning only the boolean. */
export async function isEligibleToVote(
  election: Election,
  user: UserWithRelations | null,
  providedIdentifier?: string | null,
): Promise<boolean> {
  const result = await checkElectionEligibility(election, user, providedIdentifier);
  return result.eligible;
}

/** Random, revocable share token for a protected invitation link. */
export function generateShareToken(): string {
  return randomBytes(18).toString("base64url");
}
