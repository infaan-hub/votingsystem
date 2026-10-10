-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Election" ADD COLUMN     "allowAdminsToVote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "eligibilityPolicy" TEXT NOT NULL DEFAULT 'registered',
ADD COLUMN     "instructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "organizationId" INTEGER,
ADD COLUMN     "registrationEndAt" TIMESTAMP(3),
ADD COLUMN     "registrationStartAt" TIMESTAMP(3),
ADD COLUMN     "resultVisibility" TEXT NOT NULL DEFAULT 'live',
ADD COLUMN     "secretBallot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "allowWriteIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ballotType" TEXT NOT NULL DEFAULT 'candidate',
ADD COLUMN     "maxSelections" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vote" DROP COLUMN "updatedAt",
ADD COLUMN     "ballotOptionId" INTEGER,
ADD COLUMN     "writeInText" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "candidateId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ElectionCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "orgType" TEXT NOT NULL DEFAULT 'association',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "memberRole" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibleVoter" (
    "id" SERIAL NOT NULL,
    "electionId" INTEGER NOT NULL,
    "userId" INTEGER,
    "identifier" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "addedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibleVoter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BallotOption" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BallotOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectionCategory_name_key" ON "ElectionCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionCategory_slug_key" ON "ElectionCategory"("slug");

-- CreateIndex
CREATE INDEX "ElectionCategory_isActive_idx" ON "ElectionCategory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "EligibleVoter_electionId_status_idx" ON "EligibleVoter"("electionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EligibleVoter_electionId_userId_key" ON "EligibleVoter"("electionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EligibleVoter_electionId_identifier_key" ON "EligibleVoter"("electionId", "identifier");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BallotOption_positionId_idx" ON "BallotOption"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "BallotOption_positionId_label_key" ON "BallotOption"("positionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Election_slug_key" ON "Election"("slug");

-- CreateIndex
CREATE INDEX "Election_categoryId_idx" ON "Election"("categoryId");

-- CreateIndex
CREATE INDEX "Election_organizationId_idx" ON "Election"("organizationId");

-- CreateIndex
CREATE INDEX "Election_status_idx" ON "Election"("status");

-- CreateIndex
CREATE INDEX "Vote_positionId_idx" ON "Vote"("positionId");

-- CreateIndex
CREATE INDEX "Vote_ballotOptionId_idx" ON "Vote"("ballotOptionId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionCategory" ADD CONSTRAINT "ElectionCategory_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibleVoter" ADD CONSTRAINT "EligibleVoter_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibleVoter" ADD CONSTRAINT "EligibleVoter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ElectionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BallotOption" ADD CONSTRAINT "BallotOption_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_ballotOptionId_fkey" FOREIGN KEY ("ballotOptionId") REFERENCES "BallotOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill (safe, idempotent). Production has 0 votes; existing rows are
-- preserved. New required fields are populated rather than left at defaults.
-- ---------------------------------------------------------------------------

INSERT INTO "ElectionCategory" (name, slug, description, icon, "isActive", "isSystem", "createdAt", "updatedAt")
SELECT v.name, v.slug, v.description, v.icon, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('General',       'general',       'General-purpose elections and polls.',              'vote',          true),
  ('Education',     'education',     'University and school elections.',                  'graduation-cap',true),
  ('Corporate',     'corporate',     'Corporate and employee representative elections.',  'building-2',    true),
  ('Association',   'association',   'Association and membership elections.',             'users',         true),
  ('Community',     'community',     'Community and neighborhood elections.',             'map-pin',       true),
  ('Club',          'club',          'Club and society elections.',                       'star',          true),
  ('Board Election','board-election','Board of directors elections.',                     'briefcase',     true),
  ('Membership',    'membership',    'Membership referendums and internal votes.',        'user-check',    true),
  ('Public Poll',   'public-poll',   'Public opinion and internal organizational polls.', 'bar-chart-3',   true)
) AS v(name, slug, description, icon, "isActive")
WHERE NOT EXISTS (SELECT 1 FROM "ElectionCategory" c WHERE c.slug = v.slug);

UPDATE "Election"
SET slug = COALESCE(
  NULLIF(LOWER(TRIM(BOTH '-' FROM REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
  'election-' || id
)
WHERE slug = '' OR slug IS NULL;

UPDATE "Election" e
SET slug = e.slug || '-' || e.id
WHERE EXISTS (SELECT 1 FROM "Election" e2 WHERE e2.slug = e.slug AND e2.id <> e.id);

UPDATE "Election"
SET status = CASE
  WHEN "votingEndAt" < NOW() THEN 'CLOSED'
  WHEN "votingStartAt" <= NOW() AND NOW() <= "votingEndAt" THEN 'OPEN'
  WHEN "isPublished" THEN 'PUBLISHED'
  ELSE 'DRAFT'
END
WHERE status = '' OR status = 'DRAFT';

UPDATE "Election" e
SET "categoryId" = (SELECT id FROM "ElectionCategory" WHERE slug = 'general')
WHERE e."categoryId" IS NULL;
