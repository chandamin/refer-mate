-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN "payoutMethod" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "payoutDetails" TEXT;

-- AlterTable
ALTER TABLE "ProgramSettings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT '£';

-- AlterTable
ALTER TABLE "Conversion" ADD COLUMN "payoutId" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "Payout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Payout_shop_status_idx" ON "Payout"("shop", "status");
CREATE INDEX "Payout_affiliateId_idx" ON "Payout"("affiliateId");
