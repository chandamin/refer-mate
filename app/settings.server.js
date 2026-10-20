import prisma from "./db.server";

// Program rules the merchant controls from Shopify Admin (app/routes/app.settings.jsx).
// Created with defaults the first time a shop is seen, so callers can always rely on a row.
export async function getSettings(shop) {
  return prisma.programSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

const num = (value, fallback, { min = 0, max = Infinity } = {}) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Validates and saves the admin form. Percentages are clamped to 0-100 so a typo
// cannot create a discount or commission above 100%.
export async function saveSettings(shop, form) {
  const current = await getSettings(shop);
  const text = (key) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  return prisma.programSettings.update({
    where: { shop },
    data: {
      enabled: form.get("enabled") === "on",
      commissionPercent: num(form.get("commissionPercent"), current.commissionPercent, { max: 100 }),
      commissionMonths: Math.round(num(form.get("commissionMonths"), current.commissionMonths, { min: 1, max: 120 })),
      discountPercent: num(form.get("discountPercent"), current.discountPercent, { max: 100 }),
      currency: (text("currency") || current.currency).slice(0, 3),
      minPayout: num(form.get("minPayout"), current.minPayout),
      holdingDays: Math.round(num(form.get("holdingDays"), current.holdingDays, { max: 365 })),
      termsUrl: text("termsUrl"),
      faq: text("faq"),
      resources: text("resources"),
    },
  });
}
