import { prisma } from "@/src/lib/db";
import { ApiError, forbidden, invalidToken, unauthenticated } from "@/src/lib/http";
import type { Department, Section, User } from "@/src/generated/prisma/client";

export type SectionWithDepartment = Section & { department: Department | null };

export type UserWithRelations = User & {
  department: Department | null;
  section: SectionWithDepartment | null;
};

export type RequestState = {
  user: UserWithRelations | null;
  tokenKey: string | null;
};

export const ROLES = ["voter", "officer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const USER_INCLUDE = {
  department: true,
  section: { include: { department: true } },
} as const;

function splitAuthorization(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts[0].toLowerCase() !== "token") return null;
  if (parts.length === 1) {
    throw new ApiError(401, {
      detail: "Invalid token header. No credentials provided.",
    });
  }
  if (parts.length > 2) {
    throw new ApiError(401, {
      detail: "Invalid token header. Token string should not contain spaces.",
    });
  }
  return parts[1];
}

/**
 * Resolves `Authorization: Token <key>`: a missing or unknown key is a 401.
 * Returns an anonymous state when no (or an unrelated) header is present.
 */
export async function authenticateRequest(req: Request): Promise<RequestState> {
  const key = splitAuthorization(req.headers.get("authorization"));
  if (!key) return { user: null, tokenKey: null };

  const token = await prisma.token.findUnique({
    where: { key },
    include: { user: { include: USER_INCLUDE } },
  });

  if (!token) throw invalidToken();
  if (!token.user.isActive) throw unauthenticated("User inactive or deleted.");

  return { user: token.user, tokenKey: token.key };
}

export function requireStateUser(state: RequestState): UserWithRelations {
  if (!state.user) throw unauthenticated();
  return state.user;
}

export function requireStateAdmin(state: RequestState): UserWithRelations {
  const user = requireStateUser(state);
  if (user.role !== "admin") throw forbidden();
  return user;
}

/** Election officers and administrators share the officer toolset. */
export function isOfficerRole(role: string): boolean {
  return role === "officer" || role === "admin";
}

export function requireStateOfficer(state: RequestState): UserWithRelations {
  const user = requireStateUser(state);
  if (!isOfficerRole(user.role)) {
    throw forbidden("Election officer access is required.");
  }
  return user;
}
