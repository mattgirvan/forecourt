import type { BillingKind, PlanId } from "./catalog";

/**
 * Job titles on a drive are many. Forecourt roles are few.
 * A showroom host is not a new product. An accountant is not a finance suite.
 * Map their title onto one of these, then scope it to a site / franchise.
 */
export const ROLES = [
  {
    id: "sales",
    label: "Sales exec",
    title: "Sales executive",
    sees: "Own customers only. Locator, GP on their book, customer glass.",
    cannot: "Everyone else's deals. Staff admin. Group totals.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
  },
  {
    id: "management",
    label: "Sales manager",
    title: "Sales manager / desk manager",
    sees: "The floor. Reassign. Month-end. GP on every live deal.",
    cannot: "Group roll-up across sites (that is principal).",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
  },
  {
    id: "progressor",
    label: "Progressor",
    title: "Vehicle progressor",
    sees: "Locator and inbound stock. Stage the car. No GP.",
    cannot: "Gross, customer thread, month-end numbers.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: false,
    tabs: ["stock", "locator", "pipeline"],
  },
  {
    id: "host",
    label: "Host",
    title: "Showroom host / reception",
    sees: "Who is coming, which exec, where the car is. Lookup only.",
    cannot: "Edit a deal, see GP, move locator.",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: false,
    tabs: ["customer", "locator"],
  },
  {
    id: "admin",
    label: "Admin",
    title: "Administrator",
    sees: "Staff list, documents, month-end checklist, handover pack.",
    cannot: "Reassign live deals (manager). Close GP (accounts).",
    packages: ["site", "franchise", "group"] as PlanId[],
    trial: false,
    tabs: ["overview", "pipeline"],
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
  },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export function rolesForPlan(plan: PlanId, billing: BillingKind = "subscription") {
  const trial = plan === "site" && billing === "trial";
  return ROLES.filter((r) => {
    if (!(r.packages as readonly string[]).includes(plan)) return false;
    if (trial) return r.trial;
    return true;
  });
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
  "The 60-day trial is Site only: sales + management. Do not dump seven seats on a trial.",
  "A job title is a label. The role is the seat. Host, receptionist, greeter → host.",
  "Accountant does not get a finance product. They get GP read and a CSV.",
  "Progressor is the locator tab with stock. Not a second app.",
  "Franchise is one manufacturer brand on a 12-month contract. No trial.",
  "Multi-franchise is Group: one contract, seats scoped to site and franchise.",
  "Do not let a client invent roles. If it is not in this list, it is a title on an existing seat.",
] as const;
