-- AlterTable
ALTER TABLE "Vote" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "receiptCode" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "Vote_idempotencyKey_key" ON "Vote"("idempotencyKey");