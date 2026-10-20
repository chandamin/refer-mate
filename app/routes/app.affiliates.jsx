import { useLoaderData, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSettings } from "../settings.server";
import { markPaid, rejectPayout } from "../payout.server";

const fmt = (symbol) => (v) => `${symbol}${Number(v || 0).toFixed(2)}`;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const now = new Date();

  const [settings, affiliates, conversions, payouts] = await Promise.all([
    getSettings(shop),
    prisma.affiliate.findMany({ where: { shop }, orderBy: { createdAt: "desc" } }),
    prisma.conversion.findMany({ where: { shop, status: { not: "void" } }, orderBy: { createdAt: "desc" } }),
    prisma.payout.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const nameOf = (a) =>
    a.name || (a.customerId.startsWith("v_") ? "Visitor " + a.customerId.slice(2, 8) : "Customer " + a.customerId);
  const byId = new Map(affiliates.map((a) => [a.id, a]));

  const rows = affiliates.map((a) => {
    const mine = conversions.filter((c) => c.affiliateId === a.id);
    const unpaid = mine.filter((c) => c.status !== "paid" && c.status !== "requested");
    return {
      id: a.id,
      name: nameOf(a),
      email: a.email,
      payoutMethod: a.payoutMethod,
      payoutDetails: a.payoutDetails,
      clicks: a.clicks,
      leads: a.leads,
      orders: mine.length,
      pending: unpaid.filter((c) => c.maturesAt > now).reduce((t, c) => t + c.commission, 0),
      payable: unpaid.filter((c) => c.maturesAt <= now).reduce((t, c) => t + c.commission, 0),
      paid: mine.filter((c) => c.status === "paid").reduce((t, c) => t + c.commission, 0),
    };
  });

  const payoutRows = payouts.map((p) => ({
    ...p,
    name: byId.has(p.affiliateId) ? nameOf(byId.get(p.affiliateId)) : "Unknown",
    email: byId.get(p.affiliateId)?.email ?? null,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
  }));
  const requests = payoutRows.filter((p) => p.status === "requested");
  const history = payoutRows.filter((p) => p.status !== "requested");

  return { currency: settings.currency, rows, requests, history, recent: conversions.slice(0, 15) };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const intent = form.get("intent");
  const note = form.get("note");

  // Run after the merchant has sent the money by hand. Everything is scoped to THIS
  // shop, and only commission past its holding period can be paid.
  if (intent === "markRequestPaid") return markPaid(session.shop, { payoutId: String(form.get("payoutId")), note });
  if (intent === "markPaid") return markPaid(session.shop, { affiliateId: String(form.get("id")), note });
  if (intent === "rejectRequest") return rejectPayout(session.shop, String(form.get("payoutId")), note);
  return { ok: true };
};

export default function Affiliates() {
  const { currency, rows, requests, history, recent } = useLoaderData();
  const usd = fmt(currency);
  const when = (d) => new Date(d).toLocaleDateString("en-GB");
  const busy = useNavigation().state !== "idle";

  return (
    <s-page heading="Referrers">
      <s-section heading={`Payout requests (${requests.length})`}>
        {requests.length === 0 ? (
          <s-paragraph>No pending requests. When a customer asks to be paid it shows up here with their payout details.</s-paragraph>
        ) : (
          requests.map((p) => (
            <s-box key={p.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="small">
                <s-heading>{p.name} - {usd(p.amount)}</s-heading>
                <s-paragraph>{p.email ? `${p.email} - ` : ""}Requested {when(p.createdAt)}</s-paragraph>
                <s-paragraph>
                  <strong>{p.method || "No method"}:</strong> {p.details || "-"}
                </s-paragraph>
                <Form method="post">
                  <input type="hidden" name="payoutId" value={p.id} />
                  <s-stack direction="inline" gap="base">
                    <input name="note" placeholder="Note, e.g. bank reference (optional)" style={{ padding: "6px 10px", minWidth: 260 }} />
                    <s-button type="submit" variant="primary" name="intent" value="markRequestPaid" {...(busy ? { disabled: true } : {})}>
                      I have sent {usd(p.amount)} - mark paid
                    </s-button>
                    <s-button type="submit" tone="critical" name="intent" value="rejectRequest" {...(busy ? { disabled: true } : {})}>
                      Reject
                    </s-button>
                  </s-stack>
                </Form>
              </s-stack>
            </s-box>
          ))
        )}
        <s-paragraph>
          Send the money yourself from your own bank or PayPal, then press "mark paid". The customer's balance goes back to {usd(0)}.
        </s-paragraph>
      </s-section>

      <s-section heading="Customers earning from referrals">
        {rows.length === 0 ? (
          <s-paragraph>
            Nobody has opened their referral dashboard yet. Each customer gets their own link the first time they do.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Customer</s-table-header>
              <s-table-header format="numeric">Clicks</s-table-header>
              <s-table-header format="numeric">Leads</s-table-header>
              <s-table-header format="numeric">Orders</s-table-header>
              <s-table-header format="numeric">Holding</s-table-header>
              <s-table-header format="numeric">Payable</s-table-header>
              <s-table-header format="numeric">Paid</s-table-header>
              <s-table-header>Payout details</s-table-header>
              <s-table-header>Payout</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.name}{r.email ? ` · ${r.email}` : ""}</s-table-cell>
                  <s-table-cell>{r.clicks}</s-table-cell>
                  <s-table-cell>{r.leads}</s-table-cell>
                  <s-table-cell>{r.orders}</s-table-cell>
                  <s-table-cell>{usd(r.pending)}</s-table-cell>
                  <s-table-cell>{usd(r.payable)}</s-table-cell>
                  <s-table-cell>{usd(r.paid)}</s-table-cell>
                  <s-table-cell>{r.payoutMethod ? `${r.payoutMethod}: ${r.payoutDetails}` : "Not added"}</s-table-cell>
                  <s-table-cell>
                    {r.payable > 0 ? (
                      <Form method="post">
                        <input type="hidden" name="id" value={r.id} />
                        <s-button type="submit" name="intent" value="markPaid" {...(busy ? { disabled: true } : {})}>
                          Mark {usd(r.payable)} paid
                        </s-button>
                      </Form>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        <s-paragraph>
          Payments are made outside the app. "Mark paid" only records that you have already sent the money.
        </s-paragraph>
      </s-section>

      <s-section heading="Payment history">
        {history.length === 0 ? (
          <s-paragraph>No payments recorded yet.</s-paragraph>
        ) : (
          history.map((p) => (
            <s-paragraph key={p.id}>
              {when(p.paidAt || p.createdAt)} - {p.name} - {usd(p.amount)} - {p.status === "paid" ? "Paid" : "Rejected"}
              {p.method ? ` via ${p.method}` : ""}
              {p.note ? ` - ${p.note}` : ""}
            </s-paragraph>
          ))
        )}
      </s-section>

      <s-section heading="Recent referred orders">
        {recent.length === 0 ? (
          <s-paragraph>No referred orders yet.</s-paragraph>
        ) : (
          recent.map((c) => (
            <s-paragraph key={c.id}>
              {c.orderName || c.orderId} · {usd(c.subtotal)} → {usd(c.commission)} commission ({c.status})
            </s-paragraph>
          ))
        )}
      </s-section>
    </s-page>
  );
}
