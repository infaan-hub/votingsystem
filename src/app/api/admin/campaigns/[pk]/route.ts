import { json, makeRoute, noContent } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, choiceField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";
import { notifyCampaignModerated } from "@/src/lib/notifications/events";

const MODERATION_STATUSES = ["PUBLISHED", "HIDDEN", "REJECTED"] as const;

const route = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Campaign");

      const payload = await readPayload(req);
      const c = new Collector();
      const status = choiceField(c, payload, "status", MODERATION_STATUSES)!;
      const moderationNote = strField(c, payload, "moderation_note", {
        required: false,
        allowBlank: true,
        maxLength: 2000,
      });
      c.throwIfAny();

      if ((status === "REJECTED" || status === "HIDDEN") && !moderationNote) {
        throw fieldErrors({
          moderation_note: "A moderation note is required when hiding or rejecting a campaign.",
        });
      }

      const moderation = {
        moderationNote: moderationNote ?? existing.moderationNote,
        moderatedBy: admin.id,
        moderatedAt: new Date(),
      };
      const statusChanged = existing.status !== status;
      if (statusChanged) {
        // Guarded compare-and-swap on the previous status: only the request
        // that actually flips the persisted status notifies, so retries and
        // concurrent moderation requests cannot duplicate the event.
        const flip = await prisma.campaign.updateMany({
          where: { id: pk, status: existing.status },
          data: { status, ...moderation },
        });
        if (flip.count !== 1) {
          throw fieldErrors({
            status: "This campaign was just updated by someone else. Reload and try again.",
          });
        }
      } else {
        // Unchanged status: keep the pre-existing behavior of refreshing the
        // note/moderator without firing a notification.
        await prisma.campaign.update({ where: { id: pk }, data: moderation });
      }

      const updated = await prisma.campaign.findUnique({
        where: { id: pk },
        include: CAMPAIGN_INCLUDE,
      });
      if (!updated) throw notFoundModel("Campaign");

      if (statusChanged) {
        // The moderatedAt instant of this flip versions the idempotency key:
        // retries stay silent (status already set), legitimate reversals
        // notify again. Never includes the moderation note.
        await notifyCampaignModerated(updated, status, updated.moderatedAt!.getTime());
      }

      await recordAudit({
        actorId: admin.id,
        action: `admin.campaign.${status}`,
        entityType: "Campaign",
        entityId: pk,
        summary: `Campaign #${pk} "${updated.topic}" marked ${status}`,
        detail: { election_id: updated.electionId, status },
        ipAddress: clientIp(req),
      });

      return json(serializeCampaign(updated, { admin: true }));
    },
    DELETE: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Campaign");

      await prisma.campaign.delete({ where: { id: pk } });

      await recordAudit({
        actorId: admin.id,
        action: "admin.campaign.delete",
        entityType: "Campaign",
        entityId: pk,
        summary: `Campaign #${pk} "${existing.topic}" deleted`,
        detail: { election_id: existing.electionId },
        ipAddress: clientIp(req),
      });

      return noContent();
    },
  },
});

export const PATCH = route;
export const DELETE = route;
