import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { CAMPAIGN_INCLUDE, serializeCampaign } from "@/src/app/api/campaigns/route";

export const CAMPAIGN_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "HIDDEN", "REJECTED"] as const;

export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const electionIdParam = url.searchParams.get("election_id")?.trim();
      const statusParam = url.searchParams.get("status")?.trim();
      const electionId =
        electionIdParam && /^\d+$/.test(electionIdParam)
          ? Number(electionIdParam)
          : undefined;
      if (statusParam && !(CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)) {
        throw fieldErrors({ status: `"${statusParam}" is not a valid choice.` });
      }

      const campaigns = await prisma.campaign.findMany({
        where: {
          ...(electionId !== undefined ? { electionId } : {}),
          ...(statusParam ? { status: statusParam } : {}),
        },
        include: CAMPAIGN_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return json(campaigns.map((campaign) => serializeCampaign(campaign, { admin: true })));
    },
  },
});
