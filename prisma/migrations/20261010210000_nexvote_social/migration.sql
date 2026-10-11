-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "partyId" INTEGER;

-- CreateTable
CREATE TABLE "Party" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "emblemUrl" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingCategory" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateRating" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "voterId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opinion" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "voterId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "up" INTEGER NOT NULL DEFAULT 0,
    "down" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opinion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpinionVote" (
    "id" SERIAL NOT NULL,
    "opinionId" INTEGER NOT NULL,
    "voterId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpinionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_name_key" ON "Party"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Party_slug_key" ON "Party"("slug");

-- CreateIndex
CREATE INDEX "Party_isActive_idx" ON "Party"("isActive");

-- CreateIndex
CREATE INDEX "RatingCategory_positionId_idx" ON "RatingCategory"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingCategory_positionId_name_key" ON "RatingCategory"("positionId", "name");

-- CreateIndex
CREATE INDEX "CandidateRating_candidateId_idx" ON "CandidateRating"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateRating_categoryId_idx" ON "CandidateRating"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateRating_candidateId_voterId_categoryId_key" ON "CandidateRating"("candidateId", "voterId", "categoryId");

-- CreateIndex
CREATE INDEX "Opinion_candidateId_idx" ON "Opinion"("candidateId");

-- CreateIndex
CREATE INDEX "OpinionVote_opinionId_idx" ON "OpinionVote"("opinionId");

-- CreateIndex
CREATE UNIQUE INDEX "OpinionVote_opinionId_voterId_key" ON "OpinionVote"("opinionId", "voterId");

-- CreateIndex
CREATE INDEX "Candidate_partyId_idx" ON "Candidate"("partyId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingCategory" ADD CONSTRAINT "RatingCategory_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateRating" ADD CONSTRAINT "CandidateRating_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateRating" ADD CONSTRAINT "CandidateRating_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateRating" ADD CONSTRAINT "CandidateRating_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RatingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionVote" ADD CONSTRAINT "OpinionVote_opinionId_fkey" FOREIGN KEY ("opinionId") REFERENCES "Opinion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionVote" ADD CONSTRAINT "OpinionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;