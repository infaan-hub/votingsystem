-- Keep the push-delivery audit trail when a device subscription is deleted
-- (provider reports the endpoint expired/410, or the user unsubscribes).
-- A CASCADE delete previously destroyed the very row that recorded the
-- terminal delivery state.
ALTER TABLE "PushDelivery" DROP CONSTRAINT "PushDelivery_subscriptionId_fkey";
ALTER TABLE "PushDelivery" ALTER COLUMN "subscriptionId" DROP NOT NULL;
ALTER TABLE "PushDelivery"
  ADD CONSTRAINT "PushDelivery_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
