import type { Brief, CarType, Deal, StockCar } from "./demo-data";
import { SITE_SPOT_OPTIONS, checklistKeysFor } from "./demo-data";

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
  derivative?: string;
  reg?: string;
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
      { vehicle: "Octavia SE L", derivative: "1.5 TSI", colour: "Race Blue", vin: "TMBJJ7NE6R0123001", type: "New", price: 28995, miles: 12, keys: "Cabinet A", days: 4, reg: "SB26 OCT" },
      { vehicle: "Kodiaq SportLine", derivative: "2.0 TDI", colour: "Graphite Grey", vin: "TMBLE7NS5R0000218", type: "Used", price: 33450, miles: 18420, keys: "With PDI", days: 11, reg: "SK24 KOD" },
      { vehicle: "Enyaq 85 Edition", derivative: "85", colour: "Sage Green", vin: "TMBJE7NP8R0123882", type: "New", price: 42940, miles: null, keys: "Cabinet A", days: 0, reg: "SB26 ENY" },
      { vehicle: "Superb Estate L&K", derivative: "2.0 TDI", colour: "Black Magic", vin: "TMBBW7NP4R0000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6, reg: "SK23 SUP" },
      { vehicle: "Kamiq SE L", derivative: "1.0 TSI", colour: "Velvet Red", vin: "TMBGJ6NS2R0124010", type: "New", price: 26440, miles: 8, keys: "Cabinet A", days: 2, reg: "SB26 KAM" },
      { vehicle: "Fabia Monte Carlo", derivative: "1.0 TSI", colour: "Pearl White", vin: "TMBFT6NS9R0000903", type: "Used", price: 16750, miles: 15340, keys: "Cabinet B", days: 9, reg: "SK24 FAB" },
      { vehicle: "Scala SE", derivative: "1.0 TSI", colour: "Storm Grey", vin: "TMBEN6NS1R0118773", type: "Used", price: 14995, miles: 28600, keys: "Unknown", days: 38, reg: "SK22 SCA" },
      { vehicle: "Elroq 85 Sportline", derivative: "85", colour: "Race Blue", vin: "TMBJE7NP8R0124991", type: "New", price: 38940, miles: 6, keys: "Cabinet A", days: 3, reg: "SB26 ELR" },
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
      { vehicle: "A3 Sportback S line", derivative: "35 TFSI", colour: "Glacier White", vin: "WAUZZZ8V6R0123001", type: "New", price: 33995, miles: 12, keys: "Cabinet A", days: 4, reg: "AU26 A3S" },
      { vehicle: "Q5 S line TDI", derivative: "40 TDI", colour: "Mythos Black", vin: "WAUZZZFY5R0000218", type: "Used", price: 38450, miles: 18420, keys: "With PDI", days: 11, reg: "AU24 Q5S" },
      { vehicle: "A6 Avant S line", derivative: "40 TDI", colour: "Navarra Blue", vin: "WAUZZZ4G8R0123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0, reg: "AU26 A6A" },
      { vehicle: "Q3 Black Edition", derivative: "35 TFSI", colour: "Chronos Grey", vin: "WAUZZZF3N4R000441", type: "Used", price: 28950, miles: 22110, keys: "Cabinet B", days: 6, reg: "AU23 Q3B" },
      { vehicle: "A4 Saloon S line", derivative: "35 TFSI", colour: "District Green", vin: "WAUZZZF4N2R0124010", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2, reg: "AU26 A4S" },
      { vehicle: "Q2 S line", derivative: "30 TFSI", colour: "Arrow Grey", vin: "WAUZZZGA9R0000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9, reg: "AU24 Q2S" },
      { vehicle: "A1 Sportback", derivative: "25 TFSI", colour: "Python Yellow", vin: "WAUZZZGB1R0118773", type: "Used", price: 17995, miles: 28600, keys: "Unknown", days: 38, reg: "AU22 A1S" },
      { vehicle: "Q4 e-tron", derivative: "45", colour: "Aurora Violet", vin: "WAUZZZFY8R0124991", type: "New", price: 48940, miles: 6, keys: "Cabinet A", days: 3, reg: "AU26 Q4E" },
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
      { vehicle: "Golf R-Line", derivative: "1.5 eTSI", colour: "Pure White", vin: "WVWZZZ1KZRW123001", type: "New", price: 32995, miles: 12, keys: "Cabinet A", days: 4, reg: "VW26 GLF" },
      { vehicle: "Tiguan Elegance", derivative: "1.5 eTSI", colour: "Dolphin Grey", vin: "WVGZZZ5NZRW000218", type: "Used", price: 35450, miles: 18420, keys: "With PDI", days: 11, reg: "VW24 TIG" },
      { vehicle: "ID.4 Pro", derivative: "Pro", colour: "Grenadilla Black", vin: "WVGZZZE2ZRW123882", type: "New", price: 44940, miles: null, keys: "Cabinet A", days: 0, reg: "VW26 ID4" },
      { vehicle: "Passat Elegance", derivative: "2.0 TDI", colour: "Kings Red", vin: "WVWZZZ3CZRW000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6, reg: "VW23 PAS" },
      { vehicle: "Polo Life", derivative: "1.0 TSI", colour: "Reef Blue", vin: "WVWZZZAWZRW124010", type: "New", price: 22440, miles: 8, keys: "Cabinet A", days: 2, reg: "VW26 POL" },
      { vehicle: "T-Roc R-Line", derivative: "1.5 TSI", colour: "Indigo Blue", vin: "WVGZZZA1ZRW000903", type: "Used", price: 23750, miles: 15340, keys: "Cabinet B", days: 9, reg: "VW24 ROC" },
      { vehicle: "Transporter T6.1", derivative: "2.0 TDI", colour: "Cherry Red", vin: "WV1ZZZ7HZRW118773", type: "Used", price: 28995, miles: 41200, keys: "Unknown", days: 38, reg: "VW22 T61" },
      { vehicle: "ID.7 Pro", derivative: "Pro", colour: "Moonstone Grey", vin: "WVGZZZE2ZRW124991", type: "New", price: 51940, miles: 6, keys: "Cabinet A", days: 3, reg: "VW26 ID7" },
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
      { vehicle: "Leon FR", colour: "Desire Red", vin: "VSSZZZ5FZRW123001", type: "New", price: 27995, miles: 12, keys: "Cabinet A", days: 4, reg: "SE26 LEO" },
      { vehicle: "Ateca FR", colour: "Nevada White", vin: "VSSZZZ5PZRW000218", type: "Used", price: 24450, miles: 18420, keys: "With PDI", days: 11, reg: "SE24 ATE" },
      { vehicle: "Arona FR", colour: "Magnetic Grey", vin: "VSSZZZKHZRW123882", type: "New", price: 25440, miles: null, keys: "Cabinet A", days: 0, reg: "SE26 ARO" },
      { vehicle: "Ibiza FR", colour: "Mystery Blue", vin: "VSSZZZ6JZRW000441", type: "Used", price: 16950, miles: 22110, keys: "Cabinet B", days: 6, reg: "SE23 IBI" },
      { vehicle: "Tarraco FR", colour: "Black Matt", vin: "VSSZZZKN2RW124010", type: "New", price: 38440, miles: 8, keys: "Cabinet A", days: 2, reg: "SE26 TAR" },
      { vehicle: "Leon Estate FR", colour: "Urban Silver", vin: "VSSZZZ5F9RW000903", type: "Used", price: 19750, miles: 15340, keys: "Cabinet B", days: 9, reg: "SE24 LES" },
      { vehicle: "Mii Electric", colour: "White", vin: "VSSZZZAA1RW118773", type: "Used", price: 10995, miles: 28600, keys: "Unknown", days: 38, reg: "SE22 MII" },
      { vehicle: "Leon e-Hybrid FR", colour: "Desire Red", vin: "VSSZZZ5FZRW124991", type: "New", price: 33440, miles: 6, keys: "Cabinet A", days: 3, reg: "SE26 LEH" },
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
      { vehicle: "Formentor VZ", colour: "Magnetic Tech", vin: "VSSZZZKM6RW123001", type: "New", price: 42995, miles: 12, keys: "Cabinet A", days: 4, reg: "CU26 FOR" },
      { vehicle: "Leon VZ", colour: "Graphene Grey", vin: "VSSZZZKM5RW000218", type: "Used", price: 31450, miles: 18420, keys: "With PDI", days: 11, reg: "CU24 LEO" },
      { vehicle: "Tavascan VZ", colour: "Century Bronze", vin: "VSSZZZKM8RW123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0, reg: "CU26 TAV" },
      { vehicle: "Born VZ", colour: "Aurora Blue", vin: "VSSZZZNE4RW000441", type: "Used", price: 28950, miles: 12110, keys: "Cabinet B", days: 6, reg: "CU24 BRN" },
      { vehicle: "Formentor V1", colour: "Dark Forest", vin: "VSSZZZKM2RW124010", type: "New", price: 36440, miles: 8, keys: "Cabinet A", days: 2, reg: "CU26 FV1" },
      { vehicle: "Ateca VZ", colour: "Nevada White", vin: "VSSZZZ5P9RW000903", type: "Used", price: 24750, miles: 15340, keys: "Cabinet B", days: 9, reg: "CU23 ATE" },
      { vehicle: "Leon Estate VZ", colour: "Midnight Black", vin: "VSSZZZKM1RW118773", type: "Used", price: 26995, miles: 28600, keys: "Unknown", days: 38, reg: "CU22 LES" },
      { vehicle: "Terramar VZ", colour: "Magnetic Tech", vin: "VSSZZZKM6RW124991", type: "New", price: 44940, miles: 6, keys: "Cabinet A", days: 3, reg: "CU26 TER" },
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
      { vehicle: "3 Series M Sport", colour: "Alpine White", vin: "WBA31EW060123001", type: "New", price: 44995, miles: 12, keys: "Cabinet A", days: 4, reg: "BM26 3MS" },
      { vehicle: "X5 xDrive40d", colour: "Black Sapphire", vin: "WBAJA4C05R000218", type: "Used", price: 58450, miles: 18420, keys: "With PDI", days: 11, reg: "BM24 X5D" },
      { vehicle: "iX xDrive40", colour: "Mineral White", vin: "WB5106100R123882", type: "New", price: 72940, miles: null, keys: "Cabinet A", days: 0, reg: "BM26 IX4" },
      { vehicle: "1 Series M Sport", colour: "Fire Red", vin: "WBA7T12040R000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6, reg: "BM23 1MS" },
      { vehicle: "X1 xDrive20d", colour: "Phytonic Blue", vin: "WBA31CW020R124010", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2, reg: "BM26 X1D" },
      { vehicle: "5 Series M Sport", colour: "Tanzanite Blue", vin: "WBAJA2C09R0000903", type: "Used", price: 33750, miles: 15340, keys: "Cabinet B", days: 9, reg: "BM24 5MS" },
      { vehicle: "2 Series Gran Coupe", colour: "Storm Bay", vin: "WBA73AK01R118773", type: "Used", price: 22995, miles: 28600, keys: "Unknown", days: 38, reg: "BM22 2GC" },
      { vehicle: "i4 eDrive40", colour: "Brooklyn Grey", vin: "WBA31EW060124991", type: "New", price: 58940, miles: 6, keys: "Cabinet A", days: 3, reg: "BM26 I4E" },
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
      { vehicle: "Cooper S", colour: "Chili Red", vin: "WMW31GA060123001", type: "New", price: 29995, miles: 12, keys: "Cabinet A", days: 4, reg: "MN26 CPS" },
      { vehicle: "Countryman C", colour: "British Racing Green", vin: "WMW31GA05R000218", type: "Used", price: 32450, miles: 18420, keys: "With PDI", days: 11, reg: "MN24 CTR" },
      { vehicle: "Aceman SE", colour: "White Silver", vin: "WMW31GA08R123882", type: "New", price: 36940, miles: null, keys: "Cabinet A", days: 0, reg: "MN26 ACE" },
      { vehicle: "Cooper JCW", colour: "Midnight Black", vin: "WMW31GA04R000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6, reg: "MN23 JCW" },
      { vehicle: "Cooper Electric", colour: "Zesty Yellow", vin: "WMW31GA02R124010", type: "New", price: 33440, miles: 8, keys: "Cabinet A", days: 2, reg: "MN26 CPE" },
      { vehicle: "Clubman Cooper S", colour: "Island Blue", vin: "WMW31GA09R0000903", type: "Used", price: 19750, miles: 15340, keys: "Cabinet B", days: 9, reg: "MN24 CLB" },
      { vehicle: "Convertible Cooper", colour: "Moonwalk Grey", vin: "WMW31GA01R118773", type: "Used", price: 18995, miles: 28600, keys: "Unknown", days: 38, reg: "MN22 CVT" },
      { vehicle: "Countryman SE", colour: "Rebel Green", vin: "WMW31GA060124991", type: "New", price: 39940, miles: 6, keys: "Cabinet A", days: 3, reg: "MN26 CSE" },
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
      { vehicle: "A-Class AMG Line", colour: "Polar White", vin: "WDD1770841R123001", type: "New", price: 36995, miles: 12, keys: "Cabinet A", days: 4, reg: "MB26 ACL" },
      { vehicle: "GLC 220d AMG Line", colour: "Obsidian Black", vin: "WDC2532041R000218", type: "Used", price: 45450, miles: 18420, keys: "With PDI", days: 11, reg: "MB24 GLC" },
      { vehicle: "EQA 250 AMG Line", colour: "Mountain Grey", vin: "W1N2437841R123882", type: "New", price: 52940, miles: null, keys: "Cabinet A", days: 0, reg: "MB26 EQA" },
      { vehicle: "C-Class AMG Line", colour: "Selenite Grey", vin: "WDD2060421R000441", type: "Used", price: 32950, miles: 22110, keys: "Cabinet B", days: 6, reg: "MB23 CCL" },
      { vehicle: "GLE 300d", colour: "Emerald Green", vin: "W1N1671191R124010", type: "New", price: 72440, miles: 8, keys: "Cabinet A", days: 2, reg: "MB26 GLE" },
      { vehicle: "CLA AMG Line", colour: "Cosmos Black", vin: "WDD1183511R000903", type: "Used", price: 26750, miles: 15340, keys: "Cabinet B", days: 9, reg: "MB24 CLA" },
      { vehicle: "Sprinter 315", colour: "Arctic White", vin: "W1V9106331R118773", type: "Used", price: 28995, miles: 41200, keys: "Unknown", days: 38, reg: "MB22 SPR" },
      { vehicle: "EQB 250", colour: "Polar White", vin: "W1N2437841R124991", type: "New", price: 54940, miles: 6, keys: "Cabinet A", days: 3, reg: "MB26 EQB" },
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
      { vehicle: "Kuga ST-Line 1.5", colour: "Frozen White", vin: "WF0AXXWPMA123001", type: "New", price: 32995, miles: 12, keys: "Cabinet A", days: 4, reg: "FD26 KUG" },
      { vehicle: "Puma Titanium", colour: "Desert Island Blue", vin: "WF0AXXWPMK123882", type: "Used", price: 21450, miles: 18420, keys: "With PDI", days: 11, reg: "FD24 PUM" },
      { vehicle: "Explorer ST-Line", colour: "Magnetic", vin: "WF0AXXWPMA124010", type: "New", price: 39940, miles: null, keys: "Cabinet A", days: 0, reg: "FD26 EXP" },
      { vehicle: "Focus ST-Line", colour: "Fantastic Red", vin: "WF0AXXWPMK000441", type: "Used", price: 18950, miles: 22110, keys: "Cabinet B", days: 6, reg: "FD23 FOC" },
      { vehicle: "Ranger Wildtrak", colour: "Agate Black", vin: "WF0AXXWPMA118773", type: "New", price: 41440, miles: 8, keys: "Cabinet A", days: 2, reg: "FD26 RAN" },
      { vehicle: "Fiesta ST-Line", colour: "Race Red", vin: "WF0AXXWPMK119004", type: "Used", price: 12995, miles: 41200, keys: "Unknown", days: 38, reg: "FD22 FIE" },
      { vehicle: "Transit Custom", colour: "Blazer Blue", vin: "WF0AXXTTGA000903", type: "Used", price: 24995, miles: 28600, keys: "Cabinet B", days: 9, reg: "FD24 TRN" },
      { vehicle: "Capri", colour: "Frozen White", vin: "WF0AXXWPMA124991", type: "New", price: 42940, miles: 6, keys: "Cabinet A", days: 3, reg: "FD26 CAP" },
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
      { vehicle: "RAV4 Design Hybrid", colour: "Silver Metallic", vin: "JTMW123400000218", type: "Used", price: 27450, miles: 18420, keys: "With PDI", days: 11, reg: "TY24 RAV" },
      { vehicle: "Corolla Icon Tech", colour: "Night Time Black", vin: "SB1K123400000441", type: "Used", price: 18950, miles: 22110, keys: "Cabinet B", days: 6, reg: "TY23 COR" },
      { vehicle: "C-HR Excel", colour: "Emotional Red", vin: "JTNK123400123001", type: "New", price: 32940, miles: 12, keys: "Cabinet A", days: 4, reg: "TY26 CHR" },
      { vehicle: "Yaris Cross Excel", colour: "Juniper Blue", vin: "JTDK123400000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9, reg: "TY24 YCX" },
      { vehicle: "Land Cruiser", colour: "Precious White", vin: "JTMH123400124010", type: "New", price: 74940, miles: null, keys: "Cabinet A", days: 0, reg: "TY26 LCR" },
      { vehicle: "Hilux Invincible", colour: "Decuma Grey", vin: "AHTC123400118773", type: "Used", price: 33995, miles: 28600, keys: "Cabinet A", days: 21, reg: "TY23 HIL" },
      { vehicle: "Aygo X Edge", colour: "Jupiter Red", vin: "JTDK123400119004", type: "Used", price: 12995, miles: 18400, keys: "Unknown", days: 38, reg: "TY22 AYG" },
      { vehicle: "bZ4X", colour: "Precious Silver", vin: "JTNK123400124991", type: "New", price: 44940, miles: 6, keys: "Cabinet A", days: 3, reg: "TY26 BZ4" },
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
      { vehicle: "Mokka GS", colour: "Power Red", vin: "W0VZ123400123001", type: "New", price: 26995, miles: 12, keys: "Cabinet A", days: 4, reg: "VX26 MOK" },
      { vehicle: "Grandland GS", colour: "Carbon Black", vin: "W0VZ123400000218", type: "Used", price: 24450, miles: 18420, keys: "With PDI", days: 11, reg: "VX24 GRN" },
      { vehicle: "Astra GS", colour: "Quartz Grey", vin: "W0VZ123400123882", type: "New", price: 29440, miles: null, keys: "Cabinet A", days: 0, reg: "VX26 AST" },
      { vehicle: "Corsa GS", colour: "Jade White", vin: "W0VZ123400000441", type: "Used", price: 14950, miles: 22110, keys: "Cabinet B", days: 6, reg: "VX23 COR" },
      { vehicle: "Frontera GS", colour: "Vertigo Blue", vin: "W0VZ123400124010", type: "New", price: 27440, miles: 8, keys: "Cabinet A", days: 2, reg: "VX26 FRO" },
      { vehicle: "Combo Life", colour: "Moonstone Grey", vin: "W0VZ123400000903", type: "Used", price: 17750, miles: 15340, keys: "Cabinet B", days: 9, reg: "VX24 CMB" },
      { vehicle: "Vivaro", colour: "Kaolin White", vin: "W0VZ123400118773", type: "Used", price: 19995, miles: 41200, keys: "Unknown", days: 38, reg: "VX22 VIV" },
      { vehicle: "Mokka Electric", colour: "Power Red", vin: "W0VZ123400124991", type: "New", price: 31440, miles: 6, keys: "Cabinet A", days: 3, reg: "VX26 MKE" },
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
      { vehicle: "XC60 Plus B5", colour: "Crystal White", vin: "YV1UZ12340123001", type: "New", price: 48995, miles: 12, keys: "Cabinet A", days: 4, reg: "VL26 X60" },
      { vehicle: "XC40 Plus", colour: "Onyx Black", vin: "YV1CM12340000218", type: "Used", price: 32450, miles: 18420, keys: "With PDI", days: 11, reg: "VL24 X40" },
      { vehicle: "EX30 Ultra", colour: "Cloud Blue", vin: "YV1UZ12340123882", type: "New", price: 42940, miles: null, keys: "Cabinet A", days: 0, reg: "VL26 EX3" },
      { vehicle: "V60 Plus", colour: "Denim Blue", vin: "YV1ZW12340000441", type: "Used", price: 26950, miles: 22110, keys: "Cabinet B", days: 6, reg: "VL23 V60" },
      { vehicle: "XC90 Plus", colour: "Pine Grey", vin: "YV1CM12340124010", type: "New", price: 72440, miles: 8, keys: "Cabinet A", days: 2, reg: "VL26 X90" },
      { vehicle: "C40 Recharge", colour: "Sage Green", vin: "YV1UZ12340000903", type: "Used", price: 29750, miles: 15340, keys: "Cabinet B", days: 9, reg: "VL24 C40" },
      { vehicle: "S60 Plus", colour: "Bright Silver", vin: "YV1ZW12340118773", type: "Used", price: 22995, miles: 28600, keys: "Unknown", days: 38, reg: "VL22 S60" },
      { vehicle: "EX90 Twin", colour: "Crystal White", vin: "YV1UZ12340124991", type: "New", price: 82940, miles: 6, keys: "Cabinet A", days: 3, reg: "VL26 EX9" },
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
      { vehicle: "Kuga ST-Line 1.5", colour: "Frozen White", vin: "WF0AXXWPMA123001", type: "Used", price: 22995, miles: 24120, keys: "Cabinet A", days: 4, reg: "ND26 KUG" },
      { vehicle: "RAV4 Design Hybrid", colour: "Silver Metallic", vin: "JTMW123400000218", type: "Used", price: 27450, miles: 18420, keys: "With PDI", days: 11, reg: "ND24 RAV" },
      { vehicle: "Golf R-Line", colour: "Pure White", vin: "WVWZZZ1KZRW123882", type: "Used", price: 21940, miles: 19800, keys: "Cabinet A", days: 9, reg: "ND24 GLF" },
      { vehicle: "3 Series M Sport", colour: "Alpine White", vin: "WBA31EW060000441", type: "Used", price: 24950, miles: 22110, keys: "Cabinet B", days: 6, reg: "ND23 3MS" },
      { vehicle: "Q3 Black Edition", colour: "Chronos Grey", vin: "WAUZZZF3N4R124010", type: "Used", price: 26440, miles: 31200, keys: "Cabinet A", days: 14, reg: "ND22 Q3B" },
      { vehicle: "Yaris Cross Excel", colour: "Juniper Blue", vin: "JTDK123400000903", type: "Used", price: 21750, miles: 15340, keys: "Cabinet B", days: 9, reg: "ND24 YCX" },
      { vehicle: "Ranger Wildtrak", colour: "Agate Black", vin: "WF0AXXWPMA118773", type: "Used", price: 33995, miles: 28600, keys: "Unknown", days: 38, reg: "ND22 RAN" },
      { vehicle: "Tiguan Elegance", colour: "Dolphin Grey", vin: "WVGZZZ5NZRW124991", type: "Used", price: 28940, miles: 16200, keys: "Cabinet A", days: 3, reg: "ND26 TIG" },
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

export function deskSearch(input: {
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

export const DEALER_PRESETS = [
  { company: "Northbridge Motor Co.", brandId: "audi" as const, site: "York" },
  { company: "Harbour Park", brandId: "ford" as const, site: "Poole" },
  { company: "Ridgemont Motor Group", brandId: "bmw" as const, site: "Harrogate" },
];

type DealSeed = Omit<Deal, "vehicle" | "colour" | "vin" | "type" | "site" | "todos" | "messages" | "reg" | "checklistState" | "isBev">;

const DEAL_TEMPLATES: DealSeed[] = [
  {
    id: "ORD-1042", customer: "Priya Shah", email: "priya.shah@example.com", phone: "07700 900142", nickname: "",
    customerType: "Finance", salesperson: "Alex Reed", salespersonInitials: "AR",
    stageIndex: 5, locatorIndex: 6, gp: 2140, monthEnd: true, monthEndTasksComplete: false,
    handover: "2026-09-22", handoverTime: "10:00", handoverMethod: "Pickup from Showroom", handoverConfirmed: true,
    estimatedStart: null, estimatedEnd: null, confirmed: true, missing: ["V5"], balance: 450,
    hasPartExchange: true, partExchangeReg: "NK19 PXY", financeSettle: "Yes", trackerRef: "Cabinet A",
    wsReq: "Pushed", onHoDiary: true, internalNotes: "Wants ceramic if we can still get it on.", dealFileStatus: "Uploaded",
    usedOnSite: "", financeCompany: "", financeType: "PCP", monthlyAmount: 389,
    ceramicProtection: true, bodyworkProtection: false, alloyTyreProtection: true, servicePlan: true, leaseServicing: "None",
    agreedActions: [{ id: "a1", label: "Workshop Checks", done: false }, { id: "a2", label: "PDI", done: false }],
    handoverChecklist: [{ id: "h1", label: "Bring driving licence" }, { id: "h2", label: "Old V5 if PX" }],
    activityLog: [{ ts: "2026-09-14T09:12:00", text: "Deal marked confirmed" }, { ts: "2026-09-15T11:40:00", text: "Car locator status changed to \"In Transit To Dealership\"" }],
    photoSpecs: ["19\" alloys", "Virtual cockpit", "Matrix LED"], notes: "Bring your driving licence and old V5 on handover day.",
    hasPrivateReg: false,
  },
  {
    id: "ORD-1048", customer: "Callum Reid", email: "callum.reid@example.com", phone: "07700 900148", nickname: "Cal",
    customerType: "Cash", salesperson: "Sam Cole", salespersonInitials: "SC",
    stageIndex: 3, locatorIndex: 7, gp: 980, monthEnd: false, monthEndTasksComplete: false,
    handover: "2026-09-18", handoverTime: "14:30", handoverMethod: "Pickup from Showroom", handoverConfirmed: true,
    estimatedStart: null, estimatedEnd: null, confirmed: true, missing: ["Connect", "Identity"], balance: 0,
    hasPartExchange: false, partExchangeReg: "", financeSettle: "", trackerRef: "With PDI",
    wsReq: "", onHoDiary: false, internalNotes: "", dealFileStatus: "No",
    usedOnSite: "Yes", financeCompany: "", financeType: "", monthlyAmount: null,
    ceramicProtection: false, bodyworkProtection: false, alloyTyreProtection: false, servicePlan: false, leaseServicing: "None",
    agreedActions: [{ id: "a1", label: "Quality check", done: true }],
    handoverChecklist: [{ id: "h1", label: "Bring proof of insurance" }],
    activityLog: [{ ts: "2026-09-12T16:02:00", text: "Order created" }],
    photoSpecs: [], notes: "", hasPrivateReg: false,
  },
  {
    id: "ORD-1051", customer: "Helen Okonkwo", email: "helen.o@example.com", phone: "07700 900151", nickname: "",
    customerType: "Motability", salesperson: "Alex Reed", salespersonInitials: "AR",
    stageIndex: 2, locatorIndex: 3, gp: null, monthEnd: true, monthEndTasksComplete: false,
    handover: null, handoverTime: null, handoverMethod: "", handoverConfirmed: false,
    estimatedStart: "2026-10-06", estimatedEnd: "2026-10-17", confirmed: false, missing: ["GP", "Locator confirm"], balance: 0,
    hasPartExchange: false, partExchangeReg: "", financeSettle: "", trackerRef: "",
    wsReq: "", onHoDiary: false, internalNotes: "Adaptations TBC with Motability.", dealFileStatus: "No",
    usedOnSite: "", financeCompany: "", financeType: "", monthlyAmount: null,
    ceramicProtection: false, bodyworkProtection: false, alloyTyreProtection: false, servicePlan: false, leaseServicing: "None",
    agreedActions: [], handoverChecklist: [],
    activityLog: [{ ts: "2026-09-10T08:44:00", text: "VIN assigned" }],
    photoSpecs: ["Wheelchair access pack"], notes: "", hasPrivateReg: false,
  },
  {
    id: "ORD-1055", customer: "James Lyle", email: "james.lyle@example.com", phone: "07700 900155", nickname: "",
    customerType: "Finance", salesperson: "Sam Cole", salespersonInitials: "SC",
    stageIndex: 6, locatorIndex: 7, gp: 1640, monthEnd: true, monthEndTasksComplete: true,
    handover: "2026-09-19", handoverTime: "11:15", handoverMethod: "Delivery", handoverConfirmed: true,
    estimatedStart: null, estimatedEnd: null, confirmed: true, missing: [], balance: 1250,
    hasPartExchange: true, partExchangeReg: "NK18 JML", financeSettle: "No", trackerRef: "Cabinet B",
    wsReq: "Pushed", onHoDiary: true, internalNotes: "", dealFileStatus: "Uploaded",
    usedOnSite: "Yes", financeCompany: "", financeType: "HP", monthlyAmount: 512,
    ceramicProtection: true, bodyworkProtection: true, alloyTyreProtection: false, servicePlan: true, leaseServicing: "None",
    agreedActions: [{ id: "a1", label: "PDI", done: true }, { id: "a2", label: "Apply Ceramic Protection", done: false }],
    handoverChecklist: [{ id: "h1", label: "Bank card for the balance" }],
    activityLog: [{ ts: "2026-09-16T10:11:00", text: "On H/O diary marked Yes" }],
    photoSpecs: ["Panoramic roof"], notes: "We'll deliver to the house — please be in from 11.", hasPrivateReg: true,
  },
  {
    id: "ORD-1059", customer: "Sofia Berg", email: "sofia.berg@example.com", phone: "07700 900159", nickname: "",
    customerType: "Lease", salesperson: "Alex Reed", salespersonInitials: "AR",
    stageIndex: 1, locatorIndex: 1, gp: 1880, monthEnd: false, monthEndTasksComplete: false,
    handover: null, handoverTime: null, handoverMethod: "", handoverConfirmed: false,
    estimatedStart: "2026-10-20", estimatedEnd: "2026-11-04", confirmed: false, missing: ["Handover date"], balance: 0,
    hasPartExchange: false, partExchangeReg: "", financeSettle: "", trackerRef: "",
    wsReq: "", onHoDiary: false, internalNotes: "Agency still chasing driver pack.", dealFileStatus: "No",
    usedOnSite: "", financeCompany: "", financeType: "PCH", monthlyAmount: 441,
    ceramicProtection: false, bodyworkProtection: false, alloyTyreProtection: false, servicePlan: false, leaseServicing: "Servicing and Maintenance",
    agreedActions: [], handoverChecklist: [],
    activityLog: [{ ts: "2026-09-08T13:20:00", text: "Finance approved" }],
    photoSpecs: [], notes: "", hasPrivateReg: false,
  },
  {
    id: "ORD-1062", customer: "Owen MacKay", email: "owen.mackay@example.com", phone: "07700 900162", nickname: "",
    customerType: "Finance", salesperson: "Sam Cole", salespersonInitials: "SC",
    stageIndex: 4, locatorIndex: 5, gp: -120, monthEnd: true, monthEndTasksComplete: false,
    handover: "2026-09-25", handoverTime: "16:00", handoverMethod: "Pickup from Showroom", handoverConfirmed: true,
    estimatedStart: null, estimatedEnd: null, confirmed: true, missing: ["PX V5", "GP"], balance: 890,
    hasPartExchange: true, partExchangeReg: "SN17 OMK", financeSettle: "Yes", trackerRef: "",
    wsReq: "", onHoDiary: false, internalNotes: "GP still leaking — extras not sold.", dealFileStatus: "No",
    usedOnSite: "", financeCompany: "", financeType: "PCP", monthlyAmount: 276,
    ceramicProtection: false, bodyworkProtection: false, alloyTyreProtection: false, servicePlan: false, leaseServicing: "None",
    agreedActions: [], handoverChecklist: [],
    activityLog: [{ ts: "2026-09-13T09:00:00", text: "Car locator status changed to \"UK Port\"" }],
    photoSpecs: [], notes: "", hasPrivateReg: false,
  },
  {
    id: "ORD-1066", customer: "Maya Chen", email: "maya.chen@example.com", phone: "07700 900166", nickname: "",
    customerType: "Cash", salesperson: "Alex Reed", salespersonInitials: "AR",
    stageIndex: 1, locatorIndex: 2, gp: 740, monthEnd: false, monthEndTasksComplete: false,
    handover: null, handoverTime: null, handoverMethod: "", handoverConfirmed: false,
    estimatedStart: null, estimatedEnd: null, confirmed: false, missing: ["Handover date"], balance: 0,
    hasPartExchange: false, partExchangeReg: "", financeSettle: "", trackerRef: "",
    wsReq: "", onHoDiary: false, internalNotes: "Waiting on colour confirmation.", dealFileStatus: "No",
    usedOnSite: "", financeCompany: "", financeType: "", monthlyAmount: null,
    ceramicProtection: false, bodyworkProtection: false, alloyTyreProtection: false, servicePlan: true, leaseServicing: "None",
    agreedActions: [], handoverChecklist: [],
    activityLog: [{ ts: "2026-09-11T15:33:00", text: "Order created" }],
    photoSpecs: [], notes: "", hasPrivateReg: false,
  },
  {
    id: "ORD-1070", customer: "Tom Fraser", email: "tom.fraser@example.com", phone: "07700 900170", nickname: "",
    customerType: "Finance", salesperson: "Sam Cole", salespersonInitials: "SC",
    stageIndex: 8, locatorIndex: 7, gp: 2210, monthEnd: false, monthEndTasksComplete: false,
    handover: "2026-09-12", handoverTime: "09:30", handoverMethod: "Pickup from Showroom", handoverConfirmed: true,
    estimatedStart: null, estimatedEnd: null, confirmed: true, missing: [], balance: 0,
    hasPartExchange: false, partExchangeReg: "", financeSettle: "", trackerRef: "Cabinet A",
    wsReq: "Pushed", onHoDiary: true, internalNotes: "", dealFileStatus: "Uploaded",
    usedOnSite: "", financeCompany: "", financeType: "PCP", monthlyAmount: 418,
    ceramicProtection: true, bodyworkProtection: true, alloyTyreProtection: true, servicePlan: true, leaseServicing: "None",
    agreedActions: [{ id: "a1", label: "PDI", done: true }],
    handoverChecklist: [],
    activityLog: [{ ts: "2026-09-12T09:40:00", text: "Marked as Delivered" }],
    photoSpecs: [], notes: "", hasPrivateReg: false,
  },
];

const BRIEF_NAMES = ["A. Patel", "N. Crowe", "Fleet desk"];

function bevFromVehicle(vehicle: string) {
  return /enyaq|elroq|id\.|e-tron|eqa|eqb|ex30|ex90|born|aceman|bz4x|electric/i.test(vehicle);
}

export function mintBook(brandId: BrandId, site: string): {
  deals: Deal[];
  stock: StockCar[];
  briefs: Brief[];
} {
  const brand = BRANDS[brandId];
  const fleet = brand.fleet;
  const financeHouse = `${brand.label} Financial Services`;
  const deals: Deal[] = DEAL_TEMPLATES.map((tpl, i) => {
    const car = fleet[i] ?? fleet[0]!;
    const keys = checklistKeysFor({
      customerType: tpl.customerType,
      type: car.type,
      hasPartExchange: tpl.hasPartExchange,
      hasPrivateReg: tpl.hasPrivateReg,
    });
    const checklistState: Record<string, boolean> = {};
    keys.forEach((k, idx) => {
      checklistState[k] = idx === 0 || (k === "balancePaid" && tpl.balance === 0);
    });
    if (tpl.missing.includes("Identity")) checklistState.idVerification = false;
    if (tpl.missing.includes("Connect")) checklistState.connect = false;
    if (tpl.missing.includes("V5") || tpl.missing.includes("PX V5")) checklistState.v5Document = false;
    const todos = keys.map((k) => ({
      label: k === "connect" ? `${brand.label} Connect` : checklistKeysLabel(k),
      done: !!checklistState[k],
    }));
    return {
      ...tpl,
      vehicle: car.vehicle,
      colour: car.colour,
      vin: car.vin,
      reg: car.reg || tpl.id.replace("ORD-", "SB26 "),
      type: car.type,
      site,
      isBev: bevFromVehicle(car.vehicle),
      financeCompany: tpl.customerType === "Finance" || tpl.customerType === "Lease" ? financeHouse : "",
      checklistState,
      todos,
      messages: [
        { from: "staff", text: `Hi ${tpl.customer.split(" ")[0]} — your ${car.vehicle} is on the book. I’ll keep you posted.`, at: "Mon 09:12" },
        { from: "customer", text: "Thanks. Any update on handover?", at: "Mon 14:40" },
      ],
    };
  });
  const stock: StockCar[] = fleet.map((car, i) => {
    const siteStatus =
      car.days === 0 ? "Not arrived yet" : car.keys === "With PDI" ? "Washbay" : car.keys === "Unknown" ? "Out" : "On-site";
    return {
      id: `STK-0${i + 1}`,
      vehicle: car.vehicle,
      derivative: car.derivative || "",
      colour: car.colour,
      vin: car.vin,
      reg: car.reg || "",
      type: car.type,
      site,
      keys: car.keys === "Unknown" ? "" : car.keys,
      days: car.days,
      price: car.price,
      miles: car.miles,
      year: car.type === "Used" ? 2023 : 2026,
      missing: car.keys === "Unknown",
      matchedDealId: i < DEAL_TEMPLATES.length ? DEAL_TEMPLATES[i]!.id : null,
      siteStatus,
      siteSpot: siteStatus === "On-site" ? SITE_SPOT_OPTIONS[i % SITE_SPOT_OPTIONS.length]! : "",
      fuel: bevFromVehicle(car.vehicle) ? "Electric" : "Petrol",
      transmission: "Automatic",
      source: car.type === "New" ? "Manufacturer feed" : "VAG Excel",
    };
  });
  const briefs: Brief[] = brand.wants.map((want, i) => ({
    id: `BR-${i + 1}`,
    name: BRIEF_NAMES[i] ?? "Walk-in",
    phone: `07700 90020${i}`,
    email: `${(BRIEF_NAMES[i] ?? "walkin").toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
    want,
    colour: i === 2 ? "Any" : fleet[i]?.colour.split(" ").slice(-1)[0] ?? "Any",
    maxMiles: i === 2 ? 40000 : 25000,
    maxPrice: fleet[i]?.price ? fleet[i]!.price + 2000 : 30000,
    interestType: i === 1 ? "not_yet_released" : "out_of_stock",
    reminderDate: i === 0 ? "2026-09-18" : "",
    matches: i === 2 ? 2 : i === 0 ? 1 : 0,
  }));
  return { deals, stock, briefs };
}

function checklistKeysLabel(key: string) {
  const map: Record<string, string> = {
    idVerification: "ID Verification",
    socialSecurityLetter: "Social Security Letter",
    motabilityPin: "Motability PIN",
    advancePayment: "Advance Payment",
    v5Document: "V5 Document",
    signedDealerDocuments: "Signed Dealer Documents",
    signedFinanceDocuments: "Signed Finance Documents",
    balancePaid: "Balance Paid",
    connect: "Connect",
    retentionDocument: "Send Retention Document via Email",
  };
  return map[key] ?? key;
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
  return slug || "dealer";
}
