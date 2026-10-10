import { makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const candidate = await prisma.candidate.findFirst({
        where: { id: pk, approved: true, election: { isPublished: true } },
      });
      if (!candidate) throw notFoundModel("Candidate");
      if (candidate.campaignVideoBytes && candidate.campaignVideoBytes.length) {
        return new Response(Buffer.from(candidate.campaignVideoBytes), {
          headers: {
            "Content-Type": candidate.campaignVideoContentType || "video/mp4",
            "Accept-Ranges": "bytes",
          },
        });
      }
      if (candidate.campaignVideo) {
        throw new ApiError(302, {
          detail: "Campaign video is stored outside database media.",
        });
      }
      throw new ApiError(404, { detail: "Not found." });
    },
  },
});
