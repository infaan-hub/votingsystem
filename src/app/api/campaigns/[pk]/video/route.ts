import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { serveVideoBuffer } from "@/src/lib/media";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (req, params) => {
      const pk = Number(params.pk);
      const campaign = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!campaign) throw notFoundModel("Campaign");
      if (campaign.videoBytes && campaign.videoBytes.length) {
        return serveVideoBuffer(
          campaign.videoBytes,
          campaign.videoContentType || "video/mp4",
          campaign.videoFilename || `campaign-${campaign.id}.mp4`,
          req,
        );
      }
      if (campaign.videoUrl) {
        return new Response(null, {
          status: 302,
          headers: { Location: campaign.videoUrl },
        });
      }
      throw notFoundModel("Campaign video");
    },
  },
});
