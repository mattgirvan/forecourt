export type TenantSlug = "northbridge" | "harbour" | "ridgemont";

export type Tenant = {
  slug: TenantSlug;
  name: string;
  legal: string;
  phone: string;
  email: string;
  domain: string;
  sites: string[];
  note: string;
};

export const tenants: Record<TenantSlug, Tenant> = {
  northbridge: {
    slug: "northbridge",
    name: "Northbridge Motor Co.",
    legal: "Northbridge Motor Company Ltd",
    phone: "01904 551 200",
    email: "sales@northbridge.example",
    domain: "portal.northbridge.example",
    sites: ["York"],
    note: "Owner-driven independent. One rooftop.",
  },
  harbour: {
    slug: "harbour",
    name: "Harbour Park",
    legal: "Harbour Park Automotive Ltd",
    phone: "01202 774 410",
    email: "sales@harbourpark.example",
    domain: "portal.harbourpark.example",
    sites: ["Poole"],
    note: "Coastal Ford independent. Sales manager still walks the yard.",
  },
  ridgemont: {
    slug: "ridgemont",
    name: "Ridgemont",
    legal: "Ridgemont Motor Group Ltd",
    phone: "01423 900 180",
    email: "enquiries@ridgemont.example",
    domain: "portal.ridgemont.example",
    sites: ["Harrogate", "Leeds", "Wakefield"],
    note: "Three-site group. Shared pipeline, per-site stock.",
  },
};

export const locatorLane = [
  { code: "A10", label: "In production" },
  { code: "B22", label: "At port" },
  { code: "C04", label: "On vessel" },
  { code: "D11", label: "UK compound" },
  { code: "E07", label: "Dealer rail" },
  { code: "F01", label: "On site" },
] as const;

export type LocatorCode = (typeof locatorLane)[number]["code"];

export const pipelineStages = [
  "Confirmed",
  "Build / inbound",
  "PDI",
  "Ready",
  "Handover booked",
  "Delivered",
] as const;

export type CustomerType = "Finance" | "Cash" | "Lease" | "Motability";
export type CarType = "New" | "Used";

export type Deal = {
  id: string;
  customer: string;
  vehicle: string;
  colour: string;
  vin: string;
  type: CarType;
  customerType: CustomerType;
  site: string;
  stageIndex: number;
  locatorIndex: number;
  gp: number | null;
  monthEnd: boolean;
  handover: string | null;
  confirmed: boolean;
  missing: string[];
};

export type StockCar = {
  id: string;
  vehicle: string;
  colour: string;
  vin: string;
  type: CarType;
  site: string;
  keys: "Cabinet A" | "Cabinet B" | "With PDI" | "Unknown";
  days: number;
  price: number;
  miles: number | null;
  missing: boolean;
  matchedDealId: string | null;
};

export type Brief = {
  id: string;
  name: string;
  want: string;
  colour: string;
  maxMiles: number;
  maxPrice: number;
};

export const seedDeals: Deal[] = [
  {
    id: "ORD-1042",
    customer: "Priya Shah",
    vehicle: "Kuga ST-Line 1.5",
    colour: "Frozen White",
    vin: "WF0AXXWPMA123001",
    type: "New",
    customerType: "Finance",
    site: "York",
    stageIndex: 3,
    locatorIndex: 4,
    gp: 2140,
    monthEnd: true,
    handover: "2026-09-22",
    confirmed: true,
    missing: ["V5"],
  },
  {
    id: "ORD-1048",
    customer: "Callum Reid",
    vehicle: "Rav4 Design Hybrid",
    colour: "Silver Metallic",
    vin: "JTMW123400000218",
    type: "Used",
    customerType: "Cash",
    site: "York",
    stageIndex: 2,
    locatorIndex: 5,
    gp: 980,
    monthEnd: false,
    handover: "2026-09-18",
    confirmed: true,
    missing: ["Connect", "Identity"],
  },
  {
    id: "ORD-1051",
    customer: "Helen Okonkwo",
    vehicle: "Puma Titanium",
    colour: "Desert Island Blue",
    vin: "WF0AXXWPMK123882",
    type: "New",
    customerType: "Motability",
    site: "Harrogate",
    stageIndex: 1,
    locatorIndex: 2,
    gp: null,
    monthEnd: true,
    handover: null,
    confirmed: false,
    missing: ["GP", "Locator confirm"],
  },
  {
    id: "ORD-1055",
    customer: "James Lyle",
    vehicle: "Corolla Icon Tech",
    colour: "Night Time Black",
    vin: "SB1K123400000441",
    type: "Used",
    customerType: "Finance",
    site: "Leeds",
    stageIndex: 4,
    locatorIndex: 5,
    gp: 1640,
    monthEnd: true,
    handover: "2026-09-19",
    confirmed: true,
    missing: [],
  },
  {
    id: "ORD-1059",
    customer: "Sofia Berg",
    vehicle: "Explorer ST-Line",
    colour: "Magnetic",
    vin: "WF0AXXWPMA124010",
    type: "New",
    customerType: "Lease",
    site: "Poole",
    stageIndex: 0,
    locatorIndex: 0,
    gp: 1880,
    monthEnd: false,
    handover: null,
    confirmed: false,
    missing: ["Handover date"],
  },
  {
    id: "ORD-1062",
    customer: "Owen MacKay",
    vehicle: "Yaris Cross Excel",
    colour: "Juniper Blue",
    vin: "JTDK123400000903",
    type: "Used",
    customerType: "Finance",
    site: "Wakefield",
    stageIndex: 3,
    locatorIndex: 5,
    gp: -120,
    monthEnd: true,
    handover: "2026-09-25",
    confirmed: true,
    missing: ["PX V5", "GP"],
  },
];

export const seedStock: StockCar[] = [
  {
    id: "STK-01",
    vehicle: "Kuga ST-Line 1.5",
    colour: "Frozen White",
    vin: "WF0AXXWPMA123001",
    type: "New",
    site: "York",
    keys: "Cabinet A",
    days: 4,
    price: 32995,
    miles: 12,
    missing: false,
    matchedDealId: "ORD-1042",
  },
  {
    id: "STK-02",
    vehicle: "Rav4 Design Hybrid",
    colour: "Silver Metallic",
    vin: "JTMW123400000218",
    type: "Used",
    site: "York",
    keys: "With PDI",
    days: 11,
    price: 27450,
    miles: 18420,
    missing: false,
    matchedDealId: "ORD-1048",
  },
  {
    id: "STK-03",
    vehicle: "Fiesta ST-Line",
    colour: "Race Red",
    vin: "WF0AXXWPMK119004",
    type: "Used",
    site: "York",
    keys: "Unknown",
    days: 38,
    price: 12995,
    miles: 41200,
    missing: true,
    matchedDealId: null,
  },
  {
    id: "STK-04",
    vehicle: "Corolla Icon Tech",
    colour: "Night Time Black",
    vin: "SB1K123400000441",
    type: "Used",
    site: "Leeds",
    keys: "Cabinet B",
    days: 6,
    price: 18950,
    miles: 22110,
    missing: false,
    matchedDealId: "ORD-1055",
  },
  {
    id: "STK-05",
    vehicle: "Puma Titanium",
    colour: "Desert Island Blue",
    vin: "WF0AXXWPMK123882",
    type: "New",
    site: "Harrogate",
    keys: "Cabinet A",
    days: 0,
    price: 26440,
    miles: null,
    missing: false,
    matchedDealId: "ORD-1051",
  },
  {
    id: "STK-06",
    vehicle: "Yaris Cross Excel",
    colour: "Juniper Blue",
    vin: "JTDK123400000903",
    type: "Used",
    site: "Wakefield",
    keys: "Cabinet B",
    days: 9,
    price: 21750,
    miles: 15340,
    missing: false,
    matchedDealId: "ORD-1062",
  },
  {
    id: "STK-07",
    vehicle: "Ranger Wildtrak",
    colour: "Agate Black",
    vin: "WF0AXXWPMA118773",
    type: "Used",
    site: "Poole",
    keys: "Cabinet A",
    days: 21,
    price: 33995,
    miles: 28600,
    missing: false,
    matchedDealId: null,
  },
];

export const seedBriefs: Brief[] = [
  {
    id: "BR-1",
    name: "A. Patel",
    want: "Kuga or equivalent SUV",
    colour: "White or grey",
    maxMiles: 20000,
    maxPrice: 34000,
  },
  {
    id: "BR-2",
    name: "N. Crowe",
    want: "Small crossover, auto",
    colour: "Blue",
    maxMiles: 25000,
    maxPrice: 23000,
  },
  {
    id: "BR-3",
    name: "Fleet — 2 trucks",
    want: "Ranger / pickup",
    colour: "Any",
    maxMiles: 40000,
    maxPrice: 36000,
  },
];

export const monthTarget = { units: 17, gp: 30000 };

export const modules = [
  {
    n: "01",
    title: "Stock",
    body: "New and used in one glass. Ingest from manufacturer, Excel or HTML. Missing-car flags, site and key location.",
  },
  {
    n: "02",
    title: "Locator",
    body: "Factory to port to boat to dealer rail, mapped to real status codes — not tribal knowledge.",
  },
  {
    n: "03",
    title: "Pipeline",
    body: "Every live order: stage, VIN, reg, handover, confirmed deal, month-end flag.",
  },
  {
    n: "04",
    title: "Overview + GP",
    body: "Tick columns sales actually use. GP on the row. Delivered month versus target.",
  },
  {
    n: "05",
    title: "Customer view",
    body: "Their car, their to-dos, messages, handover reminders. No extra app.",
  },
  {
    n: "06",
    title: "Keep in mind",
    body: "Scan live stock against saved customer briefs — model, colour, miles, price.",
  },
] as const;

export const jobs = [
  {
    title: "Stock is a spreadsheet",
    body: "Used and new sit in different systems. Locator status is tribal knowledge.",
  },
  {
    title: "The deal lives in heads",
    body: "Handover diary, Connect, identity, PX V5 — ticked in six places or none.",
  },
  {
    title: "GP is after the fact",
    body: "Month-end deals and extras are discovered in a board pack.",
  },
  {
    title: "The customer is blind",
    body: "They chase the sales exec. The exec chases the factory.",
  },
] as const;

export const reasons = [
  {
    title: "Proof",
    body: "Already running live deals, stock ingest, and customer messages at a franchised site.",
  },
  {
    title: "Speed to desk",
    body: "Sales can be on Overview the week the instance is stood up — not after a six-month DMS project.",
  },
  {
    title: "Their brand",
    body: "Logos, colour, phone, legal and domain are theirs. It should not look like a vendor product on the iPad.",
  },
  {
    title: "Narrow job",
    body: "It does not replace the DMS. It sits on the bits the DMS is bad at: journey, locator, GP hygiene.",
  },
] as const;

export const tiers = [
  {
    name: "Site",
    setup: "£4,500",
    month: "£349 / month",
    body: "One rooftop. Brand pack. Stock + deals + customer view. Excel / HTML ingest.",
  },
  {
    name: "Group",
    setup: "£8,500",
    month: "£249 / site / mo",
    body: "2–8 sites. Shared pipeline, per-site stock, group Overview. One contract.",
    featured: true,
  },
  {
    name: "Franchise pack",
    setup: "+£1,500",
    month: "+£99 / month",
    body: "Manufacturer ingest, locator mapping, option codes. Priced per franchise.",
  },
] as const;

export const dispatch = [
  { n: "01", title: "Brand pack", body: "Logo SVG, hex colours, dealer name, phone, email, legal entity, domain." },
  { n: "02", title: "Tenant config", body: "JSON dropped into tenants/{slug}.json — no App.jsx edits." },
  { n: "03", title: "Data plane", body: "New Supabase project, migrations, RLS, first staff user." },
  { n: "04", title: "Ingest", body: "Excel / HTML now. Manufacturer feed only if they have credentials." },
  { n: "05", title: "Ship", body: "Vercel project + custom domain + staff login link. Half a day, not a project." },
] as const;
