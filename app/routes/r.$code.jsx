import { redirect } from "react-router";
import { unauthenticated } from "../shopify.server";
import { resolveReferral, landingUrlFor } from "../referral.server";

// Public route: https://YOUR-APP-URL/r/<code>
// Kept so links shared before referral URLs moved onto the store's own domain
// (see app/referral.server.js) keep working. New links use /apps/referral/r/<code>.
//
// This one is served from the app's own domain rather than through the app
// proxy, so a plain 302 is fine here.
export const loader = async ({ params }) => {
  const hit = await resolveReferral(params.code);
  if (!hit) throw new Response("Link not found", { status: 404 });

  // No proxy context here, so borrow the shop's stored offline token to reach the
  // Admin API and attach the discount the same way the proxy route does.
  let admin = null;
  try {
    ({ admin } = await unauthenticated.admin(hit.shop));
  } catch (error) {
    console.error("[referral] no offline session for", hit.shop, error.message);
  }

  return redirect(await landingUrlFor(admin, hit));
};
