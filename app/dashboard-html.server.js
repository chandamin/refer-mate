import { referralUrl } from "./referral.server";

// The customer's referral dashboard, rendered as a page of the storefront (not a
// popup): https://<shop>/apps/referral
//
// Shopify renders this through Liquid, inside the shop's theme. Two consequences:
//  * Anything dynamic must be escaped, INCLUDING "{" — otherwise a customer name or
//    FAQ entry containing "{{ ... }}" would be executed as Liquid. See esc().
//  * The static <style> and <script> are wrapped in {% raw %} for the same reason.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" };
const esc = (value) => String(value ?? "").replace(/[&<>"'{}]/g, (c) => ENTITIES[c]);
// Currency symbol comes from the merchant's settings. Rendering is synchronous, so
// setting it once at the top of renderDashboard is safe.
let cur = "£";
const usd = (v) => `${esc(cur)}${Number(v || 0).toFixed(2)}`;
const count = (v) => Number(v || 0).toLocaleString("en-US");
const trim = (n) => String(Number(n)); // 20 -> "20", 12.5 -> "12.5"

const ICONS = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="16" cy="13" r="1.3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
};
const icon = (name) =>
  `<svg class="rm-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;

// Turns plain text into paragraphs, making bare URLs clickable. Escapes first, so
// the only markup in the output is what this function adds.
function richText(text) {
  const blocks = String(text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const html = esc(block)
        .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
          // esc() already neutralised quotes and angle brackets inside url.
          const clean = url.replace(/[.,;)]+$/, "");
          const tail = url.slice(clean.length);
          return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
        })
        .replace(/\n/g, "<br>");
      return `<p>${html}</p>`;
    })
    .join("");
}

function faqHtml(text) {
  const blocks = String(text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const [question, ...rest] = block.split("\n");
      const answer = rest.join("\n").trim();
      if (!answer) return `<div class="rm-card">${richText(question)}</div>`;
      return `<details class="rm-faq"><summary>${esc(question)}</summary>${richText(answer)}</details>`;
    })
    .join("");
}

const empty = (title, body) =>
  `<div class="rm-empty"><strong>${esc(title)}</strong><span>${esc(body)}</span></div>`;

// ---------------------------------------------------------------- sections ---

function hero(d, link) {
  const s = d.settings;
  const facts = [
    `<p class="rm-fact">${icon("gift")}<span>${trim(s.commissionPercent)}% per sale for ${esc(s.commissionMonths)} months</span></p>`,
    s.discountPercent > 0
      ? `<p class="rm-fact">${icon("mail")}<span>New users get ${trim(s.discountPercent)}% off their first purchase</span></p>`
      : "",
    `<p class="rm-fine">${usd(s.minPayout)} minimum payout</p>`,
  ].join("");

  return `
  <section class="rm-hero">
    <div class="rm-hero-main">
      <div class="rm-hero-head">
        <h2 class="rm-h">Referral link</h2>
        ${s.termsUrl ? `<a class="rm-link" href="${esc(s.termsUrl)}" target="_blank" rel="noopener noreferrer">View terms</a>` : ""}
      </div>
      <div class="rm-row">
        <input class="rm-input" id="rm-main-link" type="text" readonly value="${esc(link)}" aria-label="Your referral link">
        <button class="rm-btn" type="button" data-copy="#rm-main-link">${icon("copy")}<span>Copy</span></button>
      </div>
      <div class="rm-facts">${facts}</div>
    </div>
    <div class="rm-brand" aria-hidden="true">${icon("share")}</div>
  </section>`;
}

function tiles(d) {
  const t = d.totals;
  const a = d.affiliate;
  const tile = (label, value) =>
    `<div class="rm-tile"><div class="rm-tile-label">${label}</div><div class="rm-tile-value">${value}</div><div class="rm-rule"></div></div>`;
  return `
  <div class="rm-tiles">
    ${tile("Clicks", count(a.clicks))}
    ${tile("Leads", count(a.leads))}
    ${tile("Conversions", count(a.conversions))}
    <div class="rm-tile rm-tile-wide">
      <div class="rm-tile-label">Earnings</div>
      <dl class="rm-dl"><dt>Upcoming</dt><dd>${usd(t.upcoming)}</dd><dt>Paid</dt><dd>${usd(t.paid)}</dd></dl>
      <div class="rm-rule"></div>
    </div>
  </div>`;
}

function quickstart(d) {
  const card = (ic, title, text) =>
    `<div class="rm-card"><div class="rm-badge">${icon(ic)}</div><h3 class="rm-card-h">${title}</h3><p class="rm-card-p">${text}</p></div>`;
  return `<div class="rm-cards">
    ${card("share", "Share your link", "Send your link anywhere. Every click, lead and conversion it drives is tracked here.")}
    ${card("book", "Program resources", "Find the assets and copy we provide in the Resources tab so your posts look the part.")}
    ${card("wallet", "Receive earnings", `Earn ${trim(d.settings.commissionPercent)}% on every sale. Request a payout any time once you reach the minimum.`)}
  </div>`;
}

function earnings(d) {
  const t = d.totals;
  const s = d.settings;
  const total = t.upcoming + t.paid;
  const pct = s.minPayout > 0 ? Math.min(100, Math.round((t.available / s.minPayout) * 100)) : 100;

  const orders = d.conversions.slice(0, 20).map((c) => {
    const state = c.status === "paid" ? "Paid" : c.status === "requested" ? "Requested" : "Payable";
    return `<tr><td>${esc(c.orderName || "Order")}</td><td>${new Date(c.createdAt).toLocaleDateString("en-GB")}</td><td class="rm-num">${usd(c.commission)}</td><td>${state}</td></tr>`;
  });

  const a = d.affiliate;
  const hasDetails = Boolean(a.payoutMethod && a.payoutDetails);
  const canRequest = hasDetails && t.available > 0 && t.available >= s.minPayout;
  let hint = "";
  if (!hasDetails) hint = 'Add your payout details in the <a href="#settings" data-goto="settings">Settings tab</a> to get paid.';
  else if (t.available <= 0) hint = "Nothing is available to withdraw yet.";
  else if (t.available < s.minPayout) hint = `You need at least ${usd(s.minPayout)} available to request a payout.`;

  const payBox = `<div class="rm-card rm-pay">
    <div><h3 class="rm-card-h">Available to withdraw</h3><div class="rm-big">${usd(t.available)}</div>
    ${t.requested > 0 ? `<p class="rm-fine">${usd(t.requested)} already requested &middot; waiting to be paid</p>` : ""}
    ${hint ? `<p class="rm-fine">${hint}</p>` : ""}</div>
    <button class="rm-btn" type="button" data-request-payout${canRequest ? "" : " disabled"}>Request payout</button>
  </div>`;

  const history = d.payouts.length
    ? `<h3 class="rm-sub">Payment history</h3><table class="rm-table"><thead><tr><th>Date</th><th>Method</th><th class="rm-num">Amount</th><th>Status</th></tr></thead><tbody>${d.payouts
        .map((p) => {
          const label = p.status === "paid" ? "Paid" : p.status === "rejected" ? "Declined" : "Requested";
          return `<tr><td>${new Date(p.paidAt || p.createdAt).toLocaleDateString("en-GB")}</td><td>${esc(p.method || "-")}</td><td class="rm-num">${usd(p.amount)}</td><td>${label}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : "";

  return `
  ${payBox}
  <dl class="rm-dl rm-dl-lg"><dt>Balance (not yet paid)</dt><dd>${usd(t.upcoming)}</dd><dt>Payable now</dt><dd>${usd(t.available)}</dd><dt>Paid so far</dt><dd>${usd(t.paid)}</dd><dt>Total earned</dt><dd>${usd(total)}</dd></dl>
  <div class="rm-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${s.minPayout}" aria-valuenow="${Math.min(t.available, s.minPayout)}" aria-label="Progress toward the minimum payout"><div style="width:${pct}%"></div></div>
  <p class="rm-fine">${usd(t.available)} of ${usd(s.minPayout)} minimum payout</p>
  ${orders.length
    ? `<table class="rm-table"><thead><tr><th>Order</th><th>Date</th><th class="rm-num">Commission</th><th>Status</th></tr></thead><tbody>${orders.join("")}</tbody></table>`
    : empty("No earnings yet", "Commission from referred orders will appear here.")}
  ${history}`;
}

function contactForm(a) {
  return `<form class="rm-contact" data-profile>
    <p class="rm-card-p">Add your details so we know who to pay. Your dashboard is saved in this browser, so these also let you get your earnings back if it is ever lost.</p>
    <input class="rm-input" name="name" type="text" maxlength="60" placeholder="Your name" value="${esc(a.name || "")}" aria-label="Your name">
    <input class="rm-input" name="email" type="email" maxlength="120" placeholder="Your email" value="${esc(a.email || "")}" aria-label="Your email">
    <button class="rm-btn" type="submit">Save details</button>
  </form>`;
}

function payoutForm(a) {
  const bank = a.payoutMethod === "Bank transfer";
  const lines = {};
  if (bank) for (const l of String(a.payoutDetails || "").split("\n")) { const i = l.indexOf(": "); if (i > 0) lines[l.slice(0, i)] = l.slice(i + 2); }
  const field = (label, name, ph, val, extra = "") =>
    `<label class="rm-field"><span>${label}</span><input class="rm-input" name="${name}" type="text" maxlength="80" placeholder="${ph}" value="${esc(val || "")}" autocomplete="off"${extra}></label>`;
  const opt = (m) => `<option value="${m}"${(a.payoutMethod || "Bank transfer") === m ? " selected" : ""}>${m}</option>`;
  return `<form class="rm-card rm-payform" data-payout>
    <div class="rm-payform-head"><div class="rm-badge">${icon("wallet")}</div><div><h3 class="rm-card-h">Payout details</h3>
    <p class="rm-card-p">Where should we send your earnings? Payments are made by bank transfer.</p></div></div>
    <label class="rm-field"><span>Payout method</span><select class="rm-input" name="method" aria-label="Payout method" data-method>${["Bank transfer", "Other"].map(opt).join("")}</select></label>
    <div data-bank${(a.payoutMethod || "Bank transfer") === "Bank transfer" ? "" : " hidden"}>
      <div class="rm-grid2">
        ${field("Account holder name", "holder", "Full name on the account", lines["Account holder"])}
        ${field("Bank name", "bank", "e.g. Barclays", lines["Bank"])}
        ${field("Sort code / routing number", "code", "e.g. 12-34-56", lines["Sort code / routing"])}
        ${field("Account number / IBAN", "account", "Account number or IBAN", lines["Account number / IBAN"])}
      </div>
    </div>
    <label class="rm-field" data-other${(a.payoutMethod || "Bank transfer") === "Other" ? "" : " hidden"}><span>Payment details</span><textarea class="rm-input" name="other" rows="3" maxlength="300" placeholder="Tell us how you would like to be paid">${esc(!bank ? a.payoutDetails || "" : "")}</textarea></label>
    <p class="rm-fine rm-secure">${icon("lock")}<span>Your details are only visible to the store owner and used solely to pay you.</span></p>
    <button class="rm-btn" type="submit">Save payout details</button>
  </form>`;
}

function settingsTab(d) {
  const a = d.affiliate;
  const s = d.settings;
  return `<dl class="rm-dl rm-dl-lg">
    <dt>Name</dt><dd>${esc(a.name || "—")}</dd>
    <dt>Email</dt><dd>${esc(a.email || "—")}</dd>
    <dt>Referral code</dt><dd>${esc(a.code)}</dd>
    <dt>Commission</dt><dd>${trim(s.commissionPercent)}% for ${esc(s.commissionMonths)} months</dd>
    <dt>Minimum payout</dt><dd>${usd(s.minPayout)}</dd>
  </dl>
  ${d.anonymous ? contactForm(a) : '<p class="rm-fine">Your name and email come from your store account.</p>'}
  ${payoutForm(a)}`;
}

// -------------------------------------------------------------------- page ---

const TABS = (d) => [
  { id: "quickstart", label: "Quickstart", html: quickstart(d) },
  { id: "earnings", label: "Earnings", html: earnings(d) },
  { id: "faq", label: "FAQ", html: d.settings.faq ? faqHtml(d.settings.faq) : empty("No FAQ yet", "Answers to common questions will appear here.") },
  { id: "resources", label: "Resources", html: d.settings.resources ? `<div class="rm-card rm-rte">${richText(d.settings.resources)}</div>` : empty("No resources yet", "Logos, banners and copy will appear here.") },
  { id: "settings", label: "Settings", html: settingsTab(d) },
];

const CSS = `
.rm{--a:#7c3aed;--b:#e0489c;--ink:currentColor;--ink2:rgba(100,100,115,1);--ink3:rgba(110,110,125,1);--bg2:rgba(124,58,237,.04);--line:rgba(124,58,237,.16);--glow:rgba(124,58,237,.10);--opt-bg:#fff;--opt-ink:#16161d;max-width:1040px;margin:0 auto;padding:32px 16px 64px;font-family:inherit;color:inherit;background:radial-gradient(ellipse 70% 380px at 50% 0,var(--glow),transparent 75%) no-repeat}
@supports (color:color-mix(in srgb,red,blue)){.rm{--ink2:color-mix(in srgb,currentColor 75%,transparent);--ink3:color-mix(in srgb,currentColor 58%,transparent)}}
@media (prefers-color-scheme:dark){.rm{--bg2:rgba(255,255,255,.05);--line:rgba(167,139,250,.24);--glow:rgba(124,58,237,.22);--opt-bg:#1c1530;--opt-ink:#f4f0ff}}
:is([data-theme=dark],[data-color-scheme=dark],.dark,.dark-mode,.theme-dark) .rm{--bg2:rgba(255,255,255,.05);--line:rgba(167,139,250,.24);--glow:rgba(124,58,237,.22);--opt-bg:#1c1530;--opt-ink:#f4f0ff}
:is([data-theme=light],[data-color-scheme=light],.light,.light-mode,.theme-light) .rm{--bg2:rgba(124,58,237,.04);--line:rgba(124,58,237,.16);--glow:rgba(124,58,237,.10);--opt-bg:#fff;--opt-ink:#16161d}
.rm *{box-sizing:border-box}
.rm-title{margin:0 0 20px;font-size:1.6rem;font-weight:800;letter-spacing:-.02em;color:inherit}
.rm-i{width:1em;height:1em;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.rm-hero{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:20px;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--bg2)}
.rm-hero-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
.rm-h{margin:0;font-size:.95rem;font-weight:650}
.rm-link{font-size:.82rem;color:var(--ink2)}
.rm-row{display:flex;gap:8px}
.rm-input{flex:1;min-width:0;width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:.92rem}
.rm-input:focus{outline:2px solid var(--a);outline-offset:1px}
textarea.rm-input{resize:vertical}
select.rm-input option{color:var(--opt-ink);background:var(--opt-bg)}
.rm-btn{box-shadow:0 6px 16px -6px rgba(124,58,237,.55);display:inline-flex;align-items:center;gap:7px;flex:none;padding:11px 20px;border:0;border-radius:8px;background:linear-gradient(100deg,var(--a),var(--b));color:#fff;font:inherit;font-size:.92rem;font-weight:600;cursor:pointer}
.rm-btn:hover{opacity:.92}
.rm-btn[disabled]{opacity:.4;cursor:not-allowed}
.rm-btn.is-done{background:#17794f;color:#fff}
.rm-btn-quiet{background:transparent;color:inherit;border:1px solid var(--line)}
.rm-facts{margin-top:14px;padding:14px 16px;border:1px solid var(--line);border-radius:10px}
.rm-fact{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:.88rem;color:var(--ink2)}
.rm-fine{margin:10px 0 0;font-size:.78rem;color:var(--ink3)}
.rm-brand{display:grid;place-items:center;min-height:150px;border-radius:10px;background:linear-gradient(135deg,var(--a),var(--b));color:#fff;font-size:44px}
.rm-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:16px}
.rm-tile{display:flex;flex-direction:column;gap:6px;padding:16px 16px 0;border:1px solid var(--line);border-radius:12px;background:var(--bg2);overflow:hidden}
.rm-tile-label{font-size:.78rem;font-weight:600;color:var(--ink3)}
.rm-tile-value{font-size:1.75rem;line-height:1.1;font-weight:650;font-variant-numeric:tabular-nums}
.rm-rule{height:3px;margin:auto -16px 0;background:linear-gradient(90deg,var(--a),var(--b));opacity:.55}
.rm-dl{display:grid;grid-template-columns:auto auto;gap:4px 12px;margin:2px 0 14px;font-size:.86rem}
.rm-dl dt{color:var(--ink3)}.rm-dl dd{margin:0;justify-self:end;font-weight:600;font-variant-numeric:tabular-nums}
.rm-dl-lg{font-size:1rem;max-width:420px}
.rm-tabs{margin-top:28px}
.rm-tablist{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line)}
.rm-tab{flex:none;display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;background:none;color:var(--ink2);font:inherit;font-size:.9rem;font-weight:600;white-space:nowrap;cursor:pointer}
.rm-tab[aria-selected=true]{color:inherit;border-bottom-color:var(--a)}
.rm-count{min-width:20px;padding:1px 6px;border-radius:999px;background:var(--a);color:#fff;font-size:.72rem;text-align:center}
.rm-panel{padding-top:20px}.rm-panel[hidden]{display:none}
.rm-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.rm-card{padding:20px;margin-bottom:14px;border:1px solid var(--line);border-radius:12px;background:var(--bg2)}
.rm-cards .rm-card{margin:0}
.rm-badge{display:grid;place-items:center;width:40px;height:40px;margin-bottom:14px;border-radius:10px;background:linear-gradient(135deg,var(--a),var(--b));color:#fff;font-size:20px}
.rm-card-h{margin:0 0 6px;font-size:.95rem;font-weight:650}
.rm-card-p{margin:0;font-size:.86rem;line-height:1.5;color:var(--ink2)}
.rm-field{display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600;color:var(--ink2)}.rm-field span{letter-spacing:.01em}
.rm-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:2px}
.rm-payform{display:flex;flex-direction:column;gap:16px;max-width:560px;margin-top:20px}.rm-payform .rm-btn{align-self:flex-start}
.rm-payform-head{display:flex;gap:14px;align-items:center}.rm-payform-head .rm-badge{margin:0;flex:none}
.rm-secure{display:flex;align-items:center;gap:8px;margin:0}
.rm-pill{padding:2px 10px;border-radius:999px;border:1px solid var(--line);font-size:.8rem;font-weight:600}
.rm-pill.is-done{background:#17794f;color:#fff;border-color:transparent}
.rm-meter{height:8px;margin-top:12px;border-radius:999px;background:var(--line);overflow:hidden}
.rm-meter div{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--a),var(--b))}
.rm-table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.9rem}
.rm-table th,.rm-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}
.rm-table th{font-size:.78rem;color:var(--ink3)}.rm-num{text-align:right!important;font-variant-numeric:tabular-nums}
.is-you td{font-weight:650;background:var(--bg2)}
.rm-contact{display:flex;flex-direction:column;gap:10px;max-width:420px;margin-top:8px}.rm-contact .rm-btn{align-self:flex-start}.rm-error{margin:10px 0 0;color:#e5484d;font-size:.86rem}
.rm-pay{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.rm-big{font-size:1.9rem;font-weight:700;font-variant-numeric:tabular-nums}
.rm-sub{margin:24px 0 8px;font-size:1rem;font-weight:650}
.rm-fine a,.rm-card-p a{color:var(--a)}
.rm-faq{padding:14px 18px;margin-bottom:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg2)}
.rm-faq summary{cursor:pointer;font-weight:600}
.rm-rte p{margin:0 0 10px;color:var(--ink2);line-height:1.6}.rm-rte p:last-child{margin:0}
.rm-empty{display:flex;flex-direction:column;gap:4px;padding:28px;border:1px dashed var(--line);border-radius:12px;color:var(--ink2);text-align:center}
.rm-gate{max-width:520px;margin:48px auto;padding:32px;border:1px solid var(--line);border-radius:14px;background:var(--bg2);text-align:center}
.rm-gate .rm-btn{text-decoration:none;justify-content:center;margin-top:12px}
@media (max-width:860px){.rm-hero{grid-template-columns:minmax(0,1fr)}.rm-brand{min-height:90px;order:-1}.rm-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.rm-cards{grid-template-columns:minmax(0,1fr)}@media (max-width:520px){.rm-grid2{grid-template-columns:minmax(0,1fr)}.rm-tiles{grid-template-columns:minmax(0,1fr)}.rm-row{flex-direction:column}.rm-btn{justify-content:center}}
`;

const JS = `
(function () {
  var root = document.querySelector('.rm'); if (!root) return;
  var tabs = [].slice.call(root.querySelectorAll('.rm-tab'));
  var panels = [].slice.call(root.querySelectorAll('.rm-panel'));
  function show(id, focus) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== id; });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.getAttribute('data-tab')); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (n === null) return; e.preventDefault();
      show(tabs[(n + tabs.length) % tabs.length].getAttribute('data-tab'), true);
    });
  });
  var start = (location.hash || '').slice(1);
  show(tabs.some(function (t) { return t.getAttribute('data-tab') === start; }) ? start : tabs[0].getAttribute('data-tab'));

  root.addEventListener('click', function (e) {
    var copy = e.target.closest('[data-copy]');
    if (copy) {
      var input = root.querySelector(copy.getAttribute('data-copy')); input.select();
      var done = function () {
        var label = copy.querySelector('span'); label.textContent = 'Copied'; copy.classList.add('is-done');
        setTimeout(function () { label.textContent = 'Copy'; copy.classList.remove('is-done'); }, 2000);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(input.value).then(done);
      else { try { document.execCommand('copy'); } catch (x) {} done(); }
      return;
    }
  });

  var payout = root.querySelector('[data-payout]');
  if (payout) payout.addEventListener('submit', function (e) {
    e.preventDefault(); var f = payout.elements; if (f.method.value === 'Bank transfer' && (!f.holder.value.trim() || !f.account.value.trim())) { var er = root.querySelector('[data-error]'); er.textContent = 'Enter the account holder name and account number.'; er.hidden = false; return; }
    var d = f.method.value === 'Bank transfer' ? ['Account holder: ' + f.holder.value.trim(), 'Bank: ' + f.bank.value.trim(), 'Sort code / routing: ' + f.code.value.trim(), 'Account number / IBAN: ' + f.account.value.trim()].join('\\n') : f.other.value; post({ intent: 'savePayout', method: f.method.value, details: d });
  });
  var methodSel = root.querySelector('[data-method]');
  if (methodSel) methodSel.addEventListener('change', function () {
    var bank = methodSel.value === 'Bank transfer';
    root.querySelector('[data-bank]').hidden = !bank; root.querySelector('[data-other]').hidden = bank;
  });
  var reqBtn = root.querySelector('[data-request-payout]');
  if (reqBtn) reqBtn.addEventListener('click', function () {
    if (!reqBtn.disabled && confirm('Request a payout of everything available?')) post({ intent: 'requestPayout' });
  });
  root.addEventListener('click', function (e) {
    var go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); show(go.getAttribute('data-goto')); }
  });

  var profile = root.querySelector('[data-profile]');
  if (profile) profile.addEventListener('submit', function (e) {
    e.preventDefault(); post({ intent: 'saveProfile', name: profile.elements.name.value, email: profile.elements.email.value });
  });

  function post(fields) {
    var body = new URLSearchParams(fields), err = root.querySelector('[data-error]');
    fetch(location.pathname + location.search, { method: 'POST', headers: { Accept: 'application/json' }, body: body })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        location.reload();
      })
      .catch(function () { err.textContent = 'Something went wrong. Please try again.'; err.hidden = false; });
  }
})();
`;

const shell = (inner) => `{% raw %}<style>${CSS}</style>{% endraw %}<main class="rm">${inner}</main>`;

// Visitor is not logged in. The dashboard still opens straight away: this tiny page
// gives their browser a random id (kept in localStorage) and reloads the dashboard with
// it as ?vid=, which is how the server tells visitors apart. Shopify's proxy signature
// covers query parameters the browser adds, so ?vid= arrives intact.
// Login gate. The storefront login keeps the signed-in user in localStorage
// (tt-uid, tt-email). No tt-uid -> not logged in -> send them to /pages/login.
// The dashboard is also keyed to tt-uid, so if ?vid= is missing or differs
// (e.g. another account logged in on this browser) reload with the right one.
// The page stays hidden until the check passes.
const GUARD = `
(function () {
  var uid = '', email = '';
  try { uid = localStorage.getItem('tt-uid') || ''; email = localStorage.getItem('tt-email') || ''; } catch (e) {}
  if (!/^[A-Za-z0-9]{16,64}$/.test(uid) || !email) {
    location.replace('/pages/login?return_to=' + encodeURIComponent(location.pathname));
    return;
  }
  var vid = new URLSearchParams(location.search).get('vid');
  if (vid !== uid) {
    location.replace(location.pathname + '?vid=' + uid + (location.hash || ''));
    return;
  }
  var m = document.querySelector('main.rm');
  if (m) m.style.visibility = 'visible';
})();
`;

const guarded = (inner) =>
  `{% raw %}<style>main.rm{visibility:hidden}</style>{% endraw %}` +
  shell(inner) +
  `{% raw %}<script>${GUARD}</script>{% endraw %}`;

export function renderBootstrap() {
  return guarded(`<h1 class="rm-title">Referral dashboard</h1><p class="rm-card-p">Loading your dashboard&hellip;</p>
    <noscript><p class="rm-card-p">Please turn on JavaScript to see your referral dashboard.</p></noscript>`);
}

export function renderDisabled() {
  return shell(`<h1 class="rm-title">Referral dashboard</h1>
    <div class="rm-gate"><strong>The referral program is paused</strong>
    <p class="rm-card-p">Please check back later.</p></div>`);
}

export function renderDashboard(d) {
  cur = d.settings.currency || "£";
  const link = referralUrl(d.affiliate.shop, d.affiliate.code);
  const tabs = TABS(d);
  return (
    guarded(`
  <h1 class="rm-title">Referral dashboard</h1>
  ${hero(d, link)}
  ${tiles(d)}
  <p class="rm-error" data-error hidden role="alert"></p>
  <div class="rm-tabs">
    <div class="rm-tablist" role="tablist">
      ${tabs
        .map((t) => `<button class="rm-tab" type="button" role="tab" data-tab="${t.id}" aria-selected="false">${t.label}${t.badge ? ` <span class="rm-count">${t.badge}</span>` : ""}</button>`)
        .join("")}
    </div>
    ${tabs.map((t) => `<div class="rm-panel" role="tabpanel" data-panel="${t.id}" hidden>${t.html}</div>`).join("")}
  </div>`) + `{% raw %}<script>${JS}</script>{% endraw %}`
  );
}
