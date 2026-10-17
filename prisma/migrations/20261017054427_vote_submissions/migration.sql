/*
  Warnings:

  - You are about to drop the column `idempotencyKey` on the `Vote` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Vote_idempotencyKey_key";

-- DropIndex
DROP INDEX "Vote_voterId_electionId_positionId_key";

-- AlterTable
ALTER TABLE "Vote" DROP COLUMN "idempotencyKey",
ADD COLUMN     "submissionId" INTEGER;

-- CreateTable
CREATE TABLE "VoteSubmission" (
    "id" SERIAL NOT NULL,
    "voterId" INTEGER NOT NULL,
    "electionId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "selectionsHash" TEXT NOT NULL DEFAULT '',
    "receiptCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoteSubmission_voterId_electionId_idempotencyKey_idx" ON "VoteSubmission"("voterId", "electionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VoteSubmission_electionId_idx" ON "VoteSubmission"("electionId");

-- CreateIndex
CREATE INDEX "VoteSubmission_voterId_idx" ON "VoteSubmission"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteSubmission_voterId_electionId_positionId_key" ON "VoteSubmission"("voterId", "electionId", "positionId");

-- CreateIndex
CREATE INDEX "Vote_voterId_electionId_positionId_idx" ON "Vote"("voterId", "electionId", "positionId");

-- CreateIndex
CREATE INDEX "Vote_submissionId_idx" ON "Vote"("submissionId");

-- AddForeignKey
ALTER TABLE "VoteSubmission" ADD CONSTRAINT "VoteSubmission_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSubmission" ADD CONSTRAINT "VoteSubmission_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSubmission" ADD CONSTRAINT "VoteSubmission_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "VoteSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
