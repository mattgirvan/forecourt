/**
 * The customer journey after payment: one source of truth for the Before Pay
 * panel, the After you pay strip (home, /pricing, account) and the emails.
 *
 * Pure module, no `@/` imports, so the email templates and their tests can
 * import it under `node --experimental-strip-types`.
 *
 * Customers only ever see these six names. The internal build stages
 * (briefing, paid, brief, pack, build, preview, testing, live) map onto them
 * with `customerStepFor`; "Brief" and "Pack" never reach a customer.
 */

export type CustomerStepId = "paid" | "kickoff" | "setup" | "preview" | "testing" | "live";

export type CustomerStep = {
  id: CustomerStepId;
  /** 1 to 6. */
  n: number;
  title: string;
  /** Short label for the progress bar. */
  short: string;
  /** One line under the title. */
  line: string;
  /** Timescale. Always "Today", "Within" or "Usually", in working days. */
  when: string;
};

export const CUSTOMER_STEPS: readonly CustomerStep[] = [
  {
    id: "paid",
    n: 1,
    title: "Payment received",
    short: "Paid",
    line: "Your order is in. Stripe sends your receipt separately.",
    when: "Today",
  },
  {
    id: "kickoff",
    n: 2,
    title: "Kickoff call",
    short: "Kickoff",
    line: "30 minutes on a video call to agree who uses it, your branding and how your stock comes in.",
    when: "Within 5 working days",
  },
  {
    id: "setup",
    n: 3,
    title: "We set up your desk",
    short: "Setup",
    line: "Your name, colours, staff and stock, on a database kept separate from every other dealership.",
    when: "Within 7 working days of the kickoff",
  },
  {
    id: "preview",
    n: 4,
    title: "Your preview",
    short: "Preview",
    line: "Try it with your team and tell us what to change.",
    when: "Within 7 working days of setup",
  },
  {
    id: "testing",
    n: 5,
    title: "Testing",
    short: "Testing",
    line: "Your team uses it on real days while we tidy up anything that needs it.",
    when: "Usually 1 to 2 weeks",
  },
  {
    id: "live",
    n: 6,
    title: "Live",
    short: "Live",
    line: "Your web address goes live and your team signs in with a code.",
    when: "Usually 1 to 2 weeks after testing",
  },
] as const;

export const CUSTOMER_STEP_COUNT = CUSTOMER_STEPS.length;

/** Internal tenants.stage to customer step number (0 = not paid yet). */
const STAGE_TO_STEP: Record<string, number> = {
  briefing: 0,
  paid: 1,
  brief: 2,
  pack: 3,
  build: 3,
  preview: 4,
  testing: 5,
  live: 6,
};

export function customerStepNumber(stage: string | null | undefined): number {
  if (!stage) return 0;
  return STAGE_TO_STEP[stage] ?? 0;
}

/** The customer step for an internal stage, or null before payment. */
export function customerStepFor(stage: string | null | undefined): CustomerStep | null {
  const n = customerStepNumber(stage);
  return n > 0 ? CUSTOMER_STEPS[n - 1]! : null;
}

export function nextCustomerStep(stage: string | null | undefined): CustomerStep | null {
  const n = customerStepNumber(stage);
  return n < CUSTOMER_STEP_COUNT ? CUSTOMER_STEPS[n]! : null;
}

export function stepLabel(step: CustomerStep) {
  return `Step ${step.n} of ${CUSTOMER_STEP_COUNT}`;
}

/** Booking. /book is a Forecourt-owned redirect so already-sent links can move later. */
export const BOOKING_URL = "https://cal.com/matthew-girvan-i3mfm7/forecourtkickoff";
export const BOOK_PATH = "/book";
export const BOOK_URL = "https://www.forecourt.me/book";
export const CONTACT_EMAIL = "hello@forecourt.me";
