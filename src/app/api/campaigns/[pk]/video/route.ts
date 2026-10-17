import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { serveVideoBuffer } from "@/src/lib/media";
import { campaignForMedia } from "@/src/lib/campaign-access";
import { authenticateQueryToken } from "@/src/lib/auth";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (req, params, state) => {
      const pk = Number(params.pk);
      // Staff previews of unpublished campaigns arrive from <video> tags, so
      // the token may travel in the query instead of the Authorization header.
      const viewer = state.user ?? (await authenticateQueryToken(req)).user;
      const campaign = await campaignForMedia(pk, viewer);
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
