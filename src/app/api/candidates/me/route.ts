import { json, makeRoute } from "@/src/lib/api";
import { forbidden, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { Collector, strField, fileField, validateImageFile } from "@/src/lib/fields";
import { MAX_IMAGE_BYTES } from "@/src/lib/media";
import { readPayload } from "@/src/lib/request";

export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, _params, state) => {
      const user = requireStateUser(state);
      if (user.role !== "candidate") throw forbidden("Candidate access is required.");
      const candidate = await prisma.candidate.findFirst({
        where: { userId: user.id },
        include: {
          position: { select: { id: true, name: true } },
          election: {
            select: {
              id: true,
              slug: true,
              title: true,
              status: true,
              resultPublishedAt: true,
            },
          },
        },
      });
      if (!candidate) throw notFoundModel("Candidate");

      let voteTotal: number | null = null;
      if (candidate.election.resultPublishedAt) {
        voteTotal = await prisma.vote.count({ where: { candidateId: candidate.id } });
      }

      return json({
        id: candidate.id,
        manifesto: candidate.manifesto,
        slogan: candidate.slogan,
        has_photo: Boolean(candidate.photoBytes?.length),
        has_video: Boolean(candidate.campaignVideoBytes?.length),
        position: candidate.position,
        election: candidate.election,
        result_published: candidate.election.resultPublishedAt !== null,
        vote_total: voteTotal,
      });
    },
  },
});

export const PATCH = makeRoute({
  permission: "authenticated",
  handlers: {
    PATCH: async (req, _params, state) => {
      const user = requireStateUser(state);
      if (user.role !== "candidate") throw forbidden("Candidate access is required.");
      const candidate = await prisma.candidate.findFirst({ where: { userId: user.id } });
      if (!candidate) throw notFoundModel("Candidate");

      const payload = await readPayload(req);
      const c = new Collector();
      const manifesto = strField(c, payload, "manifesto", { required: false, allowBlank: true, maxLength: 4000 });
      const slogan = strField(c, payload, "slogan", { required: false, allowBlank: true, maxLength: 200 });
      const photo = fileField(c, payload, "photo", { required: false, allowNull: true });
      const video = fileField(c, payload, "video", { required: false, allowNull: true });
      c.throwIfAny();

      const data: Record<string, unknown> = {};
      if (manifesto !== undefined) data.manifesto = manifesto.trim();
      if (slogan !== undefined) data.slogan = slogan.trim();

      if (photo instanceof File) {
        const bytes = await validateImageFile(c, "photo", photo);
        if (bytes) {
          if (bytes.length > MAX_IMAGE_BYTES) {
            c.field("photo", "Image is too large. The limit is 5 MB.");
          } else {
            data.photoBytes = Buffer.from(bytes);
            data.photoContentType = photo.type || "image/jpeg";
            data.photoFilename = photo.name || "";
          }
        }
      } else if (photo === null) {
        data.photoBytes = null;
        data.photoContentType = "";
        data.photoFilename = "";
      }

      if (video instanceof File) {
        const bytes = new Uint8Array(await video.arrayBuffer());
        data.campaignVideoBytes = Buffer.from(bytes);
        data.campaignVideoContentType = video.type || "video/mp4";
        data.campaignVideoFilename = video.name || "";
      } else if (video === null) {
        data.campaignVideoBytes = null;
        data.campaignVideoContentType = "";
        data.campaignVideoFilename = "";
      }

      c.throwIfAny();
      const updated = await prisma.candidate.update({
        where: { id: candidate.id },
        data,
      });

      return json({
        id: updated.id,
        manifesto: updated.manifesto,
        slogan: updated.slogan,
        has_photo: Boolean(updated.photoBytes?.length),
        has_video: Boolean(updated.campaignVideoBytes?.length),
      });
    },
  },
});