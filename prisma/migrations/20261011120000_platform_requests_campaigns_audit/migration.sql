-- AlterTable
ALTER TABLE "Election" ADD COLUMN     "approvedRequestId" INTEGER,
ADD COLUMN     "capacityMode" TEXT NOT NULL DEFAULT 'restricted',
ADD COLUMN     "maxVoters" INTEGER,
ADD COLUMN     "nominationEndAt" TIMESTAMP(3),
ADD COLUMN     "nominationStartAt" TIMESTAMP(3),
ADD COLUMN     "resultFinalizedAt" TIMESTAMP(3),
ADD COLUMN     "resultPublishedAt" TIMESTAMP(3),
ADD COLUMN     "rulesText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "shareTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "voterIdLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "voterIdMethod" TEXT NOT NULL DEFAULT 'account';

-- CreateTable
CREATE TABLE "CandidateImage" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "imageBytes" BYTEA NOT NULL,
    "imageContentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "imageFilename" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionRequest" (
    "id" SERIAL NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL DEFAULT '',
    "categoryId" INTEGER,
    "organization" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "expectedVoters" INTEGER NOT NULL DEFAULT 0,
    "electionType" TEXT NOT NULL DEFAULT 'public',
    "voterIdMethod" TEXT NOT NULL DEFAULT 'account',
    "positionsText" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "contactInfo" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "decidedBy" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "assignedOfficerId" INTEGER,
    "electionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerAssignment" (
    "id" SERIAL NOT NULL,
    "officerId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "electionId" INTEGER,
    "organizationId" INTEGER,
    "assignedBy" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionVoter" (
    "id" SERIAL NOT NULL,
    "electionId" INTEGER NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "userId" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVoter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "electionId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "topic" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageBytes" BYTEA,
    "imageContentType" TEXT NOT NULL DEFAULT '',
    "imageFilename" TEXT NOT NULL DEFAULT '',
    "videoBytes" BYTEA,
    "videoContentType" TEXT NOT NULL DEFAULT '',
    "videoFilename" TEXT NOT NULL DEFAULT '',
    "videoDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "moderationNote" TEXT NOT NULL DEFAULT '',
    "moderatedBy" INTEGER,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignImage" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "imageBytes" BYTEA NOT NULL,
    "imageContentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "imageFilename" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateImage_candidateId_idx" ON "CandidateImage"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateImage_candidateId_slot_key" ON "CandidateImage"("candidateId", "slot");

-- CreateIndex
CREATE INDEX "ElectionRequest_status_idx" ON "ElectionRequest"("status");

-- CreateIndex
CREATE INDEX "ElectionRequest_requesterId_idx" ON "ElectionRequest"("requesterId");

-- CreateIndex
CREATE INDEX "ElectionRequest_createdAt_idx" ON "ElectionRequest"("createdAt");

-- CreateIndex
CREATE INDEX "OfficerAssignment_officerId_idx" ON "OfficerAssignment"("officerId");

-- CreateIndex
CREATE INDEX "OfficerAssignment_electionId_idx" ON "OfficerAssignment"("electionId");

-- CreateIndex
CREATE INDEX "ElectionVoter_electionId_idx" ON "ElectionVoter"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVoter_electionId_uniqueKey_key" ON "ElectionVoter"("electionId", "uniqueKey");

-- CreateIndex
CREATE INDEX "Campaign_electionId_idx" ON "Campaign"("electionId");

-- CreateIndex
CREATE INDEX "Campaign_candidateId_idx" ON "Campaign"("candidateId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "CampaignImage_campaignId_idx" ON "CampaignImage"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignImage_campaignId_slot_key" ON "CampaignImage"("campaignId", "slot");

-- CreateIndex
CREATE INDEX "ContactMessage_status_idx" ON "ContactMessage"("status");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Election_shareToken_key" ON "Election"("shareToken");

-- CreateIndex
CREATE INDEX "Vote_voterId_electionId_idx" ON "Vote"("voterId", "electionId");

-- AddForeignKey
ALTER TABLE "CandidateImage" ADD CONSTRAINT "CandidateImage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionRequest" ADD CONSTRAINT "ElectionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionRequest" ADD CONSTRAINT "ElectionRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ElectionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerAssignment" ADD CONSTRAINT "OfficerAssignment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerAssignment" ADD CONSTRAINT "OfficerAssignment_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerAssignment" ADD CONSTRAINT "OfficerAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVoter" ADD CONSTRAINT "ElectionVoter_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImage" ADD CONSTRAINT "CampaignImage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
