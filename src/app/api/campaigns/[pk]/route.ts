import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { officerCanManage } from "@/src/lib/officer";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const pk = Number(params.pk);
      const campaign = await prisma.campaign.findUnique({
        where: { id: pk },
        include: CAMPAIGN_INCLUDE,
      });
      if (!campaign) throw notFoundModel("Campaign");
      if (campaign.status === "PUBLISHED") {
        return json(serializeCampaign(campaign));
      }
      const user = state.user;
      const privileged =
        !!user &&
        (user.role === "admin" ||
          campaign.ownerId === user.id ||
          (await officerCanManage(campaign.election, user)));
      if (!privileged) throw notFoundModel("Campaign");
      return json(serializeCampaign(campaign, { moderation: true }));
    },
  },
});
