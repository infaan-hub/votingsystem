import { prisma } from "@/src/lib/db";
import { isOfficerRole, type UserWithRelations } from "@/src/lib/auth";
import { officerCanManage } from "@/src/lib/officer";
import type { Campaign, Election } from "@/src/generated/prisma/client";

export type CampaignWithElection = Campaign & { election: Election };

/** Campaign media is public only for a published campaign on a published election. */
export function campaignMediaIsPublic(
  campaign: Pick<Campaign, "status">,
  election: Pick<Election, "isPublished">,
): boolean {
  return campaign.status === "PUBLISHED" && election.isPublished;
}

/**
 * Loads a campaign and decides who may see its media bytes.
 *
 * Published campaigns on published elections are public. Everything else
 * (draft, pending, hidden, rejected, unpublished election) is limited to the
 * campaign owner and to officers/administrators in scope for the election, so
 * moderation states cannot be bypassed by guessing a media URL.
 */
export async function campaignForMedia(
  campaignId: number,
  viewer: UserWithRelations | null,
): Promise<CampaignWithElection | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { election: true },
  });
  if (!campaign) return null;
  if (campaignMediaIsPublic(campaign, campaign.election)) return campaign;
  if (!viewer) return null;
  if (campaign.ownerId !== null && campaign.ownerId === viewer.id) return campaign;
  if (isOfficerRole(viewer.role) && (await officerCanManage(campaign.election, viewer))) {
    return campaign;
  }
  return null;
}
