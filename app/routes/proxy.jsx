import { authenticate } from "../shopify.server";
import { getOrCreateAffiliate, dashboardFor, createLink, deleteLink, saveProfile, visitorKey, isVisitor } from "../affiliate.server";
import { savePayoutDetails, requestPayout } from "../payout.server";
import { getSettings } from "../settings.server";
import { renderDashboard, renderBootstrap, renderDisabled } from "../dashboard-html.server";

// The customer's referral dashboard, as a page of the storefront:
//   https://<shop>/apps/referral   ->   <app>/proxy   (see [app_proxy] in shopify.app.toml)
//
// Shopify signs the request and, for a logged-in shopper, adds their customer id
// as logged_in_customer_id. The signature is verified by authenticate.public.appProxy,
// so that id can be trusted — it cannot be spoofed from the browser.
//
// Every response here is a 200: Shopify replaces any non-2xx answer from an app
// proxy with "There was an error in the third-party application".

// Who is asking? A logged-in customer (id supplied and signed by Shopify), otherwise an
// anonymous visitor identified by the random id their browser sent as ?vid=. No login or
// signup is needed either way. Returns null only for a browser that has no id yet.
const whoIs = (request) => {
  const params = new URL(request.url).searchParams;
  return params.get("logged_in_customer_id") || visitorKey(params.get("vid"));
};

export const loader = async ({ request }) => {
  const { session, admin, liquid } = await authenticate.public.appProxy(request);
  if (!session || !admin) return liquid("<p>The referral program is not available right now.</p>");

  try {
    const settings = await getSettings(session.shop);
    if (!settings.enabled) return liquid(renderDisabled());

    const who = whoIs(request);
    // First visit from this browser: hand it an id, then it reloads with ?vid=.
    if (!who) return liquid(renderBootstrap());

    const affiliate = await getOrCreateAffiliate(admin, session.shop, who);
    return liquid(renderDashboard({ ...(await dashboardFor(affiliate)), anonymous: isVisitor(affiliate) }));
  } catch (error) {
    console.error("[referral] dashboard failed:", error);
    return liquid("<p>We could not load your referral dashboard. Please refresh the page.</p>");
  }
};

// Create / delete one of the customer's extra tracking links (the "Links" tab).
export const action = async ({ request }) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  const who = whoIs(request);
  if (!session || !admin || !who) return Response.json({ error: "Please reload the page and try again." });

  try {
    const form = await request.formData();
    const affiliate = await getOrCreateAffiliate(admin, session.shop, who);
    const intent = form.get("intent");

    if (intent === "createLink") return Response.json(await createLink(affiliate, form.get("label")));
    if (intent === "saveProfile" && isVisitor(affiliate)) return Response.json(await saveProfile(affiliate, form.get("name"), form.get("email")));
    if (intent === "savePayout") return Response.json(await savePayoutDetails(affiliate, form.get("method"), form.get("details")));
    if (intent === "requestPayout") return Response.json(await requestPayout(affiliate));
    if (intent === "deleteLink") return Response.json(await deleteLink(affiliate, String(form.get("id"))));
    return Response.json({ error: "Unknown action." });
  } catch (error) {
    console.error("[referral] link action failed:", error);
    return Response.json({ error: "Something went wrong. Please try again." });
  }
};
