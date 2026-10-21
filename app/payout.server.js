import prisma from "./db.server";
import { getSettings } from "./settings.server";

// Payouts are made by hand by the merchant (bank transfer, PayPal, ...). The app only
// keeps the books:
//   customer asks      -> Payout "requested", matured commission becomes "requested"
//   merchant pays      -> Payout "paid",      commission becomes "paid"  (balance back to 0)
//   merchant declines  -> Payout "rejected",  commission goes back to "approved"

export const METHODS = ["Bank transfer", "Other"];

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

export async function savePayoutDetails(affiliate, method, details) {
  const cleanMethod = METHODS.includes(method) ? method : null;
  const cleanDetails = String(details || "").trim().slice(0, 300) || null;
  if (!cleanMethod || !cleanDetails) return { error: "Choose a payout method and enter where to send the money." };
  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { payoutMethod: cleanMethod, payoutDetails: cleanDetails },
  });
  return { saved: true };
}

// Customer asks to be paid everything they have earned and not yet been paid.
export async function requestPayout(affiliate) {
  const settings = await getSettings(affiliate.shop);
  const fresh = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });
  if (!fresh?.payoutMethod || !fresh?.payoutDetails) {
    return { error: "Add your payout details in the Settings tab first." };
  }

  const ready = await prisma.conversion.findMany({
    where: {
      affiliateId: affiliate.id,
      status: { in: ["pending", "approved"] },
    },
  });
  const amount = money(ready.reduce((t, c) => t + c.commission, 0));
  if (amount <= 0) return { error: "You have nothing available to withdraw yet." };
  if (amount < settings.minPayout) {
    return { error: `The minimum payout is ${settings.currency}${settings.minPayout.toFixed(2)}.` };
  }

  const payout = await prisma.payout.create({
    data: { shop: affiliate.shop, affiliateId: affiliate.id, amount, method: fresh.payoutMethod, details: fresh.payoutDetails },
  });
  // Guarded on status so a commission cannot be put in two payouts by a double click.
  await prisma.conversion.updateMany({
    where: { id: { in: ready.map((c) => c.id) }, status: { in: ["pending", "approved"] } },
    data: { status: "requested", payoutId: payout.id },
  });
  return { requested: amount };
}

// Merchant has sent the money. Pays one open request, or (no payoutId) everything
// that is payable for the affiliate, recording it as a payout so there is history.
export async function markPaid(shop, { payoutId, affiliateId, note }) {
  const now = new Date();
  const cleanNote = String(note || "").trim().slice(0, 200) || null;

  if (payoutId) {
    const payout = await prisma.payout.findFirst({ where: { id: payoutId, shop, status: "requested" } });
    if (!payout) return { marked: 0 };
    await prisma.$transaction([
      prisma.conversion.updateMany({ where: { payoutId: payout.id, status: "requested" }, data: { status: "paid" } }),
      prisma.payout.update({ where: { id: payout.id }, data: { status: "paid", paidAt: now, note: cleanNote } }),
    ]);
    return { marked: 1 };
  }

  const affiliate = await prisma.affiliate.findFirst({ where: { id: affiliateId, shop } });
  if (!affiliate) return { marked: 0 };
  const ready = await prisma.conversion.findMany({
    where: { affiliateId, shop, status: { in: ["pending", "approved"] } },
  });
  const amount = money(ready.reduce((t, c) => t + c.commission, 0));
  if (amount <= 0) return { marked: 0 };

  const payout = await prisma.payout.create({
    data: {
      shop, affiliateId, amount, status: "paid", paidAt: now, note: cleanNote,
      method: affiliate.payoutMethod, details: affiliate.payoutDetails,
    },
  });
  await prisma.conversion.updateMany({
    where: { id: { in: ready.map((c) => c.id) }, status: { in: ["pending", "approved"] } },
    data: { status: "paid", payoutId: payout.id },
  });
  return { marked: 1 };
}

export async function rejectPayout(shop, payoutId, note) {
  const payout = await prisma.payout.findFirst({ where: { id: payoutId, shop, status: "requested" } });
  if (!payout) return { rejected: 0 };
  await prisma.$transaction([
    prisma.conversion.updateMany({ where: { payoutId: payout.id, status: "requested" }, data: { status: "approved", payoutId: null } }),
    prisma.payout.update({
      where: { id: payout.id },
      data: { status: "rejected", note: String(note || "").trim().slice(0, 200) || null },
    }),
  ]);
  return { rejected: 1 };
}
