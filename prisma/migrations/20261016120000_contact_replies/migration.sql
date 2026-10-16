-- Administrator replies on contact messages: the reply text is stored on the
-- message so the support inbox keeps a record of what was sent, and the
-- sender (when the message came from a signed-in account) receives it as an
-- in-app notification + push.
ALTER TABLE "ContactMessage" ADD COLUMN "reply" TEXT;
ALTER TABLE "ContactMessage" ADD COLUMN "repliedAt" TIMESTAMP(3);
ALTER TABLE "ContactMessage" ADD COLUMN "repliedById" INTEGER;

ALTER TABLE "ContactMessage"
    ADD CONSTRAINT "ContactMessage_repliedById_fkey"
    FOREIGN KEY ("repliedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
