import { prisma } from "@/src/lib/db";
import { forbidden, notFoundModel } from "@/src/lib/http";
import type { UserWithRelations } from "@/src/lib/auth";
import { isOfficerRole } from "@/src/lib/auth";
import type { Election } from "@/src/generated/prisma/client";

/**
 * Whether `officer` may administer `election`.
 *
 * An officer is in scope when they created the election (it is *their*
 * election), or when an active election-scoped assignment covers it.
 * Officers are never scoped platform-wide, and administrators are always
 * in scope.
 *
 * The check reads the database on every call so revoking an assignment takes
 * effect immediately — it is never derived from the sidebar or a client flag.
 */
export async function officerCanManage(
  election: Pick<Election, "id" | "createdBy" | "organizationId">,
  officer: UserWithRelations,
): Promise<boolean> {
  if (officer.role === "admin") return true;
  if (!isOfficerRole(officer.role)) return false;
  if (election.createdBy && election.createdBy === officer.id) return true;

  const assignments = await prisma.officerAssignment.findMany({
    where: { officerId: officer.id, isActive: true, scope: "election" },
    select: { electionId: true },
  });

  return assignments.some((assignment) => assignment.electionId === election.id);
}

/**
 * Loads an election the actor is allowed to administer.
 * Out-of-scope elections surface as 404 so an officer cannot probe for the
 * existence of another organisation's private elections by changing an id.
 */
export async function requireManagedElection(
  electionId: number,
  actor: UserWithRelations,
): Promise<Election> {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw notFoundModel("Election");
  if (!(await officerCanManage(election, actor))) {
    if (actor.role === "admin") throw notFoundModel("Election");
    throw forbidden("You are not assigned to this election.");
  }
  return election;
}

/**
 * Every election id in the actor's administrative scope, ascending.
 * Administrators are unrestricted (`null`); officers always get a FINITE
 * list — the elections they created plus the ones assigned to them, never
 * "every election".
 */
export async function managedElectionIds(actor: UserWithRelations): Promise<number[] | null> {
  if (actor.role === "admin") return null; // null = unrestricted
  if (!isOfficerRole(actor.role)) return [];

  const [assignments, created] = await Promise.all([
    prisma.officerAssignment.findMany({
      where: { officerId: actor.id, isActive: true, scope: "election" },
      select: { electionId: true },
    }),
    prisma.election.findMany({
      where: { createdBy: actor.id },
      select: { id: true },
    }),
  ]);

  const ids = new Set<number>(created.map((row) => row.id));
  for (const assignment of assignments) {
    if (assignment.electionId !== null) ids.add(assignment.electionId);
  }

  return [...ids];
}
