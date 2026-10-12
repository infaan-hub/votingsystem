import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, choiceField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";

const MODERATION_STATUSES = ["PUBLISHED", "HIDDEN", "REJECTED"] as const;

export const PATCH = makeRoute({
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

      const updated = await prisma.campaign.update({
        where: { id: pk },
        data: {
          status,
          moderationNote: moderationNote ?? existing.moderationNote,
          moderatedBy: admin.id,
          moderatedAt: new Date(),
        },
        include: CAMPAIGN_INCLUDE,
      });

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
  },
});
