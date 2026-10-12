import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import {
  Collector,
  choiceField,
  dateTimeField,
  fileField,
  intField,
  strField,
  validateImageFile,
} from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection, managedElectionIds } from "@/src/lib/officer";
import { MAX_IMAGE_BYTES, validateCampaignVideo } from "@/src/lib/media";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";

const CAMPAIGN_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export type CampaignFileFields = {
  imageBytes: Uint8Array | null;
  imageContentType: string;
  imageFilename: string;
  videoBytes: Uint8Array | null;
  videoContentType: string;
  videoFilename: string;
  videoDurationSeconds: number | null;
};

export async function collectCampaignFiles(
  c: Collector,
  payload: Payload,
): Promise<CampaignFileFields> {
  const files: CampaignFileFields = {
    imageBytes: null,
    imageContentType: "",
    imageFilename: "",
    videoBytes: null,
    videoContentType: "",
    videoFilename: "",
    videoDurationSeconds: null,
  };

  const image = fileField(c, payload, "image", { required: false, allowNull: true });
  if (image instanceof File) {
    const bytes = await validateImageFile(c, "image", image);
    if (bytes) {
      if (bytes.length > MAX_IMAGE_BYTES) {
        c.field(
          "image",
          `Image is too large. The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
        );
      } else {
        files.imageBytes = bytes;
        files.imageContentType = image.type || "";
        files.imageFilename = image.name || "";
      }
    }
  }

  const video = fileField(c, payload, "video", { required: false, allowNull: true });
  if (video instanceof File) {
    const validation = await validateCampaignVideo(video);
    if (!validation.ok) {
      c.field("video", validation.message);
    } else {
      files.videoBytes = new Uint8Array(await video.arrayBuffer());
      files.videoContentType = video.type || "";
      files.videoFilename = video.name || "";
      files.videoDurationSeconds = Math.round(validation.durationMs / 1000);
    }
  }

  return files;
}

const route = makeRoute({
  permission: "officer",
  handlers: {
    GET: async (_req, _params, state) => {
      const officer = requireStateOfficer(state);
      const ids = await managedElectionIds(officer);
      const campaigns = await prisma.campaign.findMany({
        where: ids === null ? {} : { electionId: { in: ids } },
        include: CAMPAIGN_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(campaigns.map((campaign) => serializeCampaign(campaign, { moderation: true })));
    },
    POST: async (req, _params, state) => {
      const officer = requireStateOfficer(state);
      const payload = await readPayload(req);

      const c = new Collector();
      const electionId = intField(c, payload, "election_id") ?? 0;
      const candidateId = intField(c, payload, "candidate_id") ?? 0;
      const topic = strField(c, payload, "topic", { maxLength: 200 });
      const description = strField(c, payload, "description", {
        required: false,
        allowBlank: true,
        maxLength: 4000,
      });
      const startAt = dateTimeField(c, payload, "start_at", { required: false, allowNull: true });
      const endAt = dateTimeField(c, payload, "end_at", { required: false, allowNull: true });
      const status =
        choiceField(c, payload, "status", CAMPAIGN_STATUSES, { required: false, defaultValue: "DRAFT" }) ??
        "DRAFT";
      const files = await collectCampaignFiles(c, payload);
      c.throwIfAny();

      const election = await requireManagedElection(electionId, officer);
      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, electionId: election.id },
        select: { id: true },
      });
      if (!candidate) {
        throw fieldErrors({ candidate_id: "That candidate does not belong to this election." });
      }
      if (startAt && endAt && endAt <= startAt) {
        throw fieldErrors({ end_at: "The end date must be after the start date." });
      }

      const created = await prisma.campaign.create({
        data: {
          electionId: election.id,
          candidateId,
          ownerId: officer.id,
          topic,
          description: description ?? "",
          startAt: startAt ?? null,
          endAt: endAt ?? null,
          status,
          imageBytes: files.imageBytes ? Buffer.from(files.imageBytes) : null,
          imageContentType: files.imageContentType,
          imageFilename: files.imageFilename,
          videoBytes: files.videoBytes ? Buffer.from(files.videoBytes) : null,
          videoContentType: files.videoContentType,
          videoFilename: files.videoFilename,
          videoDurationSeconds: files.videoDurationSeconds ?? 0,
        },
        include: CAMPAIGN_INCLUDE,
      });

      await recordAudit({
        actorId: officer.id,
        action: "officer.campaign.create",
        entityType: "Campaign",
        entityId: created.id,
        summary: `Campaign "${created.topic}" created`,
        detail: { election_id: election.id, candidate_id: candidateId, status: created.status },
        ipAddress: clientIp(req),
      });

      return json(serializeCampaign(created, { moderation: true }), 201);
    },
  },
});

export const GET = route;
export const POST = route;
