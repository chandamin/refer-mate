import { authenticate } from "../shopify.server";
import { resolveReferral, landingUrlFor, renderRedirect } from "../referral.server";

// Referral links on the store's own domain:
//   https://<shop>/apps/referral/r/<code>
// Shopify signs the request and forwards it here as /proxy/r/<code>.
//
// The filename ends in `proxy_` so flat routes does NOT nest this under
// routes/proxy.jsx — that file is a loader-only resource route with no component
// to render children into.
//
// Every path through this loader returns 200 HTML. Shopify relays an app-proxy
// response to the browser and shows "There was an error in the third-party
// application" for anything that is not a 2xx, so a bad code or a failed lookup
// must still answer 200 and simply send the visitor to the storefront.
export const loader = async ({ request, params }) => {
  let shop = null;
  let admin = null;

  try {
    const context = await authenticate.public.appProxy(request);
    shop = context.session?.shop ?? null;
    admin = context.admin ?? null;
  } catch (error) {
    // An unsigned or malformed proxy request: nothing to attribute, but still
    // answer 200 so the shopper sees the store rather than Shopify's error page.
    console.error("[referral] app proxy auth failed:", error);
  }

  const match = /^r\/([A-Za-z0-9_-]+)$/.exec(params["*"] || "");
  const fallback = shop ? `https://${shop}/` : "/";

  if (!match) return renderRedirect(fallback);

  try {
    const hit = await resolveReferral(match[1]);
    if (!hit) return renderRedirect(fallback);
    // Applies the referral discount to this visitor's session on the way through.
    return renderRedirect(await landingUrlFor(admin, hit));
  } catch (error) {
    console.error("[referral] lookup failed for", match[1], error);
    return renderRedirect(fallback);
  }
};
