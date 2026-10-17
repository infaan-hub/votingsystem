import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { GET as campaignImageGET } from "@/src/app/api/campaigns/[pk]/image/route";
import { GET as campaignSlotImageGET } from "@/src/app/api/campaigns/[pk]/images/[slot]/route";
import { GET as campaignVideoGET } from "@/src/app/api/campaigns/[pk]/video/route";

const DAY = 24 * 60 * 60 * 1000;

const GIF_BYTES = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const EXTERNAL_VIDEO_URL = "https://cdn.example.org/campaign.mp4";

async function seedCampaign(options: { campaignStatus: string; electionPublished: boolean }) {
  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: "Media Access Election",
      slug: "media-access-election",
      description: "Campaign media access checks.",
      isPublished: options.electionPublished,
      campaignStartAt: new Date(now - DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now - DAY),
      votingEndAt: new Date(now + DAY),
    },
  });
  const position = await prisma.position.create({
    data: { electionId: election.id, name: "President", voterGroup: "student" },
  });
  const owner = await prisma.user.create({
    data: {
      username: "media_officer",
      password: hashPassword("Pass1234!"),
      firstName: "Media",
      lastName: "Officer",
      role: "officer",
    },
  });
  const candidateUser = await prisma.user.create({
    data: {
      username: "media_candidate",
      password: hashPassword("Pass1234!"),
      firstName: "Media",
      lastName: "Candidate",
      role: "voter",
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position.id,
      approved: true,
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      electionId: election.id,
      candidateId: candidate.id,
      ownerId: owner.id,
      topic: "Media access",
      status: options.campaignStatus,
      imageBytes: Buffer.from(GIF_BYTES),
      imageContentType: "image/gif",
      imageFilename: "cover.gif",
      videoUrl: EXTERNAL_VIDEO_URL,
    },
  });
  await prisma.campaignImage.create({
    data: {
      campaignId: campaign.id,
      slot: 1,
      imageBytes: Buffer.from(GIF_BYTES),
      imageContentType: "image/gif",
      imageFilename: "extra.gif",
    },
  });
  const ownerToken = await createTokenFor(owner.id);

  return { campaign, owner, ownerToken };
}

describe("campaign media access", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("serves published campaign media on a published election anonymously", async () => {
    const { campaign } = await seedCampaign({
      campaignStatus: "PUBLISHED",
      electionPublished: true,
    });

    const image = await call(
      campaignImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/image/`),
      { pk: String(campaign.id) },
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/gif");

    const slot = await call(
      campaignSlotImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/images/1/`),
      { pk: String(campaign.id), slot: "1" },
    );
    expect(slot.status).toBe(200);

    // Legacy external video URLs redirect for real instead of answering a
    // bodiless JSON body with status 302.
    const video = await call(
      campaignVideoGET,
      jsonRequest(`/api/campaigns/${campaign.id}/video/`),
      { pk: String(campaign.id) },
    );
    expect(video.status).toBe(302);
    expect(video.headers.get("Location")).toBe(EXTERNAL_VIDEO_URL);
  });

  it("hides draft campaign media from anonymous requests", async () => {
    const { campaign } = await seedCampaign({
      campaignStatus: "DRAFT",
      electionPublished: true,
    });

    const image = await call(
      campaignImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/image/`),
      { pk: String(campaign.id) },
    );
    expect(image.status).toBe(404);

    const slot = await call(
      campaignSlotImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/images/1/`),
      { pk: String(campaign.id), slot: "1" },
    );
    expect(slot.status).toBe(404);
  });

  it("hides published campaign media while its election is unpublished", async () => {
    const { campaign } = await seedCampaign({
      campaignStatus: "PUBLISHED",
      electionPublished: false,
    });

    const image = await call(
      campaignImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/image/`),
      { pk: String(campaign.id) },
    );
    expect(image.status).toBe(404);
  });

  it("lets the owner preview unpublished media via header or query token", async () => {
    const { campaign, ownerToken } = await seedCampaign({
      campaignStatus: "DRAFT",
      electionPublished: false,
    });

    const header = await call(
      campaignImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/image/`, { token: ownerToken }),
      { pk: String(campaign.id) },
    );
    expect(header.status).toBe(200);

    const query = await call(
      campaignSlotImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/images/1/?token=${ownerToken}`),
      { pk: String(campaign.id), slot: "1" },
    );
    expect(query.status).toBe(200);

    const bogus = await call(
      campaignImageGET,
      jsonRequest(`/api/campaigns/${campaign.id}/image/?token=not-a-real-token`),
      { pk: String(campaign.id) },
    );
    expect(bogus.status).toBe(404);
  });
});
