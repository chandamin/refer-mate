-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN "email" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "name" TEXT;

-- CreateTable
CREATE TABLE "ProgramSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "commissionPercent" REAL NOT NULL DEFAULT 20,
    "commissionMonths" INTEGER NOT NULL DEFAULT 6,
    "discountPercent" REAL NOT NULL DEFAULT 20,
    "minPayout" REAL NOT NULL DEFAULT 100,
    "holdingDays" INTEGER NOT NULL DEFAULT 30,
    "termsUrl" TEXT,
    "faq" TEXT,
    "resources" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "customerEmail" TEXT,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "maturesAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversion_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bounty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reward" REAL NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReferredCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "referredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSettings_shop_key" ON "ProgramSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "AffiliateLink"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversion_orderId_key" ON "Conversion"("orderId");

-- CreateIndex
CREATE INDEX "Conversion_shop_affiliateId_idx" ON "Conversion"("shop", "affiliateId");

-- CreateIndex
CREATE INDEX "Bounty_shop_idx" ON "Bounty"("shop");

-- CreateIndex
CREATE INDEX "ReferredCustomer_affiliateId_idx" ON "ReferredCustomer"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferredCustomer_shop_email_key" ON "ReferredCustomer"("shop", "email");

