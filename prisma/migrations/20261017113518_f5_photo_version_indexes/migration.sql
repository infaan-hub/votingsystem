-- AlterTable
ALTER TABLE "User" ADD COLUMN "photoVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Notification_recipientId_id_idx" ON "Notification"("recipientId", "id");

-- CreateIndex
CREATE INDEX "Election_status_isPublished_votingEndAt_idx" ON "Election"("status", "isPublished", "votingEndAt");