import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import crypto from "node:crypto";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { referralUrl } from "../referral.server";
import { ensureDiscountCode } from "../discount.server";

// Permissions the referral program needs. Anything missing means the app was installed
// before it asked for it, and the merchant has to approve the new permissions.
const REQUIRED_SCOPES = ["write_discounts", "read_customers", "read_orders"];

const makeCode = (shop) =>
  `${shop.replace(".myshopify.com", "")}-${crypto.randomBytes(3).toString("hex")}`;

// ---- Server: runs only inside Shopify Admin (authenticated) ----
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeHandle = shop.replace(".myshopify.com", "");
  // Scopes granted at install time. The discount needs write_discounts, and the
  // app keeps the scopes it was installed with until it is re-authorised.
  const grantedScopes = (session.scope || "").split(",").map((s) => s.trim());

  // Auto-generate the referral code the first time the dashboard opens
  let referral = await prisma.referral.findUnique({ where: { shop } });
  if (!referral) {
    referral = await prisma.referral.create({ data: { shop, code: makeCode(shop) } });
  }

  // Create the discount up front rather than waiting for the first shopper, so it
  // is visible in Shopify admin > Discounts and any failure shows up here instead
  // of silently costing a referred customer their 20%.
  const discountCode = await ensureDiscountCode(admin, { kind: "referral", ...referral });

  return {
    shop,
    referral,
    discountCode,
    missingScopes: REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope)),
    referralUrl: referralUrl(shop, referral.code),
    storefrontUrl: `https://${shop}`,
    // Opens the theme editor with the "Referral dashboard" app block ready to drop in.
    themeEditorUrl: `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=index&addAppBlockId=${process.env.SHOPIFY_API_KEY}/referral-dashboard&target=newAppsSection`,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const intent = (await request.formData()).get("intent");

  if (intent === "regenerate") {
    await prisma.referral.update({
      where: { shop: session.shop },
      data: { code: makeCode(session.shop) },
    });
  }
  if (intent === "connect") {
    // Placeholder: replace with your real Stripe Connect onboarding redirect
    await prisma.referral.update({
      where: { shop: session.shop },
      data: { payoutConnected: true },
    });
  }
  return { ok: true };
};

// ---- UI (Shopify's built-in Polaris web components, nothing extra to install) ----
const TABS = ["Quickstart", "Earnings", "Links", "Settings"];

function Stat({ label, value }) {
  return (
    <s-section>
      <s-text tone="neutral">{label}</s-text>
      <s-heading>{value}</s-heading>
    </s-section>
  );
}

export default function Dashboard() {
  const { shop, referral, referralUrl, storefrontUrl, themeEditorUrl, discountCode, missingScopes } =
    useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referralUrl]);

  const send = (intent) => fetcher.submit({ intent }, { method: "post" });

  return (
    <s-page heading="Referral dashboard">
      {missingScopes.length > 0 && (
        <s-banner tone="critical" heading="Approve the new app permissions">
          Referral discounts, orders and customer names are not working yet because this
          app has not been granted: <code>{missingScopes.join(", ")}</code>. Run{" "}
          <code>npm run deploy</code>, restart <code>shopify app dev</code> and open the
          app again to approve them.
        </s-banner>
      )}

      {missingScopes.length === 0 && !discountCode && (
        <s-banner tone="warning" heading="Referral discount not created">
          The 20% discount could not be created on this store. Check the dev server
          log for lines starting with <code>[referral]</code>.
        </s-banner>
      )}

      {discountCode && (
        <s-banner tone="success" heading="Referral discount is live">
          Shoppers who use your link get 20% off automatically with code{" "}
          <code>{discountCode}</code>. You can see it in Shopify admin under Discounts.
        </s-banner>
      )}

      {!referral.payoutConnected && (
        <s-banner tone="warning" heading="Payouts are not connected">
          Connect payouts to receive your earnings.
        </s-banner>
      )}

      <s-section heading="Referral link">
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field label="Referral link" labelAccessibilityVisibility="exclusive" value={referralUrl} readOnly />
          <s-button variant="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</s-button>
        </s-stack>
        <s-paragraph>20% per sale for 6 months · New users get 20% off their first purchase</s-paragraph>
      </s-section>

      <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
        <Stat label="Clicks" value={referral.clicks} />
        <Stat label="Leads" value={referral.leads} />
        <Stat label="Conversions" value={referral.conversions} />
      </s-grid>

      <s-section>
        <s-stack direction="inline" gap="small">
          {TABS.map((t, i) => (
            <s-button key={t} variant={tab === i ? "primary" : "secondary"} onClick={() => setTab(i)}>
              {t}
            </s-button>
          ))}
        </s-stack>
      </s-section>

      {tab === 0 && (
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          <s-section heading="Share your link">
            <s-paragraph>Every click, lead and conversion is tracked automatically.</s-paragraph>
            <s-button variant="primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</s-button>
          </s-section>

          <s-section heading="Your storefront">
            <s-paragraph>Your referral link sends visitors to {shop}.</s-paragraph>
            <s-stack direction="inline" gap="small">
              <s-button href={storefrontUrl} target="_blank">View storefront</s-button>
              <s-button href={themeEditorUrl} target="_blank">Enable in theme</s-button>
            </s-stack>
          </s-section>

          <s-section heading="Receive earnings">
            <s-badge tone={referral.payoutConnected ? "success" : "warning"}>
              {referral.payoutConnected ? "Connected" : "Not connected"}
            </s-badge>
            <s-paragraph>Connect payouts to get paid for the sales you drive.</s-paragraph>
            <s-button disabled={referral.payoutConnected || busy} onClick={() => send("connect")}>
              Connect payouts
            </s-button>
          </s-section>
        </s-grid>
      )}

      {tab === 1 && (
        <s-section heading="Earnings">
          <s-paragraph>Upcoming: $0.00</s-paragraph>
          <s-paragraph>Paid: $0.00</s-paragraph>
          <s-paragraph>20% per sale for 6 months · $100 minimum payout · 30-day holding period</s-paragraph>
        </s-section>
      )}

      {tab === 2 && (
        <s-section heading="Links">
          <s-paragraph>Referral link: {referralUrl}</s-paragraph>
          <s-paragraph>Storefront: {storefrontUrl}</s-paragraph>
        </s-section>
      )}

      {tab === 3 && (
        <s-section heading="Settings">
          <s-paragraph>Creating a new code makes the old link stop working.</s-paragraph>
          <s-button tone="critical" disabled={busy} onClick={() => send("regenerate")}>
            Generate new link
          </s-button>
        </s-section>
      )}
    </s-page>
  );
}
