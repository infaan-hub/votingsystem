import { json, makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { Collector, fileField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import {
  validateCandidate,
  ValidationError,
  validationErrorBody,
} from "@/src/lib/validation";
import { serializeCandidate } from "@/src/lib/serializers";
import type {
  Candidate,
  Department,
  Section,
  User,
} from "@/src/generated/prisma/client";

const CANDIDATE_INCLUDE = {
  user: { include: { department: true, section: { include: { department: true } } } },
  department: true,
  section: { include: { department: true } },
  party: true,
} as const;

type CandidateRow = Candidate & {
  user: User & {
    department: Department | null;
    section: (Section & { department: Department | null }) | null;
  };
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
  party: { id: number; name: string; code: string; color: string } | null;
};

export const PATCH = makeRoute({
  permission: "authenticated",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params, state) => {
      const user = requireStateUser(state);
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");
      const candidate = (await prisma.candidate.findFirst({
        where: { electionId: election.id, userId: user.id },
        include: CANDIDATE_INCLUDE,
      })) as CandidateRow | null;
      if (!candidate) throw notFoundModel("Candidate");

      const payload = await readPayload(req);
      const c = new Collector();
      const slogan = Object.prototype.hasOwnProperty.call(payload, "slogan")
        ? strField(c, payload, "slogan", { required: false, allowBlank: true })
        : undefined;
      const manifesto = Object.prototype.hasOwnProperty.call(payload, "manifesto")
        ? strField(c, payload, "manifesto", { required: false, allowBlank: true })
        : undefined;
      const campaignVideo = Object.prototype.hasOwnProperty.call(payload, "campaign_video")
        ? fileField(c, payload, "campaign_video", { required: false, allowNull: true })
        : undefined;

      let videoBytes: Uint8Array | null = null;
      let videoContentType = "";
      let videoFilename = "";
      if (campaignVideo instanceof File && campaignVideo.size > 0) {
        const contentType = campaignVideo.type || "";
        const name = campaignVideo.name || "";
        if (contentType !== "video/mp4" && !name.toLowerCase().endsWith(".mp4")) {
          c.field("campaign_video", "Campaign video must be an MP4 file.");
        } else {
          videoBytes = new Uint8Array(await campaignVideo.arrayBuffer());
          videoContentType = contentType;
          videoFilename = name;
        }
      }
      c.throwIfAny();

      const updates: Record<string, unknown> = {};
      if (slogan !== undefined) updates.slogan = slogan;
      if (manifesto !== undefined) updates.manifesto = manifesto;
      if (campaignVideo !== undefined) {
        if (campaignVideo instanceof File) {
          updates.campaignVideoBytes = videoBytes ? Buffer.from(videoBytes) : null;
          updates.campaignVideoContentType = videoContentType;
          updates.campaignVideoFilename = videoFilename;
        }
        updates.campaignVideo = null;
        updates.campaignVideoUrl = "";
      }

      const position = await prisma.position.findUnique({
        where: { id: candidate.positionId },
      });
      if (!position) throw notFoundModel("Position");

      const merged = { ...candidate, ...updates };
      try {
        validateCandidate({
          electionId: merged.electionId,
          positionElectionId: position.electionId,
          departmentId: merged.departmentId,
          sectionId: merged.sectionId,
          sectionDepartmentId: candidate.section?.departmentId ?? null,
          userDepartmentId: user.departmentId,
          userSectionId: user.sectionId,
          positionDepartmentId: position.departmentId,
          positionSectionId: position.sectionId,
          slogan: merged.slogan,
          manifesto: merged.manifesto,
          campaignVideoUrl: merged.campaignVideoUrl,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ApiError(400, validationErrorBody(error));
        }
        throw error;
      }

      const updated = (await prisma.candidate.update({
        where: { id: candidate.id },
        data: updates,
        include: CANDIDATE_INCLUDE,
      })) as CandidateRow;
      return json(serializeCandidate(updated));
    },
  },
});
