import { useLoaderData, useActionData, useNavigation, Form } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSettings, saveSettings } from "../settings.server";
import { syncDiscountPercent } from "../discount.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, bounties] = await Promise.all([
    getSettings(shop),
    prisma.bounty.findMany({ where: { shop }, orderBy: { createdAt: "asc" } }),
  ]);
  return { settings, bounties };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const before = await getSettings(shop);
    const after = await saveSettings(shop, form);

    // Existing referral discounts live on Shopify, so a new percentage has to be
    // pushed to them — otherwise it would only apply to links created from now on.
    let sync = null;
    if (before.discountPercent !== after.discountPercent) {
      sync = await syncDiscountPercent(admin, shop);
    }
    return { saved: true, sync };
  }

  if (intent === "addBounty") {
    const title = String(form.get("title") || "").trim();
    if (!title) return { error: "A bounty needs a title." };
    await prisma.bounty.create({
      data: {
        shop,
        title,
        description: String(form.get("description") || "").trim() || null,
        reward: Math.max(0, Number(form.get("reward")) || 0),
        target: Math.max(1, Math.round(Number(form.get("target")) || 1)),
      },
    });
    return { bountyAdded: true };
  }

  if (intent === "toggleBounty" || intent === "deleteBounty") {
    const id = String(form.get("id"));
    // Scoped to this shop so one merchant can never touch another's bounty.
    if (intent === "deleteBounty") {
      await prisma.bounty.deleteMany({ where: { id, shop } });
    } else {
      const bounty = await prisma.bounty.findFirst({ where: { id, shop } });
      if (bounty) await prisma.bounty.update({ where: { id }, data: { active: !bounty.active } });
    }
    return { ok: true };
  }

  return { ok: true };
};

// React 18 writes a boolean prop on a custom element as the attribute "false" — which
// still counts as present. Only ever pass these props when they are true.
export default function Settings() {
  const { settings, bounties } = useLoaderData();
  const result = useActionData();
  const busy = useNavigation().state !== "idle";

  return (
    <s-page heading="Program settings">
      {result?.saved && (
        <s-banner tone="success" heading="Settings saved">
          {result.sync
            ? `Discount updated on ${result.sync.updated} existing link(s)${
                result.sync.failed ? `, ${result.sync.failed} failed — see the server log` : ""
              }.`
            : "Changes apply to your customers' dashboards straight away."}
        </s-banner>
      )}
      {result?.error && <s-banner tone="critical" heading={result.error} />}

      <Form method="post">
        <input type="hidden" name="intent" value="save" />

        <s-section heading="Commission">
          <s-paragraph>What a customer earns when someone they referred buys.</s-paragraph>
          <s-stack gap="base">
            <s-number-field label="Commission (%)" name="commissionPercent" value={String(settings.commissionPercent)} min="0" max="100" step="0.5" />
            <s-number-field label="Earns for (months)" name="commissionMonths" value={String(settings.commissionMonths)} min="1" max="120" details="How long after the first referred order the customer keeps earning on that shopper's purchases." />
            <s-number-field label="Holding period (days)" name="holdingDays" value={String(settings.holdingDays)} min="0" max="365" details="Commission becomes payable this long after the order." />
            <s-number-field label={`Minimum payout (${settings.currency})`} name="minPayout" value={String(settings.minPayout)} min="0" />
            <s-text-field label="Currency symbol" name="currency" value={settings.currency} details="Shown before every amount, e.g. £, $ or €." />
          </s-stack>
        </s-section>

        <s-section heading="Discount for referred shoppers">
          <s-number-field label="Discount (%)" name="discountPercent" value={String(settings.discountPercent)} min="0" max="100" step="0.5" details="Applied automatically when a shopper follows a referral link. Changing it updates existing links too." />
        </s-section>

        <s-section heading="Customer dashboard content">
          <s-stack gap="base">
            <s-url-field label="Program terms link" name="termsUrl" value={settings.termsUrl || ""} />
            <s-text-area label="FAQ" name="faq" rows="6" value={settings.faq || ""} details="Plain text. Separate questions with a blank line." />
            <s-text-area label="Resources" name="resources" rows="6" value={settings.resources || ""} details="Plain text. Links on their own line become clickable." />
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-checkbox label="Referral program is on" name="enabled" {...(settings.enabled ? { checked: true } : {})} />
            <s-button type="submit" variant="primary" {...(busy ? { disabled: true } : {})}>Save</s-button>
          </s-stack>
        </s-section>
      </Form>

      <s-section heading="Bounties">
        <s-paragraph>Extra rewards shown on the customer's Bounties tab. A bounty is earned once they reach the target number of referred orders.</s-paragraph>

        {bounties.length === 0 && <s-paragraph>No bounties yet.</s-paragraph>}
        {bounties.map((b) => (
          <s-box key={b.id} padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack gap="none">
                <s-heading>{b.title}{b.active ? "" : " (hidden)"}</s-heading>
                <s-text tone="neutral">
                  ${b.reward.toFixed(2)} for {b.target} referred order{b.target === 1 ? "" : "s"}
                  {b.description ? ` · ${b.description}` : ""}
                </s-text>
              </s-stack>
              <s-stack direction="inline" gap="small">
                <Form method="post">
                  <input type="hidden" name="id" value={b.id} />
                  <s-button type="submit" name="intent" value="toggleBounty">{b.active ? "Hide" : "Show"}</s-button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="id" value={b.id} />
                  <s-button type="submit" name="intent" value="deleteBounty" tone="critical">Delete</s-button>
                </Form>
              </s-stack>
            </s-stack>
          </s-box>
        ))}

        <Form method="post">
          <input type="hidden" name="intent" value="addBounty" />
          <s-stack gap="base">
            <s-text-field label="Title" name="title" />
            <s-text-field label="Description (optional)" name="description" />
            <s-stack direction="inline" gap="base">
              <s-number-field label={`Reward (${settings.currency})`} name="reward" min="0" value="10" />
              <s-number-field label="Referred orders needed" name="target" min="1" value="1" />
            </s-stack>
            <s-button type="submit" {...(busy ? { disabled: true } : {})}>Add bounty</s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
