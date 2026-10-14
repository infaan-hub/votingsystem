import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { serializeElectionAdmin } from "@/src/lib/elections";
import { notifyElectionStatusChange } from "@/src/lib/notifications/events";

const RESULT_ACTIONS = ["finalize", "publish", "unpublish"] as const;

export const POST = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");

      const payload = await readPayload(req);
      const c = new Collector();
      const action = choiceField(c, payload, "action", RESULT_ACTIONS)!;
      c.throwIfAny();

      const updates: Record<string, unknown> = {};
      if (action === "finalize") {
        if (election.status !== "CLOSED") {
          throw fieldErrors({
            action: "Results can only be finalized after the election has been closed.",
          });
        }
        updates.resultFinalizedAt = new Date();
      } else if (action === "publish") {
        if (!election.resultFinalizedAt && election.status !== "CLOSED") {
          throw fieldErrors({ action: "Finalize the results before publishing them." });
        }
        updates.resultPublishedAt = new Date();
        updates.status = "RESULTS_PUBLISHED";
        updates.isPublished = true;
      } else {
        updates.resultPublishedAt = null;
        updates.status = "CLOSED";
      }

      const updated = await prisma.election.update({ where: { id: pk }, data: updates });

      // Compares persisted previous → new status: only a real transition into
      // RESULTS_PUBLISHED notifies; finalize, unpublish and retried publishes
      // stay silent. Runs after the update committed and never throws.
      await notifyElectionStatusChange(election.status, updated);

      await recordAudit({
        actorId: admin.id,
        action: `admin.results.${action}`,
        entityType: "Election",
        entityId: pk,
        summary: `Result ${action} for "${updated.title}"`,
        detail: { action },
        ipAddress: clientIp(req),
      });

      return json(serializeElectionAdmin(updated));
    },
  },
});
