-- Remove the election-request review feature end to end: the admin review
-- page, the admin API routes, the dashboard/nav entries, and the model
-- itself. The approval flow's approvedRequestId marker on Election goes
-- with it.
DROP TABLE IF EXISTS "ElectionRequest";

ALTER TABLE "Election" DROP COLUMN IF EXISTS "approvedRequestId";
