import type { Brief, CarType, Deal, StockCar } from "./demo-data";

export type BrandId =
  | "skoda"
  | "audi"
  | "vw"
  | "seat"
  | "cupra"
  | "bmw"
  | "mini"
  | "mercedes"
  | "ford"
  | "toyota"
  | "vauxhall"
  | "volvo"
  | "independent";

export type FleetCar = {
  vehicle: string;
  colour: string;
  vin: string;
  type: CarType;
  price: number;
  miles: number | null;
  keys: StockCar["keys"];
  days: number;
};

export type Brand = {
  id: BrandId;
  label: string;
  word: string;
  accent: string;
  glow: string;
  ink: string;
  fleet: FleetCar[];
  wants: [string, string, string];
};

export const BRANDS: Record<BrandId, Brand> = {
  skoda: {
    id: "skoda",
    label: "Škoda",
    word: "ŠKODA",
    accent: "#4BA82E",
    glow: "rgba(75, 168, 46, 0.42)",
    ink: "#0B0F14",
    wants: ["Kodiaq or equivalent SUV", "Enyaq, auto", "Superb Estate"],
    fleet: [
      { vehicle: "Octavia SE L", colour: "Race Blue", vin: "TMBJJ7NE6R0123001", type: "New", price: 28995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Kodiaq SportLine", colour: "Graphite Grey", vin: "TMBLE7NS5R0000218", type: "Used", price: 33450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Enyaq 85 Edition", colour: "Sage Green", vin: "TMBJE7NP8R0123882", type: "New", price: 42940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Superb Estate L&K", colour: "Black Magic", vin: "TMBBW7NP4R0000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Kamiq SE L", colour: "Velvet Red", vin: "TMBGJ6NS2R0124010", type: "New", price: 26440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Fabia Monte Carlo", colour: "Pearl White", vin: "TMBFT6NS9R0000903", type: "Used", price: 16750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Scala SE", colour: "Storm Grey", vin: "TMBEN6NS1R0118773", type: "Used", price: 14995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  audi: {
    id: "audi",
    label: "Audi",
    word: "AUDI",
    accent: "#BB0A30",
    glow: "rgba(187, 10, 48, 0.38)",
    ink: "#0B0F14",
    wants: ["Q5 or equivalent SUV", "A3 Sportback, auto", "e-tron"],
    fleet: [
      { vehicle: "A3 Sportback S line", colour: "Glacier White", vin: "WAUZZZ8V6R0123001", type: "New", price: 33995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Q5 S line TDI", colour: "Mythos Black", vin: "WAUZZZFY5R0000218", type: "Used", price: 38450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "A6 Avant S line", colour: "Navarra Blue", vin: "WAUZZZ4G8R0123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Q3 Black Edition", colour: "Chronos Grey", vin: "WAUZZZF3N4R000441", type: "Used", price: 28950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "A4 Saloon S line", colour: "District Green", vin: "WAUZZZF4N2R0124010", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Q2 S line", colour: "Arrow Grey", vin: "WAUZZZGA9R0000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "A1 Sportback", colour: "Python Yellow", vin: "WAUZZZGB1R0118773", type: "Used", price: 17995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  vw: {
    id: "vw",
    label: "Volkswagen",
    word: "VW",
    accent: "#00B0F0",
    glow: "rgba(0, 176, 240, 0.36)",
    ink: "#001E50",
    wants: ["Tiguan or equivalent SUV", "Golf R-Line", "ID.4"],
    fleet: [
      { vehicle: "Golf R-Line", colour: "Pure White", vin: "WVWZZZ1KZRW123001", type: "New", price: 32995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Tiguan Elegance", colour: "Dolphin Grey", vin: "WVGZZZ5NZRW000218", type: "Used", price: 35450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "ID.4 Pro", colour: "Grenadilla Black", vin: "WVGZZZE2ZRW123882", type: "New", price: 44940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Passat Elegance", colour: "Kings Red", vin: "WVWZZZ3CZRW000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Polo Life", colour: "Reef Blue", vin: "WVWZZZAWZRW124010", type: "New", price: 22440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "T-Roc R-Line", colour: "Indigo Blue", vin: "WVGZZZA1ZRW000903", type: "Used", price: 23750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Transporter T6.1", colour: "Cherry Red", vin: "WV1ZZZ7HZRW118773", type: "Used", price: 28995, miles: 41200, keys: "Unknown", days: 38 },
    ],
  },
  seat: {
    id: "seat",
    label: "SEAT",
    word: "SEAT",
    accent: "#CF0029",
    glow: "rgba(207, 0, 41, 0.38)",
    ink: "#0B0F14",
    wants: ["Ateca or equivalent SUV", "Leon FR, auto", "Arona"],
    fleet: [
      { vehicle: "Leon FR", colour: "Desire Red", vin: "VSSZZZ5FZRW123001", type: "New", price: 27995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Ateca FR", colour: "Nevada White", vin: "VSSZZZ5PZRW000218", type: "Used", price: 24450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Arona FR", colour: "Magnetic Grey", vin: "VSSZZZKHZRW123882", type: "New", price: 25440, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Ibiza FR", colour: "Mystery Blue", vin: "VSSZZZ6JZRW000441", type: "Used", price: 16950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Tarraco FR", colour: "Black Matt", vin: "VSSZZZKN2RW124010", type: "New", price: 38440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Leon Estate FR", colour: "Urban Silver", vin: "VSSZZZ5F9RW000903", type: "Used", price: 19750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Mii Electric", colour: "White", vin: "VSSZZZAA1RW118773", type: "Used", price: 10995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  cupra: {
    id: "cupra",
    label: "Cupra",
    word: "CUPRA",
    accent: "#C45C26",
    glow: "rgba(196, 92, 38, 0.42)",
    ink: "#0B0F14",
    wants: ["Formentor VZ", "Born, auto", "Tavascan"],
    fleet: [
      { vehicle: "Formentor VZ", colour: "Magnetic Tech", vin: "VSSZZZKM6RW123001", type: "New", price: 42995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Leon VZ", colour: "Graphene Grey", vin: "VSSZZZKM5RW000218", type: "Used", price: 31450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Tavascan VZ", colour: "Century Bronze", vin: "VSSZZZKM8RW123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Born VZ", colour: "Aurora Blue", vin: "VSSZZZNE4RW000441", type: "Used", price: 28950, miles: 12110, keys: "Cabinet B", days: 6 },
      { vehicle: "Formentor V1", colour: "Dark Forest", vin: "VSSZZZKM2RW124010", type: "New", price: 36440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Ateca VZ", colour: "Nevada White", vin: "VSSZZZ5P9RW000903", type: "Used", price: 24750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Leon Estate VZ", colour: "Midnight Black", vin: "VSSZZZKM1RW118773", type: "Used", price: 26995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  bmw: {
    id: "bmw",
    label: "BMW",
    word: "BMW",
    accent: "#1C69D4",
    glow: "rgba(28, 105, 212, 0.42)",
    ink: "#0B0F14",
    wants: ["X5 or equivalent SUV", "3 Series M Sport", "iX"],
    fleet: [
      { vehicle: "3 Series M Sport", colour: "Alpine White", vin: "WBA31EW060123001", type: "New", price: 44995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "X5 xDrive40d", colour: "Black Sapphire", vin: "WBAJA4C05R000218", type: "Used", price: 58450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "iX xDrive40", colour: "Mineral White", vin: "WB5106100R123882", type: "New", price: 72940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "1 Series M Sport", colour: "Fire Red", vin: "WBA7T12040R000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "X1 xDrive20d", colour: "Phytonic Blue", vin: "WBA31CW020R124010", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "5 Series M Sport", colour: "Tanzanite Blue", vin: "WBAJA2C09R0000903", type: "Used", price: 33750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "2 Series Gran Coupe", colour: "Storm Bay", vin: "WBA73AK01R118773", type: "Used", price: 22995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  mini: {
    id: "mini",
    label: "MINI",
    word: "MINI",
    accent: "#D42E12",
    glow: "rgba(212, 46, 18, 0.38)",
    ink: "#0B0F14",
    wants: ["Countryman", "Cooper S, auto", "Aceman"],
    fleet: [
      { vehicle: "Cooper S", colour: "Chili Red", vin: "WMW31GA060123001", type: "New", price: 29995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Countryman C", colour: "British Racing Green", vin: "WMW31GA05R000218", type: "Used", price: 32450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Aceman SE", colour: "White Silver", vin: "WMW31GA08R123882", type: "New", price: 36940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Cooper JCW", colour: "Midnight Black", vin: "WMW31GA04R000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Cooper Electric", colour: "Zesty Yellow", vin: "WMW31GA02R124010", type: "New", price: 33440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Clubman Cooper S", colour: "Island Blue", vin: "WMW31GA09R0000903", type: "Used", price: 19750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Convertible Cooper", colour: "Moonwalk Grey", vin: "WMW31GA01R118773", type: "Used", price: 18995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  mercedes: {
    id: "mercedes",
    label: "Mercedes-Benz",
    word: "MERCEDES",
    accent: "#C8C8C8",
    glow: "rgba(200, 200, 200, 0.28)",
    ink: "#0B0F14",
    wants: ["GLC or equivalent SUV", "A-Class AMG Line", "EQA"],
    fleet: [
      { vehicle: "A-Class AMG Line", colour: "Polar White", vin: "WDD1770841R123001", type: "New", price: 36995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "GLC 220d AMG Line", colour: "Obsidian Black", vin: "WDC2532041R000218", type: "Used", price: 45450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "EQA 250 AMG Line", colour: "Mountain Grey", vin: "W1N2437841R123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "C-Class AMG Line", colour: "Selenite Grey", vin: "WDD2060421R000441", type: "Used", price: 32950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "GLE 300d", colour: "Emerald Green", vin: "W1N1671191R124010", type: "New", price: 72440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "CLA AMG Line", colour: "Cosmos Black", vin: "WDD1183511R000903", type: "Used", price: 26750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Sprinter 315", colour: "Arctic White", vin: "W1V9106331R118773", type: "Used", price: 28995, miles: 41200, keys: "Unknown", days: 38 },
    ],
  },
  ford: {
    id: "ford",
    label: "Ford",
    word: "FORD",
    accent: "#2A6BAC",
    glow: "rgba(42, 107, 172, 0.4)",
    ink: "#0B0F14",
    wants: ["Kuga or equivalent SUV", "Puma, auto", "Ranger / pickup"],
    fleet: [
      { vehicle: "Kuga ST-Line 1.5", colour: "Frozen White", vin: "WF0AXXWPMA123001", type: "New", price: 32995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Puma Titanium", colour: "Desert Island Blue", vin: "WF0AXXWPMK123882", type: "Used", price: 21450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Explorer ST-Line", colour: "Magnetic", vin: "WF0AXXWPMA124010", type: "New", price: 39940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Focus ST-Line", colour: "Fantastic Red", vin: "WF0AXXWPMK000441", type: "Used", price: 18950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Ranger Wildtrak", colour: "Agate Black", vin: "WF0AXXWPMA118773", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Fiesta ST-Line", colour: "Race Red", vin: "WF0AXXWPMK119004", type: "Used", price: 12995, miles: 41200, keys: "Unknown", days: 38 },
      { vehicle: "Transit Custom", colour: "Blazer Blue", vin: "WF0AXXTTGA000903", type: "Used", price: 24995, miles: 28600, keys: "Cabinet B", days: 9 },
    ],
  },
  toyota: {
    id: "toyota",
    label: "Toyota",
    word: "TOYOTA",
    accent: "#EB0A1E",
    glow: "rgba(235, 10, 30, 0.36)",
    ink: "#0B0F14",
    wants: ["RAV4 or equivalent SUV", "Yaris Cross, auto", "Hilux"],
    fleet: [
      { vehicle: "RAV4 Design Hybrid", colour: "Silver Metallic", vin: "JTMW123400000218", type: "Used", price: 27450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Corolla Icon Tech", colour: "Night Time Black", vin: "SB1K123400000441", type: "Used", price: 18950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "C-HR Excel", colour: "Emotional Red", vin: "JTNK123400123001", type: "New", price: 32940, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Yaris Cross Excel", colour: "Juniper Blue", vin: "JTDK123400000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Land Cruiser", colour: "Precious White", vin: "JTMH123400124010", type: "New", price: 74940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Hilux Invincible", colour: "Decuma Grey", vin: "AHTC123400118773", type: "Used", price: 33995, miles: 28600, keys: "Cabinet A", days: 21 },
      { vehicle: "Aygo X Edge", colour: "Jupiter Red", vin: "JTDK123400119004", type: "Used", price: 12995, miles: 18400, keys: "Unknown", days: 38 },
    ],
  },
  vauxhall: {
    id: "vauxhall",
    label: "Vauxhall",
    word: "VAUXHALL",
    accent: "#E2001A",
    glow: "rgba(226, 0, 26, 0.36)",
    ink: "#0B0F14",
    wants: ["Grandland or equivalent SUV", "Mokka GS, auto", "Combo"],
    fleet: [
      { vehicle: "Mokka GS", colour: "Power Red", vin: "W0VZ123400123001", type: "New", price: 26995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "Grandland GS", colour: "Carbon Black", vin: "W0VZ123400000218", type: "Used", price: 24450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Astra GS", colour: "Quartz Grey", vin: "W0VZ123400123882", type: "New", price: 29440, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "Corsa GS", colour: "Jade White", vin: "W0VZ123400000441", type: "Used", price: 14950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Frontera GS", colour: "Vertigo Blue", vin: "W0VZ123400124010", type: "New", price: 27440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "Combo Life", colour: "Moonstone Grey", vin: "W0VZ123400000903", type: "Used", price: 17750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Vivaro", colour: "Kaolin White", vin: "W0VZ123400118773", type: "Used", price: 19995, miles: 41200, keys: "Unknown", days: 38 },
    ],
  },
  volvo: {
    id: "volvo",
    label: "Volvo",
    word: "VOLVO",
    accent: "#1C6BBA",
    glow: "rgba(28, 107, 186, 0.4)",
    ink: "#0B0F14",
    wants: ["XC60 or equivalent SUV", "EX30, auto", "V60"],
    fleet: [
      { vehicle: "XC60 Plus B5", colour: "Crystal White", vin: "YV1UZ12340123001", type: "New", price: 48995, miles: 12, keys: "Cabinet A", days: 4 },
      { vehicle: "XC40 Plus", colour: "Onyx Black", vin: "YV1CM12340000218", type: "Used", price: 32450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "EX30 Ultra", colour: "Cloud Blue", vin: "YV1UZ12340123882", type: "New", price: 42940, miles: null, keys: "Cabinet A", days: 0 },
      { vehicle: "V60 Plus", colour: "Denim Blue", vin: "YV1ZW12340000441", type: "Used", price: 26950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "XC90 Plus", colour: "Pine Grey", vin: "YV1CM12340124010", type: "New", price: 72440, miles: 8, keys: "Cabinet A", days: 2 },
      { vehicle: "C40 Recharge", colour: "Sage Green", vin: "YV1UZ12340000903", type: "Used", price: 29750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "S60 Plus", colour: "Bright Silver", vin: "YV1ZW12340118773", type: "Used", price: 22995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
  independent: {
    id: "independent",
    label: "Independent",
    word: "INDEPENDENT",
    accent: "#D9A24B",
    glow: "rgba(217, 162, 75, 0.36)",
    ink: "#20160A",
    wants: ["Family SUV", "Small crossover, auto", "Fleet — 2 trucks"],
    fleet: [
      { vehicle: "Kuga ST-Line 1.5", colour: "Frozen White", vin: "WF0AXXWPMA123001", type: "Used", price: 22995, miles: 24120, keys: "Cabinet A", days: 4 },
      { vehicle: "RAV4 Design Hybrid", colour: "Silver Metallic", vin: "JTMW123400000218", type: "Used", price: 27450, miles: 18420, keys: "With PDI", days: 11 },
      { vehicle: "Golf R-Line", colour: "Pure White", vin: "WVWZZZ1KZRW123882", type: "Used", price: 21940, miles: 19800, keys: "Cabinet A", days: 9 },
      { vehicle: "3 Series M Sport", colour: "Alpine White", vin: "WBA31EW060000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6 },
      { vehicle: "Q3 Black Edition", colour: "Chronos Grey", vin: "WAUZZZF3N4R124010", type: "Used", price: 26440, miles: 31200, keys: "Cabinet A", days: 14 },
      { vehicle: "Yaris Cross Excel", colour: "Juniper Blue", vin: "JTDK123400000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9 },
      { vehicle: "Ranger Wildtrak", colour: "Agate Black", vin: "WF0AXXWPMA118773", type: "Used", price: 33995, miles: 28600, keys: "Unknown", days: 38 },
    ],
  },
};

export const BRAND_LIST = Object.values(BRANDS);

export function isBrandId(v: unknown): v is BrandId {
  return typeof v === "string" && v in BRANDS;
}

export type DemoSearch = {
  group?: string;
  brand?: BrandId;
  site?: string;
};

export function rooftopSearch(input: {
  company: string;
  brandId: BrandId;
  site: string;
}): DemoSearch {
  const group = input.company.trim();
  const site = input.site.trim();
  return {
    group: group || undefined,
    brand: input.brandId,
    site: site || undefined,
  };
}

export const ROOFTOP_PRESETS = [
  { company: "Northbridge Motor Co.", brandId: "audi" as const, site: "York" },
  { company: "Harbour Park", brandId: "ford" as const, site: "Poole" },
  { company: "Ridgemont Motor Group", brandId: "bmw" as const, site: "Harrogate" },
];

const DEAL_TEMPLATES: Omit<Deal, "vehicle" | "colour" | "vin" | "type" | "site">[] = [
  { id: "ORD-1042", customer: "Priya Shah", customerType: "Finance", stageIndex: 3, locatorIndex: 4, gp: 2140, monthEnd: true, handover: "2026-09-22", confirmed: true, missing: ["V5"] },
  { id: "ORD-1048", customer: "Callum Reid", customerType: "Cash", stageIndex: 2, locatorIndex: 5, gp: 980, monthEnd: false, handover: "2026-09-18", confirmed: true, missing: ["Connect", "Identity"] },
  { id: "ORD-1051", customer: "Helen Okonkwo", customerType: "Motability", stageIndex: 1, locatorIndex: 2, gp: null, monthEnd: true, handover: null, confirmed: false, missing: ["GP", "Locator confirm"] },
  { id: "ORD-1055", customer: "James Lyle", customerType: "Finance", stageIndex: 4, locatorIndex: 5, gp: 1640, monthEnd: true, handover: "2026-09-19", confirmed: true, missing: [] },
  { id: "ORD-1059", customer: "Sofia Berg", customerType: "Lease", stageIndex: 0, locatorIndex: 0, gp: 1880, monthEnd: false, handover: null, confirmed: false, missing: ["Handover date"] },
  { id: "ORD-1062", customer: "Owen MacKay", customerType: "Finance", stageIndex: 3, locatorIndex: 5, gp: -120, monthEnd: true, handover: "2026-09-25", confirmed: true, missing: ["PX V5", "GP"] },
];

const BRIEF_NAMES = ["A. Patel", "N. Crowe", "Fleet desk"];

export function mintBook(brandId: BrandId, site: string): {
  deals: Deal[];
  stock: StockCar[];
  briefs: Brief[];
} {
  const brand = BRANDS[brandId];
  const fleet = brand.fleet;
  const deals: Deal[] = DEAL_TEMPLATES.map((tpl, i) => {
    const car = fleet[i] ?? fleet[0]!;
    return {
      ...tpl,
      vehicle: car.vehicle,
      colour: car.colour,
      vin: car.vin,
      type: car.type,
      site,
    };
  });
  const stock: StockCar[] = fleet.map((car, i) => ({
    id: `STK-0${i + 1}`,
    vehicle: car.vehicle,
    colour: car.colour,
    vin: car.vin,
    type: car.type,
    site,
    keys: car.keys,
    days: car.days,
    price: car.price,
    miles: car.miles,
    missing: car.keys === "Unknown",
    matchedDealId: i < DEAL_TEMPLATES.length ? DEAL_TEMPLATES[i]!.id : null,
  }));
  const briefs: Brief[] = brand.wants.map((want, i) => ({
    id: `BR-${i + 1}`,
    name: BRIEF_NAMES[i] ?? "Walk-in",
    want,
    colour: i === 2 ? "Any" : fleet[i]?.colour.split(" ").slice(-1)[0] ?? "Any",
    maxMiles: i === 2 ? 40000 : 25000,
    maxPrice: fleet[i]?.price ? fleet[i]!.price + 2000 : 30000,
  }));
  return { deals, stock, briefs };
}

export function groupMark(company: string) {
  const stop = new Set([
    "motor",
    "motors",
    "group",
    "company",
    "co",
    "ltd",
    "limited",
    "the",
    "automotive",
    "cars",
    "plc",
    "holdings",
    "of",
    "and",
  ]);
  const words = company
    .replace(/[.,+]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  if (words.length >= 2) return (words[0]![0] + words[1]![0]).toUpperCase();
  const w = words[0] ?? "YOU";
  return w.length <= 12 ? w.toUpperCase() : w.slice(0, 10).toUpperCase();
}

export function companySlug(company: string) {
  const slug = company
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return slug || "rooftop";
}
