export const locatorLane = [
  { code: "01", label: "Pending Build Date" },
  { code: "02", label: "Build Date Confirmed" },
  { code: "03", label: "In Production" },
  { code: "04", label: "At International Port" },
  { code: "05", label: "On Boat to UK" },
  { code: "06", label: "UK Port" },
  { code: "07", label: "In Transit To Dealership" },
  { code: "08", label: "Arrived at Dealership" },
] as const;

export type LocatorCode = (typeof locatorLane)[number]["code"];

export const STAGE_SETS = {
  Motability: [
    "Motability Approved",
    "Car Ordered",
    "VIN Assigned",
    "Reg Assigned",
    "Handover Arranged",
    "Car Ready",
    "Car Invoiced",
    "Delivered",
  ],
  Lease: [
    "Order Confirmed",
    "Finance Approved",
    "Car Ordered",
    "VIN Assigned",
    "Reg Assigned",
    "Handover Arranged",
    "Agency Approved",
    "Car Ready",
    "Car Invoiced",
    "Delivered",
  ],
  "New-Finance": [
    "Order Confirmed",
    "Car Ordered",
    "Finance Approved",
    "VIN Assigned",
    "Reg Assigned",
    "Handover Arranged",
    "Car Ready",
    "Car Invoiced",
    "Delivered",
  ],
  "New-Cash": [
    "Order Confirmed",
    "Car Ordered",
    "VIN Assigned",
    "Reg Assigned",
    "Handover Arranged",
    "Car Ready",
    "Car Invoiced",
    "Delivered",
  ],
  "Used-Cash": [
    "Order Confirmed",
    "Car Prepped",
    "Quality Check",
    "Car Ready",
    "Handover Arranged",
    "Car Invoiced",
    "Delivered",
  ],
  "Used-Finance": [
    "Order Confirmed",
    "Finance Approved",
    "Car Prepped",
    "Quality Check",
    "Car Ready",
    "Handover Arranged",
    "Car Invoiced",
    "Delivered",
  ],
} as const;

export type CustomerType = "Finance" | "Cash" | "Lease" | "Motability";
export type CarType = "New" | "Used";

export function getStages(customerType: CustomerType, carType: CarType): readonly string[] {
  if (customerType === "Motability") return STAGE_SETS.Motability;
  if (customerType === "Lease") return STAGE_SETS.Lease;
  return STAGE_SETS[`${carType}-${customerType}` as keyof typeof STAGE_SETS] ?? STAGE_SETS["New-Cash"];
}

export const pipelineStages = STAGE_SETS["New-Finance"];

export const SITE_STATUS_OPTIONS = [
  "On-site",
  "Bodyshop",
  "Commercials",
  "Washbay",
  "Marywell",
  "Out",
  "Not arrived yet",
] as const;

export const SITE_SPOT_OPTIONS = ["Showroom", "Side Showroom", "Pitch", "1st Carpark", "3rd Carpark"] as const;

export type SiteStatus = (typeof SITE_STATUS_OPTIONS)[number];
export type SiteSpot = (typeof SITE_SPOT_OPTIONS)[number];

export const CHECKLIST_DEFS: Record<
  string,
  { label: string; tooltip?: string; greyUntilInvoiced?: boolean; greyUntilVin?: boolean }
> = {
  idVerification: {
    label: "ID Verification",
    tooltip: "A text will have been sent to you via text to verify your ID. Let me know if you need a new link.",
  },
  socialSecurityLetter: {
    label: "Social Security Letter",
    tooltip: "Please send me your latest award letter via email.",
  },
  motabilityPin: { label: "Motability PIN" },
  advancePayment: { label: "Advance Payment" },
  v5Document: {
    label: "V5 Document",
    tooltip: "Upload this to your dealer portal. The link was sent to your email. If you need a new link, let me know.",
  },
  signedDealerDocuments: {
    label: "Signed Dealer Documents",
    tooltip: "Sign these in your dealer portal. The link was sent to your email. Let me know if you need a new link.",
    greyUntilInvoiced: true,
  },
  signedFinanceDocuments: {
    label: "Signed Finance Documents",
    tooltip: "Sign these in your Finance Portal, sent to you via email from the finance company. Let me know if you need a new link.",
    greyUntilInvoiced: true,
  },
  balancePaid: {
    label: "Balance Paid",
    tooltip: "This payment must come from your own bank account, in your name.",
  },
  connect: {
    label: "Manufacturer Connect",
    tooltip: "Check email for the Connect invite. If you need another link, let me know.",
    greyUntilVin: true,
  },
  retentionDocument: { label: "Send Retention Document via Email" },
};

export function checklistKeysFor(order: {
  customerType: CustomerType;
  type: CarType;
  hasPartExchange: boolean;
  hasPrivateReg?: boolean;
}): string[] {
  let base: string[];
  if (order.customerType === "Motability") {
    base = ["socialSecurityLetter", "signedDealerDocuments", "motabilityPin", "advancePayment"];
  } else if (order.customerType === "Finance" || order.customerType === "Lease") {
    base = [
      "idVerification",
      ...(order.hasPartExchange ? ["v5Document"] : []),
      "signedDealerDocuments",
      "signedFinanceDocuments",
      "balancePaid",
    ];
  } else {
    base = [
      "idVerification",
      ...(order.hasPartExchange ? ["v5Document"] : []),
      "signedDealerDocuments",
      "balancePaid",
    ];
  }
  if (order.type !== "Used") base = [...base, "connect"];
  if (order.hasPrivateReg) base = [...base, "retentionDocument"];
  return base;
}

export const PRODUCTS_INCLUDED = [
  { key: "ceramicProtection" as const, label: "Ceramic Protection" },
  { key: "bodyworkProtection" as const, label: "Bodywork Protection" },
  { key: "alloyTyreProtection" as const, label: "Alloy and Tyre Protection" },
  { key: "servicePlan" as const, label: "Service Plan", hiddenFor: ["Motability", "Lease"] as CustomerType[] },
];

export const HANDOVER_METHODS = ["Pickup from Showroom", "Delivery", "Ferry Drop-Off"] as const;
export type HandoverMethod = (typeof HANDOVER_METHODS)[number];

export type Todo = { label: string; done: boolean };
export type ThreadMsg = { from: "staff" | "customer"; text: string; at: string };

export type Deal = {
  id: string;
  customer: string;
  email: string;
  phone: string;
  nickname: string;
  vehicle: string;
  colour: string;
  vin: string;
  reg: string;
  type: CarType;
  customerType: CustomerType;
  site: string;
  salesperson: string;
  salespersonInitials: string;
  stageIndex: number;
  locatorIndex: number;
  gp: number | null;
  monthEnd: boolean;
  monthEndTasksComplete: boolean;
  handover: string | null;
  handoverTime: string | null;
  handoverMethod: HandoverMethod | "";
  handoverConfirmed: boolean;
  estimatedStart: string | null;
  estimatedEnd: string | null;
  confirmed: boolean;
  missing: string[];
  balance: number;
  todos: Todo[];
  checklistState: Record<string, boolean>;
  messages: ThreadMsg[];
  hasPartExchange: boolean;
  partExchangeReg: string;
  financeSettle: "" | "Yes" | "No";
  trackerRef: string;
  wsReq: "" | "Pushed";
  onHoDiary: boolean;
  internalNotes: string;
  dealFileStatus: "No" | "Uploaded";
  usedOnSite: "" | "Yes" | "No";
  financeCompany: string;
  financeType: string;
  monthlyAmount: number | null;
  ceramicProtection: boolean;
  bodyworkProtection: boolean;
  alloyTyreProtection: boolean;
  servicePlan: boolean;
  leaseServicing: string;
  agreedActions: { id: string; label: string; done: boolean }[];
  handoverChecklist: { id: string; label: string }[];
  activityLog: { ts: string; text: string }[];
  photoSpecs: string[];
  notes: string;
  isBev: boolean;
  hasPrivateReg: boolean;
};

export type StockCar = {
  id: string;
  vehicle: string;
  derivative: string;
  colour: string;
  vin: string;
  reg: string;
  type: CarType;
  site: string;
  keys: string;
  days: number;
  price: number;
  miles: number | null;
  year: number | null;
  missing: boolean;
  matchedDealId: string | null;
  siteStatus: SiteStatus | "";
  siteSpot: SiteSpot | "";
  fuel: string;
  transmission: string;
  source: string;
};

export type Brief = {
  id: string;
  name: string;
  phone: string;
  email: string;
  want: string;
  colour: string;
  maxMiles: number;
  maxPrice: number;
  interestType: "out_of_stock" | "not_yet_released";
  reminderDate: string;
  matches: number;
};

export type StaffSeat = {
  name: string;
  role: string;
  email: string;
  initials: string;
  target: number;
};

export const STAFF: StaffSeat[] = [
  { name: "Alex Reed", role: "Sales manager", email: "alex@", initials: "AR", target: 8 },
  { name: "Sam Cole", role: "Sales exec", email: "sam@", initials: "SC", target: 6 },
  { name: "Jordan Hale", role: "Host", email: "jordan@", initials: "JH", target: 0 },
];

export const monthTarget = { units: 17, gp: 30000, extrasPct: 80 };

export function todosFor(customerType: CustomerType, carType: CarType): Todo[] {
  return checklistKeysFor({ customerType, type: carType, hasPartExchange: customerType !== "Motability" && customerType !== "Lease" }).map(
    (k, i) => ({ label: CHECKLIST_DEFS[k]?.label ?? k, done: i === 0 }),
  );
}

export function isCarAtDealership(deal: Deal) {
  if (deal.type === "New") return deal.locatorIndex >= 6;
  return deal.usedOnSite === "Yes";
}

export function wsReqApplicable(deal: Deal) {
  if (deal.type === "New") return deal.locatorIndex >= 6;
  return deal.usedOnSite === "Yes" || deal.usedOnSite === "No";
}

export function isOrderDelivered(deal: Deal) {
  const stages = getStages(deal.customerType, deal.type);
  return deal.stageIndex >= stages.length - 1;
}

export function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatLongDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function daysUntil(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function firstNameFor(deal: Deal) {
  if (deal.nickname.trim()) return deal.nickname.trim();
  return deal.customer.split(" ")[0] ?? deal.customer;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]!.toUpperCase())
    .join("");
}

export const TINTS = {
  blue: { bg: "var(--tint-blue-bg)", fg: "var(--tint-blue-fg)" },
  purple: { bg: "var(--tint-purple-bg)", fg: "var(--tint-purple-fg)" },
  rose: { bg: "var(--tint-rose-bg)", fg: "var(--tint-rose-fg)" },
  amber: { bg: "var(--wash-amber-bg)", fg: "var(--shell-accent)" },
  emerald: { bg: "var(--wash-emerald-bg)", fg: "#C5F0B0" },
};

export const CUSTOMER_TYPE_TINT: Record<CustomerType, { bg: string; fg: string }> = {
  Finance: TINTS.blue,
  Cash: TINTS.emerald,
  Lease: TINTS.purple,
  Motability: TINTS.rose,
};

export const SITE_STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  "On-site": { bg: "var(--pine-tint)", fg: "var(--emerald)" },
  Bodyshop: { bg: "var(--tint-purple-bg)", fg: "var(--tint-purple-fg)" },
  Commercials: { bg: "var(--moss-tint)", fg: "var(--moss)" },
  Washbay: { bg: "rgba(34,211,238,0.16)", fg: "#67E8F9" },
  Marywell: { bg: "rgba(251,146,60,0.2)", fg: "#FB923C" },
  Out: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  "Not arrived yet": { bg: "rgba(59,130,246,0.18)", fg: "#60A5FA" },
};
