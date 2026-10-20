import crypto from "node:crypto";
import prisma from "./db.server";
import { getSettings } from "./settings.server";

const CUSTOMER_QUERY = `#graphql
  query ReferralCustomer($id: ID!) {
    customer(id: $id) { firstName lastName email }
  }`;

// Visitors who are not logged in are identified by a random id their browser keeps
// (see renderBootstrap in dashboard-html.server.js). Stored in the same customerId
// column with a "v_" prefix, so real customer ids can never collide with it.
const VISITOR_ID = /^[A-Za-z0-9]{16,64}$/;
export const visitorKey = (vid) => (VISITOR_ID.test(String(vid || "")) ? `v_${vid}` : null);
export const isVisitor = (affiliate) => String(affiliate.customerId).startsWith("v_");

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);

const newCode = (base) => `${slug(base) || "ref"}-${crypto.randomBytes(3).toString("hex")}`;

// "Sam Cummins" -> "Sam C." — the leaderboard shows other customers' names, so
// never more than a first name and an initial.
export function publicName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Anonymous";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// Finds this customer's affiliate row, creating it (with their own referral code)
// the first time they open the dashboard. Name and email come from the Admin API
// and are best-effort: the dashboard must still work if that lookup fails.
export async function getOrCreateAffiliate(admin, shop, customerId) {
  const existing = await prisma.affiliate.findUnique({
    where: { shop_customerId: { shop, customerId: String(customerId) } },
  });
  if (existing) return existing;

  let name = null;
  let email = null;
  // Anonymous visitors have no store account to look up.
  if (!String(customerId).startsWith("v_")) try {
    const response = await admin.graphql(CUSTOMER_QUERY, {
      variables: { id: `gid://shopify/Customer/${customerId}` },
    });
    const { data } = await response.json();
    const c = data?.customer;
    name = [c?.firstName, c?.lastName].filter(Boolean).join(" ") || null;
    email = c?.email ?? null;
  } catch (error) {
    console.warn("[referral] could not read customer", customerId, error.message);
  }

  try {
    return await prisma.affiliate.create({
      data: { shop, customerId: String(customerId), code: newCode(name || email?.split("@")[0]), name, email },
    });
  } catch (error) {
    // Two tabs opening at once can race on the unique (shop, customerId) key.
    const raced = await prisma.affiliate.findUnique({
      where: { shop_customerId: { shop, customerId: String(customerId) } },
    });
    if (raced) return raced;
    throw error;
  }
}

const sum = (rows, pick) => rows.reduce((total, r) => total + pick(r), 0);

// Everything the dashboard page shows for one customer.
export async function dashboardFor(affiliate) {
  const { shop } = affiliate;
  const settings = await getSettings(shop);
  const now = new Date();

  const [links, conversions, bounties, board, payouts] = await Promise.all([
    prisma.affiliateLink.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" } }),
    prisma.conversion.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" } }),
    prisma.bounty.findMany({ where: { shop, active: true }, orderBy: { createdAt: "asc" } }),
    leaderboard(shop, affiliate.id),
    prisma.payout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const live = conversions.filter((c) => c.status !== "void");
  const paid = sum(live.filter((c) => c.status === "paid"), (c) => c.commission);
  const unpaid = live.filter((c) => c.status !== "paid");
  // Everything earned and not yet paid, so it drops back to 0 once the merchant pays.
  const upcoming = sum(unpaid, (c) => c.commission);
  // Asked for, waiting for the merchant to send it.
  const requested = sum(unpaid.filter((c) => c.status === "requested"), (c) => c.commission);
  // Past the holding period and free to withdraw.
  const available = sum(unpaid.filter((c) => c.status !== "requested" && c.maturesAt <= now), (c) => c.commission);

  const orders = live.length;
  return {
    settings,
    affiliate,
    links,
    conversions: live,
    totals: { upcoming, available, requested, paid, orders },
    payouts,
    bounties: bounties.map((b) => ({
      ...b,
      progress: Math.min(orders, b.target),
      done: orders >= b.target,
    })),
    leaderboard: board,
  };
}

// Top referrers by earnings, with the viewer flagged. Names are shortened.
export async function leaderboard(shop, viewerId, take = 10) {
  const grouped = await prisma.conversion.groupBy({
    by: ["affiliateId"],
    where: { shop, status: { not: "void" } },
    _sum: { commission: true },
    _count: { _all: true },
    orderBy: { _sum: { commission: "desc" } },
    take,
  });
  if (!grouped.length) return [];

  const people = await prisma.affiliate.findMany({
    where: { id: { in: grouped.map((g) => g.affiliateId) } },
    select: { id: true, name: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  return grouped.map((g, i) => ({
    rank: i + 1,
    name: publicName(byId.get(g.affiliateId)?.name),
    earned: g._sum.commission ?? 0,
    orders: g._count._all,
    you: g.affiliateId === viewerId,
  }));
}

// "Links" tab: extra tracking links so a customer can see which channel works.
export async function createLink(affiliate, label) {
  const clean = String(label || "").trim().slice(0, 40);
  if (!clean) return { error: "Give the link a name." };

  const count = await prisma.affiliateLink.count({ where: { affiliateId: affiliate.id } });
  if (count >= 20) return { error: "You can have up to 20 links." };

  const link = await prisma.affiliateLink.create({
    data: { affiliateId: affiliate.id, label: clean, code: newCode(clean) },
  });
  return { link };
}

export async function deleteLink(affiliate, id) {
  // Scoped to the owner, so one customer can never delete another's link.
  const { count } = await prisma.affiliateLink.deleteMany({ where: { id, affiliateId: affiliate.id } });
  return { deleted: count };
}

// Anonymous visitors have no store account to take a name and email from, so the
// Settings tab lets them add contact details. Without them the merchant would have no
// way to know who to pay. Both are optional; the email is checked loosely.
export async function saveProfile(affiliate, name, email) {
  const cleanName = String(name || "").trim().slice(0, 60) || null;
  const cleanEmail = String(email || "").trim().toLowerCase().slice(0, 120) || null;
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { error: "That email address does not look right." };
  }
  await prisma.affiliate.update({ where: { id: affiliate.id }, data: { name: cleanName, email: cleanEmail } });
  return { saved: true };
}
