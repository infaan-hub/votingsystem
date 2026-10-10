import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { serializeElectionAdmin } from "@/src/app/api/admin/elections/route";

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["NOMINATIONS", "ARCHIVED"],
  NOMINATIONS: ["READY", "ARCHIVED"],
  READY: ["OPEN", "ARCHIVED"],
  OPEN: ["CLOSED"],
  CLOSED: ["RESULTS_PUBLISHED"],
  RESULTS_PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const route = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({
        where: { id: pk },
        include: { category: true, organization: true },
      });
      if (!election) throw notFoundModel("Election");

      const payload = await readPayload(req);
      const target = typeof payload.status === "string" ? payload.status : "";
      if (!target) throw fieldErrors({ status: "This field is required." });

      const allowed = LEGAL_TRANSITIONS[election.status] ?? [];
      if (!allowed.includes(target)) {
        throw fieldErrors({
          status: `Cannot transition from ${election.status} to ${target}. Allowed: ${allowed.join(", ") || "none"}.`,
        });
      }

      const updates: Record<string, unknown> = { status: target };
      if (target === "ARCHIVED") updates.archivedAt = new Date();

      const updated = await prisma.election.update({
        where: { id: pk },
        data: updates,
        include: { category: true, organization: true },
      });
      return json(serializeElectionAdmin(updated));
    },
  },
});

export const POST = route;