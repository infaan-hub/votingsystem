import { json, makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
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

export const POST = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");
      const payload = await readPayload(req);

      const c = new Collector();
      const title = strField(c, payload, "title", { maxLength: 180 });
      const description = strField(c, payload, "description", {
        required: false,
        allowBlank: true,
      });
      const image = fileField(c, payload, "image", { required: false, allowNull: true });
      let imageBytes: Uint8Array | null = null;
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
      const campaignStartAt = dateTimeField(c, payload, "campaign_start_at")!;
      const campaignEndAt = dateTimeField(c, payload, "campaign_end_at")!;
      const votingStartAt = dateTimeField(c, payload, "voting_start_at")!;
      const votingEndAt = dateTimeField(c, payload, "voting_end_at")!;
      const allowLiveResults = boolField(c, payload, "allow_live_results", {
        defaultValue: true,
      })!;
      const announceWinners = boolField(c, payload, "announce_winners_automatically", {
        defaultValue: true,
      })!;
      const isPublished = boolField(c, payload, "is_published", { defaultValue: true })!;
      c.throwIfAny();

      const cleanTitle = title.trim();
      const cleanDescription = description.trim();
      try {
        validateElection({
          title: cleanTitle,
          campaignStartAt,
          campaignEndAt,
          votingStartAt,
          votingEndAt,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ApiError(400, error.errorDict ?? {});
        }
        throw error;
      }

      const updates: Record<string, unknown> = {
        title: cleanTitle,
        description: cleanDescription,
        campaignStartAt,
        campaignEndAt,
        votingStartAt,
        votingEndAt,
        allowLiveResults,
        announceWinnersAutomatically: announceWinners,
        isPublished,
      };
      if (image instanceof File && imageBytes) {
        updates.image = null;
        updates.imageBytes = Buffer.from(imageBytes);
        updates.imageContentType = imageContentType;
        updates.imageFilename = imageFilename;
      } else if (image === null) {
        updates.image = null;
      }

      const saved = await prisma.election.update({
        where: { id: election.id },
        data: updates,
      });
      return json(await serializeElectionDetail(saved));
    },
  },
});
