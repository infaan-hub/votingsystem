-- Vote confirmation codes: issued per (voter, election) when the voter taps
-- "Confirm your vote", delivered as a push + in-app notification, consumed
-- atomically when the ballot is submitted. Codes are hashed at rest; the
-- expiry/send/attempt limits are durable so serverless instances cannot
-- reset them between invocations.
CREATE TABLE "VoteConfirmCode" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "electionId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteConfirmCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoteConfirmCode_userId_electionId_createdAt_idx" ON "VoteConfirmCode"("userId", "electionId", "createdAt");

ALTER TABLE "VoteConfirmCode"
    ADD CONSTRAINT "VoteConfirmCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoteConfirmCode"
    ADD CONSTRAINT "VoteConfirmCode_electionId_fkey"
    FOREIGN KEY ("electionId") REFERENCES "Election"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
