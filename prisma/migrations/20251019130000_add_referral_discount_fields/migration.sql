-- Discount codes created per referral link, so a referred shopper gets their
-- 20% off automatically and the order stays attributable to one referrer.
ALTER TABLE "Referral" ADD COLUMN "discountCode" TEXT;
ALTER TABLE "Referral" ADD COLUMN "discountGid" TEXT;
ALTER TABLE "Referral" ADD COLUMN "segmentGid" TEXT;

ALTER TABLE "Affiliate" ADD COLUMN "discountCode" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "discountGid" TEXT;
