import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { campaignForMedia } from "@/src/lib/campaign-access";
import { authenticateQueryToken } from "@/src/lib/auth";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (req, params, state) => {
      const pk = Number(params.pk);
      // <img> tags cannot send headers: the staff preview token may be in the query.
      const viewer = state.user ?? (await authenticateQueryToken(req)).user;
      const campaign = await campaignForMedia(pk, viewer);
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
