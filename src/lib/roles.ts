import type { PlanId } from "./catalog";

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
    packages: ["pilot", "site", "group"] as PlanId[],
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
  },
  {
    id: "management",
    label: "Sales manager",
    title: "Sales manager / desk manager",
    sees: "The floor. Reassign. Month-end. GP on every live deal.",
    cannot: "Group roll-up across rooftops (that is principal).",
    packages: ["pilot", "site", "group"] as PlanId[],
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
  },
  {
    id: "progressor",
    label: "Progressor",
    title: "Vehicle progressor",
    sees: "Locator and inbound stock. Stage the car. No GP.",
    cannot: "Gross, customer thread, month-end numbers.",
    packages: ["site", "group"] as PlanId[],
    tabs: ["stock", "locator", "pipeline"],
  },
  {
    id: "host",
    label: "Host",
    title: "Showroom host / reception",
    sees: "Who is coming, which exec, where the car is. Lookup only.",
    cannot: "Edit a deal, see GP, move locator.",
    packages: ["site", "group"] as PlanId[],
    tabs: ["customer", "locator"],
  },
  {
    id: "admin",
    label: "Admin",
    title: "Administrator",
    sees: "Staff list, documents, month-end checklist, handover pack.",
    cannot: "Reassign live deals (manager). Close GP (accounts).",
    packages: ["site", "group"] as PlanId[],
    tabs: ["overview", "pipeline"],
  },
  {
    id: "accounts",
    label: "Accounts",
    title: "Accounts / office",
    sees: "GP and month-end by deal ref. Export.",
    cannot: "Customer thread, phone, email. They get a number, not a person.",
    packages: ["site", "group"] as PlanId[],
    tabs: ["overview"],
  },
  {
    id: "principal",
    label: "Principal",
    title: "Dealer principal / group",
    sees: "Every site, every franchise on the contract. Totals.",
    cannot: "Nothing on the floor they cannot already see as management.",
    packages: ["group"] as PlanId[],
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
  },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export function rolesForPlan(plan: PlanId) {
  return ROLES.filter((r) => (r.packages as readonly string[]).includes(plan));
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
  "Pilot is Aberdeen as it runs today: sales + management. Do not dump seven seats on a 60-day trial.",
  "A job title is a label. The role is the seat. Host, receptionist, greeter → host.",
  "Accountant does not get a finance product. They get GP read and a CSV.",
  "Progressor is the locator tab with stock. Not a second app.",
  "Multi-franchise is Group: one contract, seats scoped to site and franchise — not a fourth plan.",
  "Do not let a client invent roles. If it is not in this list, it is a title on an existing seat.",
] as const;
