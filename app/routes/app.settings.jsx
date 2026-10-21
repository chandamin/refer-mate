import { useLoaderData, useActionData, useNavigation, Form } from "react-router";
import { authenticate } from "../shopify.server";
import { getSettings, saveSettings } from "../settings.server";
import { syncDiscountPercent } from "../discount.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getSettings(shop);
  return { settings };
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

  return { ok: true };
};

// React 18 writes a boolean prop on a custom element as the attribute "false" — which
// still counts as present. Only ever pass these props when they are true.
export default function Settings() {
  const { settings } = useLoaderData();
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
    </s-page>
  );
}
