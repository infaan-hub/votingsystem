-- Drop tables that were never read or written by application code.
-- Verified before dropping: 0 rows in production for all three.
DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "EligibleVoter";
DROP TABLE IF EXISTS "Membership";

-- Hot path: the landing page lists published elections ordered by opening time.
CREATE INDEX "Election_isPublished_votingStartAt_idx" ON "Election"("isPublished", "votingStartAt");
