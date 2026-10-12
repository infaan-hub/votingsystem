import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { displayName } from "@/src/lib/serializers";
import { formatDateTime } from "@/src/lib/time";
import type { Prisma } from "@/src/generated/prisma/client";

export const CAMPAIGN_INCLUDE = {
  candidate: { include: { user: true, party: true } },
  election: true,
  owner: true,
  images: { orderBy: { slot: "asc" } },
} as const;

export type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

export function serializeCampaign(
  campaign: CampaignRow,
  options: { moderation?: boolean; admin?: boolean } = {},
) {
  const base = {
    id: campaign.id,
    topic: campaign.topic,
    description: campaign.description,
    status: campaign.status,
    start_at: formatDateTime(campaign.startAt),
    end_at: formatDateTime(campaign.endAt),
    image_url:
      campaign.imageBytes && campaign.imageBytes.length
        ? `/api/campaigns/${campaign.id}/image`
        : null,
    image_urls: [
      ...(campaign.imageBytes && campaign.imageBytes.length
        ? [`/api/campaigns/${campaign.id}/image`]
        : []),
      ...campaign.images.map((extra) => `/api/campaigns/${campaign.id}/images/${extra.slot}`),
    ],
    video_url:
      campaign.videoBytes && campaign.videoBytes.length
        ? `/api/campaigns/${campaign.id}/video`
        : campaign.videoUrl || null,
    video_duration_seconds: campaign.videoDurationSeconds,
    election: {
      id: campaign.election.id,
      slug: campaign.election.slug,
      title: campaign.election.title,
      status: campaign.election.status,
    },
    candidate: {
      id: campaign.candidate.id,
      slogan: campaign.candidate.slogan,
      photo_url:
        campaign.candidate.photoBytes && campaign.candidate.photoBytes.length
          ? `/api/candidates/${campaign.candidate.id}/photo`
          : null,
      party: campaign.candidate.party
        ? {
            id: campaign.candidate.party.id,
            name: campaign.candidate.party.name,
            slug: campaign.candidate.party.slug,
            color: campaign.candidate.party.color,
            code: campaign.candidate.party.code,
          }
        : null,
      user: {
        username: campaign.candidate.user.username,
        full_name: displayName(campaign.candidate.user),
      },
    },
  };

  if (options.admin) {
    return {
      ...base,
      moderation_note: campaign.moderationNote,
      moderated_at: formatDateTime(campaign.moderatedAt),
      owner: campaign.owner
        ? {
            id: campaign.owner.id,
            username: campaign.owner.username,
            full_name: displayName(campaign.owner),
          }
        : null,
    };
  }
  if (options.moderation) {
    return { ...base, moderation_note: campaign.moderationNote };
  }
  return base;
}

export const GET = makeRoute({
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const electionIdParam = url.searchParams.get("election_id")?.trim();
      const q = url.searchParams.get("q")?.trim() || undefined;
      const limitParam = Number(url.searchParams.get("limit") ?? 60);
      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(Math.trunc(limitParam), 1), 200)
        : 60;
      const electionId =
        electionIdParam && /^\d+$/.test(electionIdParam)
          ? Number(electionIdParam)
          : undefined;

      const campaigns = await prisma.campaign.findMany({
        where: {
          status: "PUBLISHED",
          ...(electionId !== undefined ? { electionId } : {}),
          ...(q
            ? {
                OR: [
                  { topic: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        include: CAMPAIGN_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return json(campaigns.map((campaign) => serializeCampaign(campaign)));
    },
  },
});
