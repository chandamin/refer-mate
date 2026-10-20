import { authenticate } from "../shopify.server";
import { recordOrder } from "../conversion.server";

// A paid order from a referred shopper is a conversion and earns commission.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const result = await recordOrder(shop, payload);
  console.log("[referral] " + topic + " for " + shop + ":", JSON.stringify(result));
  return new Response();
};
