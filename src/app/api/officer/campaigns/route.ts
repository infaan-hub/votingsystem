import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors, forbidden } from "@/src/lib/http";
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
import { isOfficerRole, requireStateUser } from "@/src/lib/auth";
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
  /** Extra gallery images beyond the cover, keyed by CampaignImage slot (1..2). */
  extras: { slot: number; bytes: Uint8Array; contentType: string; filename: string }[];
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
    extras: [],
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

  for (const [key, slot] of [
    ["image2", 1],
    ["image3", 2],
  ] as const) {
    const part = fileField(c, payload, key, { required: false, allowNull: true });
    if (part instanceof File) {
      const bytes = await validateImageFile(c, key, part);
      if (bytes) {
        if (bytes.length > MAX_IMAGE_BYTES) {
          c.field(
            key,
            `Image is too large. The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
          );
        } else {
          files.extras.push({
            slot,
            bytes,
            contentType: part.type || "",
            filename: part.name || "",
          });
        }
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
  // Officers and administrators may establish campaigns; every other signed-in
  // role is refused inside the handlers.
  permission: "authenticated",
  handlers: {
    GET: async (_req, _params, state) => {
      const actor = requireStateUser(state);
      if (actor.role !== "admin" && !isOfficerRole(actor.role)) throw forbidden();
      // null = unrestricted for an administrator; the officer's own scope
      // (managed + self-established elections) otherwise.
      const ids = await managedElectionIds(actor);
      const campaigns = await prisma.campaign.findMany({
        where: ids === null ? {} : { electionId: { in: ids } },
        include: CAMPAIGN_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(campaigns.map((campaign) => serializeCampaign(campaign, { moderation: true })));
    },
    POST: async (req, _params, state) => {
      const actor = requireStateUser(state);
      if (actor.role !== "admin" && !isOfficerRole(actor.role)) throw forbidden();
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

      const election = await requireManagedElection(electionId, actor);
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
          ownerId: actor.id,
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

      for (const extra of files.extras) {
        await prisma.campaignImage.create({
          data: {
            campaignId: created.id,
            slot: extra.slot,
            imageBytes: Buffer.from(extra.bytes),
            imageContentType: extra.contentType,
            imageFilename: extra.filename,
          },
        });
      }

      await recordAudit({
        actorId: actor.id,
        action: "campaign.create",
        entityType: "Campaign",
        entityId: created.id,
        summary: `Campaign "${created.topic}" created`,
        detail: { election_id: election.id, candidate_id: candidateId, status: created.status },
        ipAddress: clientIp(req),
      });

      // Re-read so the response includes the extra gallery images.
      const full = await prisma.campaign.findUniqueOrThrow({
        where: { id: created.id },
        include: CAMPAIGN_INCLUDE,
      });
      return json(serializeCampaign(full, { moderation: true }), 201);
    },
  },
});

export const GET = route;
export const POST = route;
