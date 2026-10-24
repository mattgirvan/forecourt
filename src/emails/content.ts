/**
 * Approved copy from marketing/email/forecourt-email-drafts-v3.md, used as written.
 * No name is collected, so every email opens "Hello,". The only per-recipient merge
 * tag is {{UNSUBSCRIBE_URL}}; the monthly template also has editorial {{SLOTS}}.
 * monthly [..] slots. fillPlaceholders() in render.ts swaps them per recipient.
 */
import { SITE_URL, type EmailDoc } from "./layout.tsx";

const img = (file: string, alt: string, width: number, height: number) => ({ src: `${SITE_URL}/email/${file}`, alt, width, height });
const TAG = "Beside your CRM, not instead of it.";
const LINE = "Your CRM keeps the book. Forecourt keeps the floor moving.";
const SHOWCASE = `${SITE_URL}/#showcase`;

const STOCK = img("stock.png", "Forecourt stock list: six cars, each with a location tag such as Showroom, Bodyshop or Workshop and a key box number.", 1200, 997);
const CUSTOMER = img("customer.png", "Forecourt customer view: a Kia EV3 order with the car locator showing it on the boat to the UK.", 1200, 693);
const CHASE = img("chase.png", "Forecourt to-do list: a PX V5 to collect, one waiting, with the customer and due date.", 1200, 548);
const OVERVIEW = img("overview.png", "Forecourt overview: 18 of 24 cars delivered in August 2026, counted by salesperson.", 1200, 924);

export const EMAILS: EmailDoc[] = [
  {
    name: "welcome",
    subject: "Forecourt: You're in. Here's the short version.",
    preview: LINE,
    eyebrow: "Welcome",
    title: "You're in. Thanks for confirming.",
    hero: CUSTOMER,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "Thanks for confirming your subscription. Here's Forecourt in one line:" },
      { t: "quote", text: LINE },
      { t: "p", text: "DealerWeb, the DMS, the manufacturer portal: they hold the book, and they do it well. They were never built for the person standing next to the car. Forecourt sits next to them and handles the floor work:" },
      {
        t: "tiles",
        items: [
          { title: "Where the car actually is.", text: "Factory, boat, compound, yard. Not a status code only one person can read." },
          { title: "Where the keys are.", text: "So the host doesn't have to shout across the showroom." },
          { title: "Whether it's been photographed.", text: "On the ramp, in the studio, done." },
          { title: "What the customer sees.", text: "They open their order and see their car. Fewer \"any update on my car?\" calls." },
        ],
      },
      { t: "p", text: "It's not another stock system. It pulls from what you already run." },
      { t: "p", text: "What to expect from us: a handful of short emails over the next two weeks, then a monthly note. No daily blasts. We've all had enough of those." },
      { t: "cta", label: "See the showcase", href: SHOWCASE },
      { t: "small", text: "It shows the team, stock and the customer view, with sample cars. No form to fill in." },
      { t: "p", text: TAG },
      { t: "sign", lines: ["The Forecourt team"] },
    ],
  },
  {
    name: "launch-2a",
    subject: "Forecourt: Fewer laps of the car park",
    preview: "Every car, where it is, and where the keys went.",
    eyebrow: "Stock and keys",
    title: "Fewer laps of the car park.",
    hero: STOCK,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "A customer is due in at 10. The car is \"on site\". The keys are \"somewhere\". Someone sets off round the car park with a hopeful look." },
      { t: "p", text: "Your CRM knows the car is in stock. It doesn't know it's in Bodyshop Box 9 with the keys in the cabinet. That's the gap Forecourt fills." },
      {
        t: "tiles",
        items: [
          { title: "Stock, placed.", text: "Every car with its location: showroom, bodyshop, workshop, prep, car park, forecourt front row. Plus how long it's been sitting." },
          { title: "Keys, found.", text: "A key locator for every car. Cabinet, with PDI, or (honestly) unknown, so you know where to start." },
          { title: "Photos, tracked.", text: "On the ramp, in the studio, done. The listing doesn't wait on a WhatsApp." },
          { title: "Incoming, visible.", text: "Ordered, at port, on the lorry, in stock. Everyone sees the same status, so nobody has to ring the depot." },
        ],
      },
      { t: "p", text: "The stock itself is pulled from the system you already run. Forecourt adds the floor detail on top." },
      { t: "cta", label: "See it in the showcase", href: SHOWCASE },
      { t: "quote", text: TAG },
      { t: "sign", lines: ["The Forecourt team"] },
    ],
  },
  {
    name: "launch-2b",
    subject: "Forecourt: \"Any update on my car?\"",
    preview: "Their order moves when the car does. The phone rings less.",
    eyebrow: "The customer view",
    title: "\"Any update on my car?\"",
    hero: CUSTOMER,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "You know the call. Sometimes it's the third one that week. The exec puts the customer on hold, rings the port, rings the depot, rings the customer back. Nobody sold a car in that half hour." },
      { t: "p", text: "With Forecourt, the customer has their own view of their order. They sign in, see their car, and see where it is: at the international port, on the boat to the UK, at the UK port, with an estimated arrival window. Their order moves when the car does." },
      { t: "p", text: "They can also see their own to-do list, so the jobs that are theirs to do before handover are in front of them, not buried in a voicemail." },
      { t: "p", text: "The result is simple: fewer \"any update?\" calls, and your exec is no longer a switchboard." },
      { t: "cta", label: "See what the customer sees", href: `${SITE_URL}/#scene-customer` },
      { t: "quote", text: TAG },
      { t: "sign", lines: ["The Forecourt team"] },
    ],
  },
  {
    name: "launch-2c",
    subject: "Forecourt: The 8am list that stops asking once it's done",
    preview: "Chases, handover nudges and a shorter commission night.",
    eyebrow: "The desk's day",
    title: LINE,
    hero: CHASE,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "Most of a sales desk's day isn't selling. It's remembering. The PX V5 that still hasn't turned up. The customer who hasn't done their bits before Saturday's handover. The commission sheet at month end." },
      { t: "p", text: "Forecourt keeps that out of people's heads:" },
      {
        t: "tiles",
        items: [
          { title: "Chases that stay put.", text: "PX V5s and promises sit on the to-do list and in the 8am digest until someone ticks them off. Tick it once and it stops asking." },
          { title: "A nudge before handover goes sideways.", text: "If a customer still has jobs to do the day before, the desk gets a prompt and a one-tap message. Fewer awkward Saturday mornings." },
          { title: "Proposals from a quick brief.", text: "Type what the customer told you and the cars and the story fill themselves in. The figures are yours to type, same as always." },
          { title: "Month end, already counted.", text: "Pick a month and the deliveries add up per salesperson. Commission night gets a lot shorter." },
          { title: "Roles that fit the floor.", text: "Sales, management, host, progressor and more, each seeing what they need. A promotion takes one click, not a meeting." },
        ],
      },
      { t: "p", text: "Your team signs in on the iPads, laptops and PCs you already have." },
      { t: "cta", label: "See the showcase", href: SHOWCASE },
      { t: "quote", text: TAG },
      { t: "sign", lines: ["The Forecourt team"] },
      { t: "small", text: "P.S. Our prices are on the website, not behind a \"call us\". More on that next week." },
    ],
  },
  {
    name: "launch-2d",
    subject: "Forecourt: The prices, in plain sight",
    preview: "Site, franchise or group. Plus a 60-day trial for one site.",
    eyebrow: "Pricing",
    title: "Site, franchise or group.",
    hero: OVERVIEW,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "Car people like to know the number. So here it is. All prices include VAT." },
      {
        t: "plans",
        items: [
          { name: "Site", tag: "Month to month", sub: "One dealership, one brand", lines: ["£4,500 setup, then £399 a month from go live. Month to month.", "Or start with the **one-site trial: £1,500 for 60 days**. If you stay, it comes off the setup."] },
          { name: "Franchise", tag: "12-month contract", sub: "One manufacturer brand", lines: ["£6,500 setup, then £899 a month for up to 5 sites, plus £100 a month per extra site. 12-month contract, billed monthly. Includes manufacturer ingest and locator mapping."] },
          { name: "Group", tag: "12-month contract", sub: "Every site, every brand", lines: ["£8,500 setup, then £249 per site per month. 12-month contract. More than one brand means Group."] },
        ],
      },
      { t: "p", text: "A few things worth knowing:" },
      {
        t: "list",
        items: [
          "Adding sites never comes with a setup fee.",
          "You can switch between Site, Franchise and Group yourself, from your account.",
          "Moving up? You pay the difference in setup fee up front. The new price starts on go-live day, and the part month is added to your next bill.",
          "Moving down? The lower monthly price starts at the end of your current billing period. There's no refund on the setup fee.",
          "The trial is for a single site. Franchise and group skip it.",
        ],
      },
      { t: "p", text: "From payment to live is six steps: a 30-minute kickoff call, your desk set up within 7 working days of it, a preview, then testing on real days before you go live. We email you as each step moves, and you can always reply to a real person." },
      { t: "p", text: "If the cards don't quite fit your sites, send a short note to hello@forecourt.me." },
      { t: "cta", label: "See pricing", href: `${SITE_URL}/pricing` },
      { t: "quote", text: TAG },
      { t: "sign", lines: ["The Forecourt team"] },
    ],
  },
  {
    name: "monthly",
    subject: "Forecourt: {{MONTH}} on the floor",
    preview: "{{PREVIEW_TEXT}}",
    eyebrow: "Monthly note",
    title: "{{MONTH}} on the floor",
    hero: STOCK,
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "{{INTRO_PARAGRAPH}}" },
      { t: "h2", text: "What's new in Forecourt" },
      { t: "p", text: "{{PRODUCT_UPDATE}}" },
      { t: "h2", text: "One thing for the desk" },
      { t: "p", text: "{{DESK_TIP}}" },
      { t: "h2", text: "From the floor" },
      { t: "p", text: "{{CUSTOMER_STORY_OR_OBSERVATION}}" },
      { t: "h2", text: "Worth a read" },
      {
        t: "links",
        items: [
          { label: "{{LINK_1_TITLE}}", href: "{{LINK_1_URL}}", why: "{{ONE_LINE_WHY}}" },
          { label: "{{LINK_2_TITLE}}", href: "{{LINK_2_URL}}", why: "{{ONE_LINE_WHY}}" },
          { label: "{{LINK_3_TITLE}}", href: "{{LINK_3_URL}}", why: "{{ONE_LINE_WHY}}" },
        ],
      },
      { t: "h2", text: "{{CTA_SECTION_HEADING}}" },
      { t: "p", text: "{{CTA_LEAD_IN}}" },
      { t: "cta", label: "{{CTA_LABEL}}", href: "{{CTA_URL}}" },
      { t: "quote", text: LINE },
      { t: "sign", lines: ["{{SIGN_OFF_NAME}}", "The Forecourt team"] },
    ],
  },
  {
    name: "confirm",
    subject: "Forecourt: confirm your subscription",
    preview: "One tap to confirm. If this was not you, ignore it and nothing happens.",
    eyebrow: "Newsletter",
    title: "Confirm your subscription.",
    footer: "confirm",
    blocks: [
      { t: "p", text: "Hello," },
      { t: "p", text: "Someone, hopefully you, asked to get occasional Forecourt updates at this address. Confirm and you are in." },
      { t: "cta", label: "Confirm my subscription", href: "{{CONFIRM_URL}}" },
      { t: "small", text: "The link works for 48 hours. If this was not you, ignore this email and nothing happens. We will not add you." },
      { t: "p", text: "Forecourt, hello@forecourt.me" },
    ],
  },
];
