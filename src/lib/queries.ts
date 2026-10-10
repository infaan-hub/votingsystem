import { prisma } from "@/src/lib/db";

/**
 * Case-insensitive lookups. Uses quoted camelCase identifiers so Postgres
 * matches the columns Prisma created (unquoted identifiers would fold to
 * lowercase and fail with 42703).
 */

export async function userIdByUsernameIexact(
  username: string,
  excludeId?: number,
): Promise<number | null> {
  const rows =
    excludeId === undefined
      ? await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("username") = UPPER(${username})
        LIMIT 1`
      : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("username") = UPPER(${username}) AND "id" <> ${excludeId}
        LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function userIdByEmailIexact(
  email: string,
  excludeId?: number,
): Promise<number | null> {
  const rows =
    excludeId === undefined
      ? await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("email") = UPPER(${email})
        LIMIT 1`
      : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("email") = UPPER(${email}) AND "id" <> ${excludeId}
        LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function positionIdByNameIexact(
  electionId: number,
  name: string,
  excludeId?: number,
): Promise<number | null> {
  const rows =
    excludeId === undefined
      ? await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Position"
        WHERE "electionId" = ${electionId} AND UPPER("name") = UPPER(${name})
        LIMIT 1`
      : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Position"
        WHERE "electionId" = ${electionId} AND UPPER("name") = UPPER(${name})
          AND "id" <> ${excludeId}
        LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function usernameTakenIexact(
  username: string,
  excludeId?: number,
): Promise<boolean> {
  const rows =
    excludeId === undefined
      ? await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("username") = UPPER(${username})
        LIMIT 1`
      : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("username") = UPPER(${username}) AND "id" <> ${excludeId}
        LIMIT 1`;
  return rows.length > 0;
}

export async function emailTakenIexact(
  email: string,
  excludeId?: number,
): Promise<boolean> {
  const rows =
    excludeId === undefined
      ? await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("email") = UPPER(${email})
        LIMIT 1`
      : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User"
        WHERE UPPER("email") = UPPER(${email}) AND "id" <> ${excludeId}
        LIMIT 1`;
  return rows.length > 0;
}
