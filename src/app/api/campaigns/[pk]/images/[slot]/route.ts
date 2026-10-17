import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { campaignForMedia } from "@/src/lib/campaign-access";
import { authenticateQueryToken } from "@/src/lib/auth";

export const GET = makeRoute({
  intParams: ["pk", "slot"],
  handlers: {
    GET: async (req, params, state) => {
      // <img> tags cannot send headers: the staff preview token may be in the query.
      const viewer = state.user ?? (await authenticateQueryToken(req)).user;
      const campaign = await campaignForMedia(Number(params.pk), viewer);
      if (!campaign) throw notFoundModel("Campaign image");
      const image = await prisma.campaignImage.findUnique({
        where: {
          campaignId_slot: {
            campaignId: campaign.id,
            slot: Number(params.slot),
          },
        },
      });
      if (!image || !image.imageBytes.length) {
        throw notFoundModel("Campaign image");
      }
      const filename = (image.imageFilename || `campaign-${image.campaignId}-${image.slot}.jpg`).replace(
        /"/g,
        "",
      );
      return new Response(Buffer.from(image.imageBytes), {
        headers: {
          "Content-Type": image.imageContentType || "image/jpeg",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    },
  },
});
