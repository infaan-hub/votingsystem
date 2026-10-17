import { prisma } from "@/src/lib/db";
import { ApiError, forbidden, invalidToken, unauthenticated } from "@/src/lib/http";
import type { Department, Section, User } from "@/src/generated/prisma/client";

export type SectionWithDepartment = Section & { department: Department | null };

export type UserWithRelations = Omit<User, "photoBytes"> & {
  photoBytes?: Uint8Array | null;
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

/**
 * Auth hot path: load every scalar column except the (potentially large)
 * profile-photo bytes. The photo is served separately through
 * /api/users/:id/photo and the client caches it by photoVersion, so there is
 * no need to pull the bytes on every authenticated request.
 */
export const USER_SELECT = {
  id: true,
  password: true,
  lastLogin: true,
  isSuperuser: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  isStaff: true,
  isActive: true,
  dateJoined: true,
  role: true,
  departmentId: true,
  sectionId: true,
  registrationNumber: true,
  staffId: true,
  phoneNumber: true,
  googleId: true,
  authProvider: true,
  photo: true,
  photoContentType: true,
  photoFilename: true,
  photoVersion: true,
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
    include: { user: { select: USER_SELECT } },
  });

  if (!token) throw invalidToken();
  if (!token.user.isActive) throw unauthenticated("User inactive or deleted.");

  return { user: token.user, tokenKey: token.key };
}

/**
 * Resolves a token supplied as `?token=` on a URL.
 *
 * `<img>` and `<video>` tags cannot send an Authorization header, so staff
 * previews of unpublished media carry the token in the query instead. A
 * missing or unknown token simply means anonymous here — media endpoints
 * decide visibility and answer 404, they never throw 401 for a bad token.
 */
export async function authenticateQueryToken(req: Request): Promise<RequestState> {
  const key = new URL(req.url).searchParams.get("token")?.trim();
  if (!key) return { user: null, tokenKey: null };

  const token = await prisma.token.findUnique({
    where: { key },
    include: { user: { select: USER_SELECT } },
  });

  if (!token || !token.user.isActive) return { user: null, tokenKey: null };
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
