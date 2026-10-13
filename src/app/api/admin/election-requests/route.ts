import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import {
  serializeElectionRequest,
  REQUESTER_INCLUDE,
} from "@/src/app/api/election-requests/route";

/** GET: every election request, newest first. Optional `?status=` filter. */
export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status");
      const requests = await prisma.electionRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        include: REQUESTER_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(requests.map((request) => serializeElectionRequest(request)));
    },
  },
});
