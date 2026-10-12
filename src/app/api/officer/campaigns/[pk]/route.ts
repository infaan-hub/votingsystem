import { json, makeRoute, noContent } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import {
  Collector,
  choiceField,
  dateTimeField,
  strField,
} from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";
import { collectCampaignFiles } from "@/src/app/api/officer/campaigns/route";

const CAMPAIGN_STATUSES = ["DRAFT", "PUBLISHED"] as const;

const route = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const pk = Number(params.pk);
      const existing = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Campaign");
      await requireManagedElection(existing.electionId, officer);

      const payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
      const c = new Collector();
      const topic = has("topic")
        ? strField(c, payload, "topic", { required: false, maxLength: 200 })
        : undefined;
      const description = has("description")
        ? strField(c, payload, "description", {
            required: false,
            allowBlank: true,
            maxLength: 4000,
          })
        : undefined;
      const startAt = has("start_at")
        ? dateTimeField(c, payload, "start_at", { required: false, allowNull: true })
        : undefined;
      const endAt = has("end_at")
        ? dateTimeField(c, payload, "end_at", { required: false, allowNull: true })
        : undefined;
      const status = has("status")
        ? choiceField(c, payload, "status", CAMPAIGN_STATUSES, { required: false })
        : undefined;
      const files = await collectCampaignFiles(c, payload);
      c.throwIfAny();

      if (topic !== undefined && !topic) {
        throw fieldErrors({ topic: "This field may not be blank." });
      }

      const finalStart = startAt !== undefined ? startAt : existing.startAt;
      const finalEnd = endAt !== undefined ? endAt : existing.endAt;
      if (finalStart && finalEnd && finalEnd <= finalStart) {
        throw fieldErrors({ end_at: "The end date must be after the start date." });
      }

      const updates: Record<string, unknown> = {};
      if (topic !== undefined) updates.topic = topic;
      if (description !== undefined) updates.description = description;
      if (startAt !== undefined) updates.startAt = startAt;
      if (endAt !== undefined) updates.endAt = endAt;
      if (status !== undefined) updates.status = status;
      if (files.imageBytes) {
        updates.imageBytes = Buffer.from(files.imageBytes);
        updates.imageContentType = files.imageContentType;
        updates.imageFilename = files.imageFilename;
      }
      if (files.videoBytes) {
        updates.videoBytes = Buffer.from(files.videoBytes);
        updates.videoContentType = files.videoContentType;
        updates.videoFilename = files.videoFilename;
        updates.videoDurationSeconds = files.videoDurationSeconds ?? 0;
      }

      const updated = await prisma.campaign.update({
        where: { id: pk },
        data: updates,
        include: CAMPAIGN_INCLUDE,
      });

      await recordAudit({
        actorId: officer.id,
        action: "officer.campaign.update",
        entityType: "Campaign",
        entityId: pk,
        summary: `Campaign "${updated.topic}" updated`,
        detail: { election_id: updated.electionId, status: updated.status },
        ipAddress: clientIp(req),
      });

      return json(serializeCampaign(updated, { moderation: true }));
    },
    DELETE: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const pk = Number(params.pk);
      const existing = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("Campaign");
      await requireManagedElection(existing.electionId, officer);

      await prisma.campaign.delete({ where: { id: pk } });

      await recordAudit({
        actorId: officer.id,
        action: "officer.campaign.delete",
        entityType: "Campaign",
        entityId: pk,
        summary: `Campaign "${existing.topic}" deleted`,
        detail: { election_id: existing.electionId },
        ipAddress: clientIp(req),
      });

      return noContent();
    },
  },
});

export const PATCH = route;
export const DELETE = route;
