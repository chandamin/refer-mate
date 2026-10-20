import { authenticate } from "../shopify.server";
import { recordLead } from "../conversion.server";

// A checkout started with a referral discount code counts as a lead.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const result = await recordLead(shop, payload);
  console.log("[referral] " + topic + " for " + shop + ":", JSON.stringify(result));
  return new Response();
};
