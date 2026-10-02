/**
 * Customer journey emails: the thank-you email after payment, and one
 * progress email per customer step. Pure functions (no `@/` imports) so they
 * can be unit tested and rendered to PNG with dummy data.
 *
 * Email-safe HTML: nested role="presentation" tables, inline styles, bgcolor
 * attributes, a 600px Outlook ghost table, a VML button for Outlook, the web
 * font hidden from Outlook, a hidden preheader with mso-hide, and dark-mode
 * overrides for Outlook ([data-ogsb]/[data-ogsc]). Every email also has a
 * plain-text part. No card data, ever: Stripe sends the receipt.
 */
import {
  CONTACT_EMAIL,
  CUSTOMER_STEPS,
  CUSTOMER_STEP_COUNT,
  customerStepNumber,
  stepLabel,
  type CustomerStep,
} from "../journey.ts";
import { MONTHLY_START_LATEST_DAYS } from "../catalog.ts";

const C = {
  bg: "#0a0b0a",
  card: "#141614",
  card2: "#1b1d1b",
  line: "#2a2c29",
  fg: "#eeeee8",
  muted: "#8b8d86",
  subtle: "#84867f",
  ring: "#6a6c66",
  connector: "#3a3c39",
  ok: "#8fbf9a",
  amber: "#d9a24b",
  ink: "#0a0b0a",
};
const SANS = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace";
const SITE = "https://www.forecourt.me";
const LOGO = `${SITE}/mark.png?v=3`;

export const EMAIL_FROM = `Matt at Forecourt <${CONTACT_EMAIL}>`;
export const EMAIL_REPLY_TO = CONTACT_EMAIL;

export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function gbp(pence: number) {
  const pounds = pence / 100;
  return `£${pounds.toLocaleString("en-GB", { minimumFractionDigits: pounds % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function safeUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- building blocks

function shell({ title, preheader, rows }: { title: string; preheader: string; rows: string }) {
  // Spacer characters stop the body text leaking into the inbox preview.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(80);
  return `<!doctype html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,div,p,a,span,h1,h2{font-family:Arial,sans-serif!important}</style><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet"><!--<![endif]-->
<style>
  :root{color-scheme:dark;supported-color-schemes:dark}
  body{margin:0;padding:0;background:${C.bg};}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}
  [data-ogsb] .cta-td{background-color:${C.amber}!important}
  [data-ogsc] .cta-a{color:${C.ink}!important}
  [data-ogsb] .bg-body{background-color:${C.bg}!important}
  [data-ogsb] .bg-card{background-color:${C.card}!important}
  @media (max-width:480px){
    .px{padding-left:20px!important;padding-right:20px!important}
    .h1{font-size:26px!important;line-height:32px!important}
    .cta-a{display:block!important;text-align:center!important}
    .stack{display:block!important;width:100%!important}
    .stack-gap{padding:10px 0 0!important}
  }
</style>
</head>
<body class="bg-body" bgcolor="${C.bg}" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.bg};">${esc(preheader)}${spacer}</div>
<table role="presentation" class="bg-body" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px 48px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="bg-body" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="width:100%;max-width:600px;background:${C.bg};">
${rows}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

function header(eyebrow: string) {
  return `<tr><td class="px" style="padding:8px 32px 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle"><img src="${LOGO}" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px;border-radius:7px;"></td>
    <td valign="middle" style="padding-left:10px;font-family:${SANS};font-size:16px;font-weight:600;color:${C.fg};">Forecourt</td>
    <td valign="middle" style="padding-left:12px;font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${C.subtle};">${esc(eyebrow)}</td>
  </tr></table>
</td></tr>`;
}

function h1(text: string) {
  return `<h1 class="h1" style="margin:0;font-family:${SANS};font-size:30px;line-height:36px;font-weight:600;letter-spacing:-0.02em;color:${C.fg};">${esc(text)}</h1>`;
}

function h2(text: string, top = 0) {
  return `<h2 style="margin:${top}px 0 0;font-family:${SANS};font-size:20px;line-height:26px;font-weight:600;color:${C.fg};">${esc(text)}</h2>`;
}

function p(html: string, { size = 16, color = C.muted, top = 12 } = {}) {
  const lh = size >= 16 ? 25 : size >= 14 ? 21 : 18;
  return `<p style="margin:${top}px 0 0;font-family:${SANS};font-size:${size}px;line-height:${lh}px;color:${color};">${html}</p>`;
}

function label(text: string, color = C.ok) {
  return `<div style="font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:0.14em;text-transform:uppercase;color:${color};">${esc(text)}</div>`;
}

/** Bulletproof amber button: VML roundrect for Outlook, a padded link elsewhere. */
function primaryButton(href: string, text: string) {
  const width = Math.max(200, Math.round(text.length * 8.6 + 56));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="cta-td" bgcolor="${C.amber}" style="border-radius:999px;background:${C.amber};">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="50%" strokecolor="${C.amber}" fillcolor="${C.amber}"><w:anchorlock/><center style="color:${C.ink};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(text)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="cta-a" href="${esc(href)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:${C.amber};color:${C.ink};font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;">${esc(text)}</a><!--<![endif]-->
</td></tr></table>`;
}

/** Secondary: an outlined link. Outlook shows it as a plain underlined link, which is fine. */
function ghostButton(href: string, text: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;border:1px solid ${C.ring};">
<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;color:${C.fg};font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;">${esc(text)}</a>
</td></tr></table>`;
}

function buttonsRow(...cells: string[]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells
    .map((c, i) => `<td class="stack${i ? " stack-gap" : ""}" valign="middle" style="padding:${i ? "0 0 0 10px" : "0"};">${c}</td>`)
    .join("")}</tr></table>`;
}

function card(inner: string, pad = "24px") {
  return `<table role="presentation" class="bg-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;"><tr><td class="px" style="padding:${pad};">${inner}</td></tr></table>`;
}

function row(inner: string, top = 24) {
  return `<tr><td class="px" style="padding:${top}px 32px 0;">${inner}</td></tr>`;
}

function ticks(lines: string[], color = C.fg) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${lines
    .map(
      (t) =>
        `<tr><td valign="top" style="padding:4px 10px 4px 0;font-family:${SANS};font-size:14px;line-height:21px;color:${C.ok};">&#10003;</td><td style="padding:4px 0;font-family:${SANS};font-size:14px;line-height:21px;color:${color};">${esc(t)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Six segments drawn as td cells (no div heights), with a text label. */
function progressBar(n: number) {
  const cells = CUSTOMER_STEPS.map((s, i) => {
    const bg = s.n < n ? C.ok : s.n === n ? C.amber : C.ring;
    const gap = i ? `<td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td>` : "";
    return `${gap}<td height="6" bgcolor="${bg}" style="height:6px;background:${bg};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>`;
  }).join("");
  const step = CUSTOMER_STEPS[n - 1]!;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
<div style="margin-top:10px;font-family:${MONO};font-size:12px;line-height:18px;color:${C.muted};">${esc(stepLabel(step))}: <span style="color:${C.fg};">${esc(step.title)}</span></div>`;
}

function tag(text: string, kind: "now" | "next" | "done") {
  const style =
    kind === "now"
      ? `background:${C.amber};color:${C.ink};`
      : kind === "next"
        ? `background:${C.card2};color:${C.fg};border:1px solid ${C.ring};`
        : `color:${C.ok};`;
  return `<span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;${style}font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:0.12em;text-transform:uppercase;vertical-align:2px;">${esc(text)}</span>`;
}

/** Vertical timeline for the thank-you email. `at` = the current step number. */
function timeline(at: number) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">${CUSTOMER_STEPS.map(
    (s) => {
      const done = s.n < at;
      const current = s.n === at;
      const last = s.n === CUSTOMER_STEP_COUNT;
      const dot = done
        ? `<td colspan="3" width="26" height="26" align="center" valign="middle" bgcolor="${C.ok}" style="width:26px;height:26px;border-radius:13px;background:${C.ok};font-family:${SANS};font-size:14px;font-weight:700;color:${C.ink};line-height:26px;">&#10003;</td>`
        : current
          ? `<td colspan="3" width="26" height="26" align="center" valign="middle" bgcolor="${C.amber}" style="width:26px;height:26px;border-radius:13px;background:${C.amber};font-family:${SANS};font-size:12px;font-weight:700;color:${C.ink};line-height:26px;">${s.n}</td>`
          : `<td colspan="3" width="26" height="26" align="center" valign="middle" bgcolor="${C.bg}" style="width:22px;height:22px;border-radius:13px;background:${C.bg};border:2px solid ${C.ring};font-family:${SANS};font-size:12px;font-weight:600;color:${C.muted};line-height:22px;">${s.n}</td>`;
      const lineColour = last ? C.bg : done ? C.ok : C.connector;
      const tagHtml = current ? tag("Next", "now") : done ? tag("Done", "done") : "";
      return `<tr>
  ${dot}
  <td valign="middle" style="padding:0 0 0 14px;font-family:${SANS};font-size:16px;line-height:22px;font-weight:600;color:${done ? C.muted : C.fg};">${esc(s.title)}${tagHtml}</td>
</tr>
<tr>
  <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
  <td width="2" bgcolor="${lineColour}" style="width:2px;background:${lineColour};font-size:0;line-height:0;">&nbsp;</td>
  <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
  <td valign="top" style="padding:2px 0 ${last ? 0 : 18}px 14px;">
    <div style="font-family:${MONO};font-size:12px;line-height:18px;color:${C.subtle};">${esc(s.when)}</div>
    ${done ? "" : `<div style="margin-top:4px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.muted};">${esc(s.line)}</div>`}
  </td>
</tr>`;
    },
  ).join("\n")}</table>`;
}

function contactCard() {
  return card(`
  ${h2("Talk to a real person")}
  ${p(`Just reply to this email, or write to <a href="mailto:${CONTACT_EMAIL}" style="color:${C.fg};text-decoration:underline;">${CONTACT_EMAIL}</a>. We usually answer the same working day.`, { size: 14, top: 6 })}`);
}

function signoff(line: string) {
  return `<tr><td class="px" style="padding:28px 32px 0;font-family:${SANS};font-size:16px;line-height:24px;color:${C.fg};">
  ${esc(line)}<br>
  <span style="font-weight:600;">Matt Girvan</span><br>
  <span style="font-size:14px;color:${C.muted};">Founder, Forecourt</span>
</td></tr>`;
}

function footer(reason: string, receipt: boolean) {
  return `<tr><td class="px" style="padding:32px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${C.line}" style="height:1px;background:${C.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>
  <div style="margin-top:18px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.subtle};">
    ${esc(reason)}${receipt ? " Your Stripe receipt is sent separately." : ""}<br>
    Matthew Girvan, trading as Forecourt · <a href="${SITE}" style="color:${C.subtle};">forecourt.me</a> · <a href="${SITE}/terms" style="color:${C.subtle};">Terms</a> · <a href="${SITE}/privacy" style="color:${C.subtle};">Privacy</a>
  </div>
</td></tr>`;
}

function textFooter(reason: string, receipt: boolean) {
  return [
    "",
    "Talk to a real person: reply to this email, or write to " + CONTACT_EMAIL + ".",
    "",
    "--",
    reason + (receipt ? " Your Stripe receipt is sent separately." : ""),
    "Matthew Girvan, trading as Forecourt · forecourt.me",
  ];
}

// ---------------------------------------------------------------- thank you

export type PaymentKind = "subscription" | "trial" | "convert";

export type ThankYouData = {
  firstName?: string | null;
  dealer: string;
  planName: string;
  kind: PaymentKind;
  /** What Stripe took today, in pence. */
  paidPence: number;
  /** The monthly plan, in pence. */
  monthlyPence: number;
  /** True when the first month was charged today (a site already live). */
  monthlyChargedToday: boolean;
  bookUrl: string;
  accountUrl: string;
  /** Internal tenants.stage at payment. Shapes the trial conversion email. */
  stage?: string | null;
};

function paidLine(d: ThankYouData) {
  if (d.kind === "trial") {
    return {
      html: `Today you paid <span style="color:${C.fg};">${gbp(d.paidPence)}</span> for your 60-day trial. If you stay, it comes off the setup.`,
      text: `Today you paid ${gbp(d.paidPence)} for your 60-day trial. If you stay, it comes off the setup.`,
    };
  }
  if (d.monthlyChargedToday) {
    return {
      html: `Today you paid <span style="color:${C.fg};">${gbp(d.paidPence)}</span>: the one-off setup and your first month. Your monthly plan of ${gbp(d.monthlyPence)} carries on from today.`,
      text: `Today you paid ${gbp(d.paidPence)}: the one-off setup and your first month. Your monthly plan of ${gbp(d.monthlyPence)} carries on from today.`,
    };
  }
  const what = d.kind === "convert" ? "the remaining one-off setup" : "the one-off setup";
  return {
    html: `Today you paid <span style="color:${C.fg};">${gbp(d.paidPence)}</span> for ${what}. The ${gbp(d.monthlyPence)} a month starts on your go live day, or ${MONTHLY_START_LATEST_DAYS} days after payment if that comes first.`,
    text: `Today you paid ${gbp(d.paidPence)} for ${what}. The ${gbp(d.monthlyPence)} a month starts on your go live day, or ${MONTHLY_START_LATEST_DAYS} days after payment if that comes first.`,
  };
}

/** A paid trial staying on: short, no new-customer onboarding. */
function convertThankYouEmail(d: ThankYouData): RenderedEmail {
  const first = (d.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const subject = first ? `You're staying. Thank you, ${first}` : "You're staying. Thank you";
  const preheader = "Your trial is now a full plan. Here is what you paid and when the monthly plan starts.";
  const step = customerStepNumber(d.stage);
  const isLive = step >= CUSTOMER_STEP_COUNT;
  // Kickoff is step 2: before it is done, the call is still the next thing.
  const needsKickoff = step <= 2;
  const paid = d.monthlyChargedToday
    ? {
        html: `Today you paid <span style="color:${C.fg};">${gbp(d.paidPence)}</span>: the remaining setup and your first month. Your monthly plan of ${gbp(d.monthlyPence)} carries on from today, on the same date each month.`,
        text: `Today you paid ${gbp(d.paidPence)}: the remaining setup and your first month. Your monthly plan of ${gbp(d.monthlyPence)} carries on from today, on the same date each month.`,
      }
    : {
        html: `Today you paid <span style="color:${C.fg};">${gbp(d.paidPence)}</span> for the remaining setup. The ${gbp(d.monthlyPence)} a month starts on your go live day, or ${MONTHLY_START_LATEST_DAYS} days after payment if that comes first.`,
        text: `Today you paid ${gbp(d.paidPence)} for the remaining setup. The ${gbp(d.monthlyPence)} a month starts on your go live day, or ${MONTHLY_START_LATEST_DAYS} days after payment if that comes first.`,
      };
  const intro = `Your 60-day trial for ${d.dealer} is now a full ${d.planName} plan. The trial fee came off the setup.`;
  const nextLine = isLive
    ? "Your desk stays live and nothing changes for your team. Same web address, same sign in."
    : needsKickoff
      ? "Next, pick a time for your kickoff call: 30 minutes on a video call, at a time that suits you."
      : "Nothing changes on your build. We carry on from where you are, and email you as each step moves.";
  const reason = `You are getting this because ${d.dealer} moved from the trial to a Forecourt plan.`;
  const rows = `
${header(d.planName)}
${row(`${h1(first ? `You're staying. Thank you, ${first}.` : "You're staying. Thank you.")}
  ${p(esc(intro))}`, 0)}
${row(
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:14px 16px;border:1px solid ${C.line};border-radius:14px;">
  ${label("Paid today", C.subtle)}
  ${p(paid.html, { size: 14, top: 4 })}
  </td></tr></table>`,
  20,
)}
${row(
  card(
    `${label(isLive ? "Your desk" : "What happens next")}
  ${p(esc(nextLine), { size: 14, top: 6 })}
  ${needsKickoff ? `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>${primaryButton(d.bookUrl, "Book your kickoff call")}` : ""}`,
  ),
  16,
)}
${!isLive && step > 0 ? row(`${h2("Where your desk is")}
  <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
  ${timeline(step)}`, 28) : ""}
${row(contactCard(), 16)}
${row(ghostButton(d.accountUrl, "Open your account"), 20)}
${signoff("Thanks for staying,")}
${footer(reason, true)}`;

  const text = [
    first ? `You're staying. Thank you, ${first}.` : "You're staying. Thank you.",
    "",
    intro,
    "",
    "PAID TODAY",
    paid.text,
    "",
    isLive ? "YOUR DESK" : "WHAT HAPPENS NEXT",
    nextLine,
    ...(needsKickoff ? [`Book your kickoff call: ${d.bookUrl}`] : []),
    ...(!isLive && step > 0
      ? ["", "WHERE YOUR DESK IS", ...CUSTOMER_STEPS.map((s) => `${s.n}. ${s.title}${s.n < step ? ": done" : s.n === step ? ": next" : ""}`)]
      : []),
    "",
    `Your account: ${d.accountUrl}`,
    "",
    "Thanks for staying,",
    "Matt Girvan",
    "Founder, Forecourt",
    ...textFooter(reason, true),
  ].join("\n");

  return { subject, preheader, html: shell({ title: subject, preheader, rows }), text };
}

export function thankYouEmail(d: ThankYouData): RenderedEmail {
  if (d.kind === "convert") return convertThankYouEmail(d);
  const first = (d.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const subject = first ? `Thanks, ${first}. Next step: book your kickoff call` : "Thank you. Next step: book your kickoff call";
  const preheader = "Pick a 30 minute slot. Here is what happens from today to going live.";
  const paid = paidLine(d);
  const cover = [
    "Who uses it, and what each person sees",
    "Your logo, colours and web address",
    "How your stock comes in: spreadsheet or live feed",
    "What your customers see in the customer view",
  ];
  const bring = [
    "Your logo, any format",
    "A list of staff who will use it, and their roles",
    "A recent stock export, the same sheet you already use",
  ];
  const reason = `You are getting this because ${d.dealer} bought a Forecourt package.`;
  const rows = `
${header(d.planName)}
${row(`${h1(first ? `Thank you, ${first}.` : "Thank you.")}
  ${p(`We have your order for ${esc(d.dealer)}, and we will look after your setup from here.`)}`, 0)}
${row(
  card(
    `${label("First step")}
  ${h2("First, pick a time for your kickoff call", 8)}
  ${p("30 minutes on a video call, at a time that suits you.", { size: 14, top: 6 })}
  <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
  ${primaryButton(d.bookUrl, "Book your kickoff call")}
  ${p("No time that works? Reply with a couple of options and we will send an invite.", { size: 14, color: C.subtle, top: 12 })}
  <div style="margin-top:16px;font-family:${SANS};font-size:14px;line-height:21px;font-weight:600;color:${C.fg};">On the call we will agree</div>
  ${ticks(cover)}`,
  ),
  20,
)}
${row(
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:14px 16px;border:1px solid ${C.line};border-radius:14px;">
  ${label("Paid today", C.subtle)}
  ${p(paid.html, { size: 14, top: 4 })}
  </td></tr></table>`,
  16,
)}
${row(`${h2("From today to going live")}
  ${p("We will email you each time your desk moves on to the next step.", { size: 14, top: 6 })}
  <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
  ${timeline(2)}`, 32)}
${row(
  card(`${h2("Handy to have for the call")}
  ${ticks(bring, C.muted)}
  ${p("Do not worry if you have not got everything. We can sort it on the call.", { size: 14, color: C.subtle, top: 8 })}`),
  28,
)}
${row(contactCard(), 16)}
${row(ghostButton(d.accountUrl, "Open your account"), 20)}
${signoff("Thanks again,")}
${footer(reason, true)}`;

  const text = [
    first ? `Thank you, ${first}.` : "Thank you.",
    "",
    `We have your order for ${d.dealer}, and we will look after your setup from here.`,
    "",
    "FIRST STEP: pick a time for your kickoff call",
    "30 minutes on a video call, at a time that suits you.",
    `Book your kickoff call: ${d.bookUrl}`,
    "No time that works? Reply with a couple of options and we will send an invite.",
    "",
    "On the call we will agree:",
    ...cover.map((c) => `- ${c}`),
    "",
    "PAID TODAY",
    paid.text,
    "",
    "FROM TODAY TO GOING LIVE",
    ...CUSTOMER_STEPS.map((s) => `${s.n}. ${s.title} (${s.when})${s.n === 1 ? ": done" : s.n === 2 ? ": next" : ""}`),
    "",
    "Handy to have for the call:",
    ...bring.map((b) => `- ${b}`),
    "",
    `Your account: ${d.accountUrl}`,
    "",
    "Thanks again,",
    "Matt Girvan",
    "Founder, Forecourt",
    ...textFooter(reason, true),
  ].join("\n");

  return { subject, preheader, html: shell({ title: subject, preheader, rows }), text };
}

// ---------------------------------------------------------------- progress

export type ProgressData = {
  firstName?: string | null;
  dealer: string;
  /** Internal tenants.stage the site just moved to. */
  stage: string;
  previewUrl?: string | null;
  domain?: string | null;
  monthlyPence?: number | null;
  /** True when monthly billing started in Stripe as part of going live. */
  monthlyStartsToday?: boolean;
  bookUrl: string;
  accountUrl: string;
};

type StepCopy = {
  subject: (d: ProgressData) => string;
  preheader: string;
  headline: string;
  intro: (first: string, dealer: string) => string;
  nowNote: string;
  extra?: (d: ProgressData) => { title: string; html: string; text: string } | null;
  cta: (d: ProgressData) => { href: string; text: string };
  signoff: string;
};

const PROGRESS: Record<number, StepCopy> = {
  2: {
    subject: () => "Your kickoff call is next",
    preheader: "Pick a 30 minute slot if you have not already. Here is what we will cover.",
    headline: "Next up: your kickoff call.",
    intro: (first, dealer) => `${first ? `Hi ${first}, we` : "We"} are ready to plan the desk for ${dealer} with you.`,
    nowNote: "If you have not booked yet, pick any 30 minute slot that suits you.",
    cta: (d) => ({ href: d.bookUrl, text: "Book your kickoff call" }),
    signoff: "Speak soon,",
  },
  3: {
    subject: () => "We're setting up your Forecourt desk",
    preheader: "Thanks for the call. Nothing needed from you for the setup. Your preview comes next.",
    headline: "We're setting up your desk.",
    intro: (first, dealer) => `Thanks for your time on the call${first ? `, ${first}` : ""}. We have what we need, so the setup for ${dealer} has started.`,
    nowNote: "Nothing needed from you for the setup.",
    extra: (d) => {
      const host = (d.domain ?? "").trim();
      return {
        title: "One thing to get ahead on",
        html: `When you go live, your IT person or web provider adds one DNS record${host ? ` for <span style="color:${C.fg};">${esc(host)}</span>` : ""}. We will send the exact details with your preview, so it is worth letting them know it is coming.`,
        text: `When you go live, your IT person or web provider adds one DNS record${host ? ` for ${host}` : ""}. We will send the exact details with your preview, so it is worth letting them know it is coming.`,
      };
    },
    cta: (d) => ({ href: d.accountUrl, text: "See progress in your account" }),
    signoff: "Speak soon,",
  },
  4: {
    subject: () => "Your Forecourt preview is ready to try",
    preheader: "Have a look with your team and tell us what to change. Web address details are inside.",
    headline: "Your preview is ready.",
    intro: (first, dealer) => `${first ? `${first}, here` : "Here"} is the desk for ${dealer}, with your name, colours and stock. Have a click around with your team.`,
    nowNote: "Tell us anything you would like changed. Just reply to this email.",
    extra: (d) => {
      const host = (d.domain ?? "").trim();
      return {
        title: "Your web address",
        html: `To go live${host ? ` on <span style="color:${C.fg};">${esc(host)}</span>` : ""}, your IT person or web provider adds one DNS record. We will send the exact record to you separately and check it with you before anything switches over.`,
        text: `To go live${host ? ` on ${host}` : ""}, your IT person or web provider adds one DNS record. We will send the exact record to you separately and check it with you before anything switches over.`,
      };
    },
    cta: (d) => {
      const url = safeUrl(d.previewUrl);
      return url ? { href: url, text: "Open your preview" } : { href: d.accountUrl, text: "See your preview in your account" };
    },
    signoff: "Speak soon,",
  },
  5: {
    subject: () => "Testing your Forecourt desk",
    preheader: "Use it on real days with your team. Tell us anything that needs changing.",
    headline: "Testing starts now.",
    intro: (first, dealer) => `${first ? `${first}, it` : "It"} is time for the team at ${dealer} to use the desk on real days.`,
    nowNote: "Use it as you normally would, and send us anything that feels off. We will tidy it up before you go live.",
    cta: (d) => {
      const url = safeUrl(d.previewUrl);
      return url ? { href: url, text: "Open your desk" } : { href: d.accountUrl, text: "Open your account" };
    },
    signoff: "Speak soon,",
  },
  6: {
    subject: (d) => `${d.dealer} is live on Forecourt`,
    preheader: "Your web address is live. Here is how your team signs in.",
    headline: "You're live.",
    intro: (first, dealer) => `${first ? `Congratulations, ${first}. ` : ""}The desk for ${dealer} is live, and your team can sign in today.`,
    nowNote: "The code goes to their work email, so there are no passwords to remember. If anyone gets stuck, reply to this email.",
    extra: (d) =>
      d.monthlyStartsToday
        ? {
            title: "Your monthly plan starts today",
            html: `Your monthly plan${d.monthlyPence ? ` of <span style="color:${C.fg};">${gbp(d.monthlyPence)}</span>` : ""} starts today, the day your desk went live. Stripe sends the receipt separately, then the same date each month.`,
            text: `Your monthly plan${d.monthlyPence ? ` of ${gbp(d.monthlyPence)}` : ""} starts today, the day your desk went live. Stripe sends the receipt separately, then the same date each month.`,
          }
        : null,
    cta: (d) => {
      const url = safeUrl(d.domain);
      return url ? { href: url, text: "Open your desk" } : { href: d.accountUrl, text: "Open your account" };
    },
    signoff: "Thanks for choosing Forecourt,",
  },
};

/** True when there is a progress email for this internal stage. */
export function hasProgressEmail(stage: string) {
  return Boolean(PROGRESS[customerStepNumber(stage)]);
}

export function progressEmail(d: ProgressData): RenderedEmail | null {
  const n = customerStepNumber(d.stage);
  const copy = PROGRESS[n];
  if (!copy) return null;
  const step = CUSTOMER_STEPS[n - 1]! as CustomerStep;
  // The live email is sent on the day, so its timescale is simply today.
  const nowWhen = n === CUSTOMER_STEP_COUNT ? "Today" : step.when;
  const next = n < CUSTOMER_STEP_COUNT ? CUSTOMER_STEPS[n]! : null;
  const first = (d.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const subject = copy.subject(d);
  const preheader = copy.preheader;
  const extra = copy.extra?.(d) ?? null;
  const cta = copy.cta(d);
  const intro = copy.intro(first, d.dealer);
  const reason = `You are getting this because ${d.dealer} has a Forecourt desk ${n === CUSTOMER_STEP_COUNT ? "" : "in progress"}`.trim() + ".";
  const secondary = cta.href === d.bookUrl ? ghostButton(d.accountUrl, "Open your account") : ghostButton(d.bookUrl, "Book a call");

  const rows = `
${header(`${d.dealer} · Update`)}
${row(`${h1(copy.headline)}
  ${p(esc(intro))}`, 0)}
${row(progressBar(n), 24)}
${row(
  card(`${label("Now", C.amber)}
  ${h2(step.title, 6)}
  <div style="margin-top:4px;font-family:${MONO};font-size:12px;line-height:18px;color:${C.subtle};">${esc(nowWhen)}</div>
  ${p(esc(step.line), { size: 14, top: 8 })}
  ${p(esc(copy.nowNote), { size: 14, color: C.fg, top: 8 })}
  ${
    next
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td height="1" bgcolor="${C.line}" style="height:1px;background:${C.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>
  <div style="margin-top:14px;">${label("Next", C.subtle)}</div>
  <div style="margin-top:4px;font-family:${SANS};font-size:16px;line-height:22px;font-weight:600;color:${C.fg};">${esc(next.title)}</div>
  <div style="margin-top:2px;font-family:${MONO};font-size:12px;line-height:18px;color:${C.subtle};">${esc(next.when)}</div>`
      : ""
  }
  <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
  ${buttonsRow(primaryButton(cta.href, cta.text), secondary)}`),
  24,
)}
${extra ? row(card(`${h2(extra.title)}${p(extra.html, { size: 14, top: 6 })}`), 16) : ""}
${row(contactCard(), 16)}
${signoff(copy.signoff)}
${footer(reason, false)}`;

  const text = [
    copy.headline,
    "",
    intro,
    "",
    `${stepLabel(step)}: ${step.title}`,
    "",
    `NOW: ${step.title} (${nowWhen})`,
    step.line,
    copy.nowNote,
    ...(next ? ["", `NEXT: ${next.title} (${next.when})`] : []),
    "",
    `${cta.text}: ${cta.href}`,
    ...(cta.href === d.bookUrl ? [] : [`Book a call: ${d.bookUrl}`]),
    ...(extra ? ["", `${extra.title}:`, extra.text] : []),
    "",
    copy.signoff,
    "Matt Girvan",
    "Founder, Forecourt",
    ...textFooter(reason, false),
  ].join("\n");

  return { subject, preheader, html: shell({ title: subject, preheader, rows }), text };
}

// ---------------------------------------------------------------- balance link

export type BalanceLinkData = {
  firstName: string | null | undefined;
  dealer: string;
  amountPence: number;
  payUrl: string;
  accountUrl: string;
};

/** Staff chose to send a payment link for a balance owed. Sent only when staff click Send. */
export function balanceLinkEmail(d: BalanceLinkData): RenderedEmail {
  const first = (d.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const amount = gbp(d.amountPence);
  const subject = `Your Forecourt balance: ${amount}`;
  const preheader = `A secure Stripe link to pay the ${amount} balance on ${d.dealer}.`;
  const hello = first ? `Hi ${first},` : "Hi,";
  const intro = `Your order for ${d.dealer} is back on track. There is a balance of ${amount} to pay. The link below takes you to Stripe to pay it securely. It works for 23 hours; reply if you need a new one.`;
  const pay = safeUrl(d.payUrl) ?? d.accountUrl;
  const reason = `You are getting this because ${d.dealer} has a Forecourt desk in progress.`;
  const rows = `
${header(`${d.dealer} · Balance`)}
${row(`${h1(`${amount} to pay`)}
  ${p(esc(hello))}
  ${p(esc(intro))}`, 0)}
${row(card(`${label("Balance", C.amber)}
  ${h2(amount, 6)}
  ${p("Paid once, by card through Stripe. Nothing is taken until you pay.", { size: 14, top: 8 })}
  <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
  ${buttonsRow(primaryButton(pay, `Pay ${amount}`), ghostButton(d.accountUrl, "Open your account"))}`), 24)}
${row(contactCard(), 16)}
${signoff("Thanks,")}
${footer(reason, true)}`;
  const text = [
    `${amount} to pay`,
    "",
    hello,
    "",
    intro,
    "",
    `Pay ${amount}: ${pay}`,
    `Open your account: ${d.accountUrl}`,
    "",
    "Thanks,",
    "Matt Girvan",
    "Founder, Forecourt",
    ...textFooter(reason, true),
  ].join("\n");
  return { subject, preheader, html: shell({ title: subject, preheader, rows }), text };
}
