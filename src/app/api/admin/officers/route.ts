import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, intField, strField, choiceField, isValidPhone } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { formatDateTime } from "@/src/lib/time";
import { notify } from "@/src/lib/notifications/notify";

const SCOPES = ["all", "election", "organization"] as const;

function serializeAssignment(assignment: {
  id: number;
  scope: string;
  note: string;
  isActive: boolean;
  createdAt: Date;
  officer: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
    phoneNumber: string;
  };
  election: { id: number; title: string; slug: string } | null;
  organization: { id: number; name: string } | null;
}) {
  return {
    id: assignment.id,
    scope: assignment.scope,
    note: assignment.note,
    is_active: assignment.isActive,
    created_at: formatDateTime(assignment.createdAt),
    officer: {
      id: assignment.officer.id,
      username: assignment.officer.username,
      full_name: `${assignment.officer.firstName} ${assignment.officer.lastName}`.trim(),
      email: assignment.officer.email,
      role: assignment.officer.role,
      is_active: assignment.officer.isActive,
      phone_number: assignment.officer.phoneNumber || null,
    },
    election: assignment.election
      ? { id: assignment.election.id, title: assignment.election.title, slug: assignment.election.slug }
      : null,
    organization: assignment.organization
      ? { id: assignment.organization.id, name: assignment.organization.name }
      : null,
  };
}

const ASSIGNMENT_INCLUDE = {
  officer: true,
  election: { select: { id: true, title: true, slug: true } },
  organization: { select: { id: true, name: true } },
} as const;

/** GET: every officer account plus its active/inactive assignments. */
export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async () => {
      const officers = await prisma.user.findMany({
        where: { role: { in: ["officer", "admin"] } },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          dateJoined: true,
          phoneNumber: true,
          officerAssignments: { include: ASSIGNMENT_INCLUDE, orderBy: { createdAt: "desc" } },
        },
        orderBy: { username: "asc" },
      });

      return json(
        officers.map((officer) => ({
          id: officer.id,
          username: officer.username,
          full_name: `${officer.firstName} ${officer.lastName}`.trim(),
          email: officer.email,
          role: officer.role,
          is_active: officer.isActive,
          joined_at: formatDateTime(officer.dateJoined),
          phone_number: officer.phoneNumber || null,
          assignments: officer.officerAssignments.map(serializeAssignment),
        })),
      );
    },
  },
});

/**
 * POST: grant or scope election-officer access.
 * - `user_id` may reference an existing account (role is promoted to
 *   `officer` when it is a normal user) or be omitted when `username` and
 *   `email` are supplied, in which case an officer account is created with an
 *   unusable password so it can only be activated via invite/reset.
 */
export const POST = makeRoute({
  permission: "admin",
  handlers: {
    POST: async (req, _params, state) => {
      const admin = requireStateAdmin(state);
      const payload = await readPayload(req);
      const c = new Collector();

      const userId = payload.user_id ? intField(c, payload, "user_id") : null;
      const username = strField(c, payload, "username", {
        required: !userId, allowBlank: true, maxLength: 150,
      });
      const email = strField(c, payload, "email", {
        required: !userId, allowBlank: true, maxLength: 254,
      });
      const fullName = strField(c, payload, "full_name", {
        required: false, allowBlank: true, maxLength: 150,
      });
      const scope = choiceField(c, payload, "scope", SCOPES, { defaultValue: "all" })!;
      const note = strField(c, payload, "note", {
        required: false, allowBlank: true, maxLength: 500,
      });
      const whatsappPhone = strField(c, payload, "whatsapp_phone", {
        required: false, allowBlank: true, maxLength: 25,
      });
      const electionId = payload.election_id ? intField(c, payload, "election_id") : null;
      const organizationId = payload.organization_id
        ? intField(c, payload, "organization_id")
        : null;
      c.throwIfAny();

      const phone = (whatsappPhone ?? "").trim();
      if (phone && !isValidPhone(phone)) {
        throw fieldErrors({
          whatsapp_phone:
            "Enter a valid WhatsApp number (digits, optionally starting with +).",
        });
      }

      if (scope === "election" && !electionId) {
        throw fieldErrors({ election_id: "Choose the election this officer will manage." });
      }
      if (scope === "organization" && !organizationId) {
        throw fieldErrors({ organization_id: "Choose the organization this officer will manage." });
      }
      if (electionId) {
        const election = await prisma.election.findUnique({
          where: { id: electionId },
          select: { id: true },
        });
        if (!election) throw fieldErrors({ election_id: "That election does not exist." });
      }
      if (organizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!organization) {
          throw fieldErrors({ organization_id: "That organization does not exist." });
        }
      }

      let officerId = userId ?? null;
      if (!officerId) {
        const or: Array<{ username?: string; email?: string }> = [];
        if (username) or.push({ username });
        if (email) or.push({ email });
        const existing = or.length
          ? await prisma.user.findFirst({ where: { OR: or }, select: { id: true } })
          : null;
        if (existing) {
          officerId = existing.id;
        } else {
          const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
          const created = await prisma.user.create({
            data: {
              username,
              email,
              firstName: firstName ?? "",
              lastName: rest.join(" "),
              role: "officer",
              isActive: true,
              password: "",
            },
            select: { id: true },
          });
          officerId = created.id;
        }
      }

      const target = await prisma.user.findUnique({
        where: { id: officerId },
        select: { id: true, role: true },
      });
      if (!target) throw fieldErrors({ user_id: "That account does not exist." });
      // Promote normal users; an administrator keeps the admin role.
      if (target.role !== "admin") {
        await prisma.user.update({
          where: { id: target.id },
          data: { role: "officer" },
        });
      }
      // The WhatsApp number is the sending identity officers use to share
      // election links with voters, so it is stored on the account itself.
      if (phone) {
        await prisma.user.update({
          where: { id: target.id },
          data: { phoneNumber: phone },
        });
      }

      const assignment = await prisma.officerAssignment.create({
        data: {
          officerId: officerId!,
          scope,
          electionId: scope === "election" ? electionId : null,
          organizationId: scope === "organization" ? organizationId : null,
          assignedBy: admin.id,
          isActive: true,
          note,
        },
        include: ASSIGNMENT_INCLUDE,
      });

      await recordAudit({
        actorId: admin.id,
        action: "admin.officer.assign",
        entityType: "OfficerAssignment",
        entityId: assignment.id,
        summary: `Officer ${assignment.officer.username} assigned (${scope})`,
        detail: { electionId, organizationId, scope },
        ipAddress: clientIp(req),
      });

      // Tell the newly appointed officer (in-app + push to their devices).
      try {
        const scopeLabel =
          scope === "election" && assignment.election
            ? ` the election “${assignment.election.title}”`
            : scope === "organization" && assignment.organization
              ? ` the organization “${assignment.organization.name}”`
              : " the platform";
        await notify({
          recipientIds: [officerId!],
          title: "You were appointed as an election officer",
          body: `An administrator gave you officer access for${scopeLabel}.`,
          targetUrl: "/officer/dashboard",
          tag: `officer-appointed-${assignment.id}`,
          category: "officer",
          idempotencyKey: `officer-appointed-${assignment.id}`,
          data: { assignmentId: assignment.id, scope },
        });
      } catch {
        // Never fail the assignment because push delivery failed.
      }

      return json(serializeAssignment(assignment), 201);
    },
  },
});
