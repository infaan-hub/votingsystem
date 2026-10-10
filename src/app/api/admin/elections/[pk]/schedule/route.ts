import { json, makeRoute } from "@/src/lib/api";
import { ApiError } from "@/src/lib/http";
import {
  Collector,
  boolField,
  dateTimeField,
  fileField,
  strField,
  validateImageFile,
} from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { ValidationError, validateElection } from "@/src/lib/validation";
import { serializeElectionDetail } from "@/src/lib/serializers";

const SCHEDULE_FIELDS = [
  "campaign_start_at",
  "campaign_end_at",
  "voting_start_at",
  "voting_end_at",
] as const;

export const PATCH = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) {
        throw new ApiError(404, { detail: "No Election matches the given query." });
      }
      const payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);

      const c = new Collector();
      const title = has("title")
        ? strField(c, payload, "title", { required: false, maxLength: 180 })
        : undefined;
      const description = has("description")
        ? strField(c, payload, "description", { required: false, allowBlank: true })
        : undefined;
      const image = has("image")
        ? fileField(c, payload, "image", { required: false, allowNull: true })
        : undefined;
      let imageBytes: Uint8Array | null | undefined;
      let imageContentType = "";
      let imageFilename = "";
      if (image instanceof File) {
        const bytes = await validateImageFile(c, "image", image);
        if (bytes) {
          imageBytes = bytes;
          imageContentType = image.type || "";
          imageFilename = image.name || "";
        }
      }
      const campaignStartAt = has("campaign_start_at")
        ? dateTimeField(c, payload, "campaign_start_at", { required: false })
        : undefined;
      const campaignEndAt = has("campaign_end_at")
        ? dateTimeField(c, payload, "campaign_end_at", { required: false })
        : undefined;
      const votingStartAt = has("voting_start_at")
        ? dateTimeField(c, payload, "voting_start_at", { required: false })
        : undefined;
      const votingEndAt = has("voting_end_at")
        ? dateTimeField(c, payload, "voting_end_at", { required: false })
        : undefined;
      const allowLiveResults = has("allow_live_results")
        ? boolField(c, payload, "allow_live_results", { required: false })
        : undefined;
      const announceWinners = has("announce_winners_automatically")
        ? boolField(c, payload, "announce_winners_automatically", { required: false })
        : undefined;
      const isPublished = has("is_published")
        ? boolField(c, payload, "is_published", { required: false })
        : undefined;
      c.throwIfAny();

      const scheduleTouched = SCHEDULE_FIELDS.some((field) =>
        Object.prototype.hasOwnProperty.call(payload, field),
      );

      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (campaignStartAt !== undefined) updates.campaignStartAt = campaignStartAt;
      if (campaignEndAt !== undefined) updates.campaignEndAt = campaignEndAt;
      if (votingStartAt !== undefined) updates.votingStartAt = votingStartAt;
      if (votingEndAt !== undefined) updates.votingEndAt = votingEndAt;
      if (allowLiveResults !== undefined) updates.allowLiveResults = allowLiveResults;
      if (announceWinners !== undefined) updates.announceWinnersAutomatically = announceWinners;
      if (isPublished !== undefined) updates.isPublished = isPublished;
      if (image instanceof File && imageBytes) {
        updates.image = null;
        updates.imageBytes = Buffer.from(imageBytes);
        updates.imageContentType = imageContentType;
        updates.imageFilename = imageFilename;
      } else if (image === null) {
        // ModelSerializer only clears the FileField path; binary columns stay.
        updates.image = null;
      }

      if (scheduleTouched) {
        const merged = { ...election, ...updates };
        try {
          validateElection({
            title: (updates.title as string | undefined) !== undefined
              ? (updates.title as string).trim()
              : election.title.trim(),
            campaignStartAt: merged.campaignStartAt,
            campaignEndAt: merged.campaignEndAt,
            votingStartAt: merged.votingStartAt,
            votingEndAt: merged.votingEndAt,
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new ApiError(400, error.errorDict ?? {});
          }
          throw error;
        }
      }

      // `clean()` strips title/description in-place before save.
      if ("title" in updates) updates.title = (updates.title as string).trim();
      if ("description" in updates) updates.description = (updates.description as string).trim();
      if (updates.title === undefined) updates.title = election.title.trim();
      if (updates.description === undefined) updates.description = election.description.trim();

      const saved = await prisma.election.update({
        where: { id: election.id },
        data: updates,
      });
      return json(await serializeElectionDetail(saved));
    },
  },
});
