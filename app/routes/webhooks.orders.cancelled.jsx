import { authenticate } from "../shopify.server";
import { voidOrder } from "../conversion.server";

// A cancelled order no longer earns commission.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const result = await voidOrder(shop, payload);
  console.log("[referral] " + topic + " for " + shop + ":", JSON.stringify(result));
  return new Response();
};
