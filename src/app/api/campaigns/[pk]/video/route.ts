import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const campaign = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!campaign) throw notFoundModel("Campaign");
      if (campaign.videoBytes && campaign.videoBytes.length) {
        const filename = (campaign.videoFilename || `campaign-${campaign.id}.mp4`).replace(
          /"/g,
          "",
        );
        return new Response(Buffer.from(campaign.videoBytes), {
          headers: {
            "Content-Type": campaign.videoContentType || "video/mp4",
            "Content-Disposition": `inline; filename="${filename}"`,
          },
        });
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
