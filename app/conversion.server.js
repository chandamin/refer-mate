import prisma from "./db.server";
import { getSettings } from "./settings.server";

// Turns Shopify order/checkout webhooks into leads and commissions.
//
// Attribution has two sources:
//   1. The referral discount code on the order. Only a referred shopper's FIRST
//      order carries it, and it identifies the referrer exactly.
//   2. The shopper's email, remembered in ReferredCustomer the first time they
//      order with a code. Their later orders keep earning for the referrer until
//      commissionMonths have passed — "20% per sale for 6 months".

const DAY = 24 * 60 * 60 * 1000;
const money = (v) => Math.round(Number(v || 0) * 100) / 100;

const emailOf = (order) =>
  String(order.email || order.contact_email || order.customer?.email || "").trim().toLowerCase() || null;

const codesOf = (payload) =>
  (payload.discount_codes || []).map((d) => String(d.code || "").toUpperCase()).filter(Boolean);

// Which referrer owns one of these discount codes? Covers both the merchant's own
// link (Referral, which earns no commission) and customers' links (Affiliate).
async function ownerOfCode(shop, codes) {
  if (!codes.length) return null;
  const affiliate = await prisma.affiliate.findFirst({ where: { shop, discountCode: { in: codes } } });
  return affiliate ? { kind: "affiliate", affiliate } : null;
}

// A checkout started with a referral code = a lead.
export async function recordLead(shop, checkout) {
  const settings = await getSettings(shop);
  if (!settings.enabled) return { ignored: "program disabled" };

  const owner = await ownerOfCode(shop, codesOf(checkout));
  if (!owner) return { ignored: "no referral code" };

  await prisma.affiliate.update({ where: { id: owner.affiliate.id }, data: { leads: { increment: 1 } } });
  return { lead: owner.affiliate.id };
}

// A paid order = a conversion, and the commission for it.
export async function recordOrder(shop, order) {
  const orderId = String(order.id);

  // Shopify retries webhooks, so the same order can arrive more than once.
  if (await prisma.conversion.findUnique({ where: { orderId } })) return { ignored: "already recorded" };

  const settings = await getSettings(shop);
  if (!settings.enabled) return { ignored: "program disabled" };

  const email = emailOf(order);
  let affiliate = (await ownerOfCode(shop, codesOf(order)))?.affiliate ?? null;
  let firstReferral = Boolean(affiliate);

  // No code on this order: is the buyer someone we referred recently?
  if (!affiliate && email) {
    const known = await prisma.referredCustomer.findUnique({ where: { shop_email: { shop, email } } });
    if (known) {
      const expires = new Date(known.referredAt);
      expires.setMonth(expires.getMonth() + settings.commissionMonths);
      if (expires > new Date()) affiliate = await prisma.affiliate.findUnique({ where: { id: known.affiliateId } });
    }
  }
  if (!affiliate) return { ignored: "not a referred order" };

  // Nobody earns commission on their own purchases.
  if (email && affiliate.email && email === affiliate.email.toLowerCase()) {
    return { ignored: "self-referral" };
  }

  // Commission is on the merchandise total after discounts, before shipping and tax.
  const subtotal = money(order.subtotal_price ?? order.current_subtotal_price);
  const commission = money((subtotal * settings.commissionPercent) / 100);
  // No holding period: commission is payable straight away.
  const maturesAt = new Date();

  await prisma.$transaction([
    prisma.conversion.create({
      data: {
        shop,
        affiliateId: affiliate.id,
        orderId,
        orderName: order.name ?? null,
        customerEmail: email,
        subtotal,
        commission,
        maturesAt,
      },
    }),
    prisma.affiliate.update({ where: { id: affiliate.id }, data: { conversions: { increment: 1 } } }),
  ]);

  // Remember a first-time referral so their next orders keep earning.
  if (firstReferral && email) {
    await prisma.referredCustomer.upsert({
      where: { shop_email: { shop, email } },
      update: {},
      create: { shop, email, affiliateId: affiliate.id },
    });
  }

  return { conversion: orderId, commission };
}

// A cancelled order earns nothing. Paid-out commission is left alone so a past
// payment is never silently rewritten — the merchant sees it and decides.
export async function voidOrder(shop, order) {
  const orderId = String(order.id);
  const found = await prisma.conversion.findUnique({ where: { orderId } });
  if (!found || found.status === "void" || found.status === "paid") return { ignored: "nothing to void" };

  await prisma.$transaction([
    prisma.conversion.update({ where: { orderId }, data: { status: "void" } }),
    prisma.affiliate.update({ where: { id: found.affiliateId }, data: { conversions: { decrement: 1 } } }),
    // Already asked for in a payout: take it out of that request so the merchant pays the right amount.
    ...(found.payoutId && found.status === "requested"
      ? [prisma.payout.update({ where: { id: found.payoutId }, data: { amount: { decrement: found.commission } } })]
      : []),
  ]);
  return { voided: orderId };
}
