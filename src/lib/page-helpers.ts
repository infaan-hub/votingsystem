/**
 * Pure view helpers for page components.
 *
 * Deliberately free of any Prisma import: client components import this module,
 * and a re-export from the server serializer would pull the database driver
 * into the browser bundle.
 */

/** Full name with a username fallback; mirrors the API serializer. */
export function displayName(user: {
  firstName: string;
  lastName: string;
  username: string;
}): string {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.username;
}

/** Up to two uppercase initials for avatar placeholders. */
export function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** 0–100 share of `part` within `total`, safe when the total is zero. */
export function sharePercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

/**
 * Media path for a candidate photo. Mirrors the server serializer's rule so the
 * client and the API agree on the same URL without sharing a module.
 */
export function candidatePhotoPath(candidate: {
  id: number;
  photoBytes: Uint8Array | null;
  photo: string | null;
}): string | null {
  if (candidate.photoBytes && candidate.photoBytes.length) {
    return `/api/candidates/${candidate.id}/photo/`;
  }
  if (candidate.photo) return `/media/${candidate.photo}`;
  return null;
}