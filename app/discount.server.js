import prisma from "./db.server";
import { getSettings } from "./settings.server";

// What a referred shopper gets off their order. The percentage is the merchant's
// setting (Program settings in Shopify Admin), not a constant.
//
// The discount applies to every customer, guests included, once per customer. A
// customer-segment restriction ("new customers only") is deliberately not used:
// Shopify only honours a segment for a customer it can identify, and referred
// first-time shoppers usually check out as guests — so the restriction would have
// removed the discount from exactly the people it is meant for.

const CREATE_DISCOUNT = `#graphql
  mutation ReferralDiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

const UPDATE_DISCOUNT = `#graphql
  mutation ReferralDiscountUpdate($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

// Recognisable in Shopify admin and unique per referrer:
//   refer-mate-a11be0 -> REF-REFER-MATE-A11BE0
export function discountCodeFor(referralCode) {
  return `REF-${String(referralCode).toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;
}

async function gql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

const tableFor = (kind) => (kind === "affiliate" ? prisma.affiliate : prisma.referral);

// Returns the discount code for this referral, creating it on Shopify the first
// time. Returns null if it could not be created — callers must still redirect the
// shopper, just without a discount, rather than failing the click.
export async function ensureDiscountCode(admin, hit) {
  if (!admin || !hit) return null;

  const settings = await getSettings(hit.shop);
  if (!settings.enabled || settings.discountPercent <= 0) return null;
  if (hit.discountCode) return hit.discountCode;

  const code = discountCodeFor(hit.code);
  const basicCodeDiscount = {
    title: `Referral ${settings.discountPercent}% - ${hit.code}`,
    code,
    startsAt: new Date().toISOString(),
    customerSelection: { all: true },
    customerGets: {
      value: { percentage: settings.discountPercent / 100 },
      items: { all: true },
    },
    // One use per shopper, so the referral cannot be farmed.
    appliesOncePerCustomer: true,
  };

  let gid = null;
  try {
    const data = await gql(admin, CREATE_DISCOUNT, { basicCodeDiscount });
    const errors = data?.discountCodeBasicCreate?.userErrors ?? [];
    gid = data?.discountCodeBasicCreate?.codeDiscountNode?.id ?? null;

    if (errors.length) {
      // A code already on the shop (for example after the local database was
      // reset) is not a failure — the discount exists, so keep using it.
      const alreadyExists = errors.some((e) => /taken|already|unique|exists/i.test(e.message || ""));
      if (!alreadyExists) {
        console.error("[referral] discountCodeBasicCreate userErrors:", JSON.stringify(errors));
        return null;
      }
      console.warn("[referral] discount code already exists on shop, reusing:", code);
    }
  } catch (error) {
    console.error("[referral] discount creation failed:", error.message);
    return null;
  }

  // Remember it so later clicks skip the API round trip entirely.
  await tableFor(hit.kind).update({
    where: { id: hit.id },
    data: { discountCode: code, discountGid: gid },
  });

  return code;
}

// Pushes the current discount percentage to every discount this shop already
// created. Called after the merchant saves settings, so changing 20% to 15%
// takes effect on existing referral links too, not just new ones.
// Returns { updated, failed }.
export async function syncDiscountPercent(admin, shop) {
  const settings = await getSettings(shop);
  const rows = [
    ...(await prisma.referral.findMany({ where: { shop, discountGid: { not: null } } })),
    ...(await prisma.affiliate.findMany({ where: { shop, discountGid: { not: null } } })),
  ];

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const data = await gql(admin, UPDATE_DISCOUNT, {
        id: row.discountGid,
        basicCodeDiscount: {
          title: `Referral ${settings.discountPercent}% - ${row.code}`,
          customerGets: {
            value: { percentage: settings.discountPercent / 100 },
            items: { all: true },
          },
        },
      });
      const errors = data?.discountCodeBasicUpdate?.userErrors ?? [];
      if (errors.length) throw new Error(JSON.stringify(errors));
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error("[referral] could not update discount", row.discountCode, error.message);
    }
  }
  return { updated, failed };
}
