import { create } from "zustand";
import { BRANDS, mintBook, type BrandId } from "./brands";
import type { Brief, Deal, StockCar } from "./demo-data";

export type DeskTab =
  | "overview"
  | "stock"
  | "locator"
  | "pipeline"
  | "customer"
  | "mind";

export type ViewMode = "staff" | "customer";

const DEFAULT_COMPANY = "Northbridge Motor Co.";
const DEFAULT_BRAND: BrandId = "audi";
const DEFAULT_SITE = "York";
const STORAGE_KEY = "forecourt-rooftop";

type Rooftop = { company: string; brandId: BrandId; site: string };

function bookFor(brandId: BrandId, site: string) {
  return mintBook(brandId, site);
}

const initial = bookFor(DEFAULT_BRAND, DEFAULT_SITE);

type DemoState = {
  company: string;
  brandId: BrandId;
  site: string;
  tab: DeskTab;
  view: ViewMode;
  deals: Deal[];
  stock: StockCar[];
  briefs: Brief[];
  selectedDealId: string;
  setCompany: (company: string) => void;
  setBrand: (brandId: BrandId) => void;
  setSite: (site: string) => void;
  setRooftop: (next: Partial<Rooftop>) => void;
  setTab: (tab: DeskTab) => void;
  setView: (view: ViewMode) => void;
  selectDeal: (id: string) => void;
  setGp: (id: string, gp: number | null) => void;
  toggleMonthEnd: (id: string) => void;
  confirmDeal: (id: string) => void;
  advanceLocator: (id: string) => void;
  setStage: (id: string, index: number) => void;
  addBrief: (brief: Omit<Brief, "id">) => void;
  hydrate: () => void;
};

function persist(s: Pick<DemoState, "company" | "brandId" | "site">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ company: s.company, brandId: s.brandId, site: s.site }),
  );
}

function applyRooftop(s: DemoState, next: Partial<Rooftop>): Partial<DemoState> {
  const company = next.company ?? s.company;
  const brandId = next.brandId ?? s.brandId;
  const site = next.site ?? s.site;
  const brandChanged = brandId !== s.brandId || site !== s.site;
  const book = brandChanged ? bookFor(brandId, site) : null;
  persist({ company, brandId, site });
  return {
    company,
    brandId,
    site,
    ...(book
      ? {
          deals: book.deals,
          stock: book.stock,
          briefs: book.briefs,
          selectedDealId: book.deals[0]?.id ?? s.selectedDealId,
        }
      : {}),
  };
}

export const useDemo = create<DemoState>((set) => ({
  company: DEFAULT_COMPANY,
  brandId: DEFAULT_BRAND,
  site: DEFAULT_SITE,
  tab: "overview",
  view: "staff",
  deals: initial.deals,
  stock: initial.stock,
  briefs: initial.briefs,
  selectedDealId: initial.deals[0]?.id ?? "ORD-1042",
  setCompany: (company) => set((s) => applyRooftop(s, { company })),
  setBrand: (brandId) => set((s) => applyRooftop(s, { brandId })),
  setSite: (site) => set((s) => applyRooftop(s, { site })),
  setRooftop: (next) => set((s) => applyRooftop(s, next)),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  selectDeal: (id) => set({ selectedDealId: id, tab: "locator" }),
  setGp: (id, gp) =>
    set((s) => ({
      deals: s.deals.map((d) =>
        d.id === id
          ? {
              ...d,
              gp,
              missing:
                gp == null || gp < 0
                  ? Array.from(new Set([...d.missing.filter((m) => m !== "GP"), "GP"]))
                  : d.missing.filter((m) => m !== "GP"),
            }
          : d,
      ),
    })),
  toggleMonthEnd: (id) =>
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, monthEnd: !d.monthEnd } : d)),
    })),
  confirmDeal: (id) =>
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, confirmed: true } : d)),
    })),
  advanceLocator: (id) =>
    set((s) => ({
      deals: s.deals.map((d) =>
        d.id === id
          ? {
              ...d,
              locatorIndex: Math.min(5, d.locatorIndex + 1),
              missing: d.missing.filter((m) => m !== "Locator confirm"),
            }
          : d,
      ),
    })),
  setStage: (id, index) =>
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, stageIndex: index } : d)),
    })),
  addBrief: (brief) =>
    set((s) => ({
      briefs: [...s.briefs, { ...brief, id: `BR-${s.briefs.length + 1}` }],
      tab: "mind",
    })),
  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<Rooftop>;
      if (parsed.brandId && !(parsed.brandId in BRANDS)) return;
      set((s) => applyRooftop(s, parsed));
    } catch {
      /* ignore */
    }
  },
}));
