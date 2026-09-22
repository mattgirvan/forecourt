import type { BillingKind, PlanId } from "./catalog";

/**
 * Job titles on a drive are many. Forecourt roles are few.
 * A showroom host is not a new product. An accountant is not a finance suite.
 * Map their title onto one of these, then scope it to a site / franchise.
 *
 * Matrix columns (Pricing + Account) read from this file only; do not fork labels elsewhere.
 */
export const ROLES = [
  {
    id: "sales",
    label: "Sales",
    title: "Sales executive",
    sees: "Own customers only. Locator, GP on their book, customer view.",
    cannot: "Everyone else's deals. Staff admin. Group totals.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    matrixSees: "Overview, stock, deals, customer view tools",
    seesGp: "No" as const,
  },
  {
    id: "management",
    label: "Management",
    title: "Sales manager / desk manager",
    sees: "The floor. Reassign. Month-end. GP on every live deal.",
    cannot: "Group roll-up across sites (that is principal).",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    matrixSees: "Floor view, deals, keep in mind, pipeline extras",
    seesGp: "Yes" as const,
  },
  {
    id: "progressor",
    label: "Progressor / driver",
    title: "Vehicle progressor",
    sees: "Locator and inbound stock. Stage the car. No GP.",
    cannot: "Gross, customer thread, month-end numbers.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["stock", "locator", "pipeline"],
    matrixSees: "Stock and locator",
    seesGp: "No" as const,
  },
  {
    id: "host",
    label: "Host (showroom)",
    title: "Showroom host / reception",
    sees: "Who is coming, which exec, where the car is. Lookup only.",
    cannot: "Edit a deal, see GP, move locator.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["customer", "locator"],
    matrixSees: "Stock (site-filtered), arrivals",
    seesGp: "No" as const,
  },
  {
    id: "admin",
    label: "Administrator",
    title: "Administrator",
    sees: "Staff list, documents, month-end checklist, handover pack.",
    cannot: "Reassign live deals (manager). Close GP (accounts).",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: false,
    tabs: ["overview", "pipeline"],
    matrixSees: "People and settings the seat can touch",
    seesGp: "As flagged" as const,
  },
  {
    id: "accounts",
    label: "Accounts",
    title: "Accounts / office",
    sees: "GP and month-end by deal ref. Export.",
    cannot: "Customer thread, phone, email. They get a number, not a person.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: false,
    tabs: ["overview"],
    matrixSees: "Payment and expense-style tabs if enabled",
    seesGp: "As flagged" as const,
  },
  {
    id: "principal",
    label: "Principal",
    title: "Dealer principal / group",
    sees: "Every site, every franchise on the contract. Totals.",
    cannot: "Nothing on the floor they cannot already see as management.",
    packages: ["group"] as PlanId[],
    trial: false,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    matrixSees: "Account portal and full desk",
    seesGp: "Yes" as const,
  },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];
export type Role = (typeof ROLES)[number];

export function rolesForPlan(plan: PlanId, billing: BillingKind = "subscription") {
  const trial = plan === "site" && billing === "trial";
  return ROLES.filter((r) => {
    if (!(r.packages as readonly string[]).includes(plan)) return false;
    if (trial) return r.trial;
    return true;
  });
}

/** Trial column for the public seat matrix. Principal is the package owner, not a trial seat. */
export function matrixTrialLabel(role: Pick<Role, "id" | "trial">) {
  if (role.id === "principal") return "Package owner";
  return role.trial ? "Yes" : "No";
}

export function isRoleId(v: unknown): v is RoleId {
  return typeof v === "string" && ROLES.some((r) => r.id === v);
}

export type StaffSeat = {
  name: string;
  email: string;
  role: RoleId;
  site: string;
  franchise?: string;
};

export const ROLE_RULES = [
  "The 60-day trial is Site only: sales, management, host, progressor. Not administrator or accounts.",
  "A job title is a label. The role is the seat. Host, receptionist, greeter → host.",
  "Accountant does not get a finance product. They get GP read and a CSV.",
  "Progressor is the locator tab with stock. Not a second app.",
  "Say Administrator seat (inside the desk), never bare Admin. Forecourt team is a separate staff door.",
  "Franchise is one manufacturer brand on a 12-month contract. No trial.",
  "Multi-franchise is Group: one contract, seats scoped to site and franchise.",
  "Do not let a client invent roles. If it is not in this list, it is a title on an existing seat.",
] as const;
