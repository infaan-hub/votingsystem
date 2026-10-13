-- Profile pictures for every account, stored as bytes like Candidate.photo.
ALTER TABLE "User" ADD COLUMN "photo" TEXT,
ADD COLUMN "photoBytes" BYTEA,
ADD COLUMN "photoContentType" TEXT NOT NULL DEFAULT '',
ADD COLUMN "photoFilename" TEXT NOT NULL DEFAULT '';
