import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { serializeElectionAdmin } from "@/src/app/api/admin/elections/route";
import { transitionElection } from "@/src/lib/elections";

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

      // The shared state machine re-checks legality, the voting window for
      // OPEN, publishability for PUBLISHED, stamps resultPublishedAt when
      // results are published, and fires the lifecycle notifications — one
      // implementation for every entry point.
      const updated = await transitionElection(election, target);

      return json(serializeElectionAdmin(updated));
    },
  },
});

export const POST = route;
