import prisma from "./db.server";
import { ensureDiscountCode } from "./discount.server";

// Must match [app_proxy] in shopify.app.toml (prefix = "apps", subpath = "referral").
// Change it there and here together.
const PROXY_BASE = "/apps/referral";

// Referral links live on the STORE's own domain and reach this app through the
// Shopify app proxy:
//
//   https://<shop>/apps/referral/r/<code>   ->   <app>/proxy/r/<code>
//
// Building them from session.shop means they need no app URL at all, so they
// survive the tunnel URL rotating between `shopify app dev` runs and stay stable
// in production. The app-domain form (/r/<code>, see routes/r.$code.jsx) still
// works for links shared before this change.
export function referralUrl(shop, code) {
  return `https://${shop}${PROXY_BASE}/r/${code}`;
}

// Where a referred visitor lands: the storefront, tagged so attribution works.
export function destinationUrl({ shop, code }) {
  return `https://${shop}/?ref=${encodeURIComponent(code)}`;
}

// Same landing page, but routed through Shopify's /discount/<code> endpoint, which
// applies the discount to the visitor's session and then forwards them on. This is
// what actually gives the referred shopper their 20% off at checkout.
export function discountDestinationUrl({ shop, code }, discountCode) {
  const onward = `/?ref=${encodeURIComponent(code)}`;
  return `https://${shop}/discount/${encodeURIComponent(discountCode)}?redirect=${encodeURIComponent(onward)}`;
}

// Counts the click and returns the referral row (plus which table it came from),
// or null when the code is unknown. Callers decide how to redirect — a plain 302
// is fine on the app's own domain, but an app-proxy response has to be a 2xx
// (see renderRedirect).
export async function resolveReferral(code) {
  if (!code) return null;

  // 1) A customer's affiliate link (storefront dashboard)
  const affiliate = await prisma.affiliate.findUnique({ where: { code } });
  if (affiliate) {
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { clicks: { increment: 1 } },
    });
    return { kind: "affiliate", ...affiliate };
  }

  // 2) One of a customer's extra tracking links ("Links" tab). Counts for the link
  //    itself and for its owner, and shares the owner's discount and attribution.
  const link = await prisma.affiliateLink.findUnique({ where: { code }, include: { affiliate: true } });
  if (link) {
    await prisma.$transaction([
      prisma.affiliateLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
      prisma.affiliate.update({ where: { id: link.affiliateId }, data: { clicks: { increment: 1 } } }),
    ]);
    return { kind: "affiliate", ...link.affiliate };
  }

  // 3) The merchant's own link (admin dashboard)
  const referral = await prisma.referral.findUnique({ where: { code } });
  if (!referral) return null;

  await prisma.referral.update({
    where: { id: referral.id },
    data: { clicks: { increment: 1 } },
  });
  return { kind: "referral", ...referral };
}

// The URL a click should land on: with the discount when we can create one,
// plain otherwise. Never throws — a discount problem must not break the click.
export async function landingUrlFor(admin, hit) {
  try {
    const discountCode = await ensureDiscountCode(admin, hit);
    if (discountCode) return discountDestinationUrl(hit, discountCode);
  } catch (error) {
    console.error("[referral] could not attach discount:", error.message);
  }
  return destinationUrl(hit);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

// Safe to embed inside <script>…</script>: JSON quoting alone is not enough,
// because a literal "</script>" in the value would close the block early.
const escapeJs = (s) => JSON.stringify(String(s)).replace(/</g, "\\u003C");

// Only ever bounce to an absolute http(s) URL or a root-relative path, so a bad
// value can never become a javascript: or data: URL.
const safeTarget = (target) => {
  const t = String(target || "");
  return /^https?:\/\//i.test(t) || /^\/(?!\/)/.test(t) ? t : "/";
};

// A 200 HTML page that bounces the visitor onward.
//
// Shopify fetches an app-proxy response server-side and relays it to the browser.
// Anything that is not a 2xx surfaces as "There was an error in the third-party
// application", and a 302 Location is not reliably passed through — so the
// redirect has to happen in the browser instead. meta refresh covers the
// no-JavaScript case, the inline script makes it instant, and the visible link
// is the last resort if both are blocked.
export function renderRedirect(target) {
  const url = safeTarget(target);
  const href = escapeHtml(url);
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${href}">
<title>Redirecting…</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:40px;text-align:center">
<p>Taking you to the store… <a href="${href}">Continue</a></p>
<script>window.location.replace(${escapeJs(url)});</script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Clicks are counted server-side, so this must never be cached.
      "Cache-Control": "no-store",
    },
  });
}
