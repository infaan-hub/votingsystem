import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const campaign = await prisma.campaign.findUnique({ where: { id: pk } });
      if (!campaign || !campaign.imageBytes || !campaign.imageBytes.length) {
        throw notFoundModel("Campaign image");
      }
      const filename = (campaign.imageFilename || `campaign-${campaign.id}.jpg`).replace(
        /"/g,
        "",
      );
      return new Response(Buffer.from(campaign.imageBytes), {
        headers: {
          "Content-Type": campaign.imageContentType || "image/jpeg",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    },
  },
});
