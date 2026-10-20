-- Referral and Affiliate were only ever pushed ad-hoc, so they had no migration:
-- a fresh `prisma migrate deploy` created neither, and Affiliate was missing
-- entirely (Prisma P2021 at runtime). IF NOT EXISTS keeps this idempotent for
-- databases where Referral was already pushed by hand.

CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "payoutConnected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "upcoming" REAL NOT NULL DEFAULT 0,
    "paid" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Referral_shop_key" ON "Referral"("shop");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_code_key" ON "Referral"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_code_key" ON "Affiliate"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Affiliate_shop_customerId_key" ON "Affiliate"("shop", "customerId");
