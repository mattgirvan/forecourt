import { create } from "zustand";
import { BRANDS, mintBook, type BrandId } from "./brands";
import type { Brief, Deal, StockCar } from "./demo-data";

export type DeskTab = "customer" | "dealer" | "overview" | "todo" | "stock" | "admin";

export type AdminSub = "users" | "content" | "forms" | "carcheck" | "quotes" | "keepinmind";

export type FormKind = "buyin" | "payment" | "expenses" | "overtime" | "display";

export type ViewMode = "staff" | "customer";

const DEFAULT_COMPANY = "Northbridge Motor Co.";
const DEFAULT_BRAND: BrandId = "audi";
const DEFAULT_SITE = "York";
const STORAGE_KEY = "forecourt-dealer";

type Dealer = { company: string; brandId: BrandId; site: string };

function bookFor(brandId: BrandId, site: string) {
  return mintBook(brandId, site);
}

const initial = bookFor(DEFAULT_BRAND, DEFAULT_SITE);

type DemoState = {
  company: string;
  brandId: BrandId;
  site: string;
  tab: DeskTab;
  adminSub: AdminSub;
  formKind: FormKind;
  view: ViewMode;
  deals: Deal[];
  stock: StockCar[];
  briefs: Brief[];
  selectedDealId: string;
  monthOnly: boolean;
  search: string;
  setCompany: (company: string) => void;
  setBrand: (brandId: BrandId) => void;
  setSite: (site: string) => void;
  setDealer: (next: Partial<Dealer>) => void;
  setTab: (tab: DeskTab) => void;
  setAdminSub: (adminSub: AdminSub) => void;
  setFormKind: (formKind: FormKind) => void;
  setView: (view: ViewMode) => void;
  setSearch: (search: string) => void;
  setMonthOnly: (monthOnly: boolean) => void;
  pickDeal: (id: string) => void;
  selectDeal: (id: string) => void;
  setGp: (id: string, gp: number | null) => void;
  toggleMonthEnd: (id: string) => void;
  confirmDeal: (id: string) => void;
  advanceLocator: (id: string) => void;
  setLocator: (id: string, index: number) => void;
  setStage: (id: string, index: number) => void;
  addBrief: (brief: Omit<Brief, "id" | "matches" | "phone" | "email" | "interestType" | "reminderDate"> & Partial<Brief>) => void;
  patchStock: (id: string, patch: Partial<StockCar>) => void;
  patchDeal: (id: string, patch: Partial<Deal>, log?: string) => void;
  toggleChecklist: (id: string, key: string) => void;
  sendMessage: (id: string, from: "staff" | "customer", text: string) => void;
  addDeal: (deal: Deal) => void;
  hydrate: () => void;
};

function persist(s: Pick<DemoState, "company" | "brandId" | "site">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ company: s.company, brandId: s.brandId, site: s.site }),
  );
}

function applyDealer(s: DemoState, next: Partial<Dealer>): Partial<DemoState> {
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

function mapDeal(deals: Deal[], id: string, fn: (d: Deal) => Deal) {
  return deals.map((d) => (d.id === id ? fn(d) : d));
}

export const useDemo = create<DemoState>((set) => ({
  company: DEFAULT_COMPANY,
  brandId: DEFAULT_BRAND,
  site: DEFAULT_SITE,
  tab: "overview",
  adminSub: "quotes",
  formKind: "buyin",
  view: "staff",
  deals: initial.deals,
  stock: initial.stock,
  briefs: initial.briefs,
  selectedDealId: initial.deals[0]?.id ?? "ORD-1042",
  monthOnly: false,
  search: "",
  setCompany: (company) => set((s) => applyDealer(s, { company })),
  setBrand: (brandId) => set((s) => applyDealer(s, { brandId })),
  setSite: (site) => set((s) => applyDealer(s, { site })),
  setDealer: (next) => set((s) => applyDealer(s, next)),
  setTab: (tab) => set({ tab }),
  setAdminSub: (adminSub) => set({ adminSub, tab: "admin" }),
  setFormKind: (formKind) => set({ formKind, adminSub: "forms", tab: "admin" }),
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setMonthOnly: (monthOnly) => set({ monthOnly }),
  pickDeal: (id) => set({ selectedDealId: id }),
  selectDeal: (id) => set({ selectedDealId: id, tab: "dealer" }),
  setGp: (id, gp) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({
        ...d,
        gp,
        missing:
          gp == null || gp < 0
            ? Array.from(new Set([...d.missing.filter((m) => m !== "GP"), "GP"]))
            : d.missing.filter((m) => m !== "GP"),
      })),
    })),
  toggleMonthEnd: (id) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({ ...d, monthEnd: !d.monthEnd })),
    })),
  confirmDeal: (id) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({ ...d, confirmed: !d.confirmed })),
    })),
  advanceLocator: (id) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({
        ...d,
        locatorIndex: Math.min(7, d.locatorIndex + 1),
        missing: d.missing.filter((m) => m !== "Locator confirm"),
      })),
    })),
  setLocator: (id, index) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({ ...d, locatorIndex: index })),
    })),
  setStage: (id, index) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({ ...d, stageIndex: index })),
    })),
  addBrief: (brief) =>
    set((s) => ({
      briefs: [
        ...s.briefs,
        {
          phone: "",
          email: "",
          interestType: "out_of_stock" as const,
          reminderDate: "",
          matches: 0,
          ...brief,
          id: `BR-${s.briefs.length + 1}`,
        },
      ],
      tab: "admin",
      adminSub: "keepinmind",
    })),
  patchStock: (id, patch) =>
    set((s) => ({
      stock: s.stock.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              missing:
                patch.keys !== undefined ? patch.keys.trim() === "" : (patch.missing ?? c.missing),
            }
          : c,
      ),
    })),
  patchDeal: (id, patch, log) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({
        ...d,
        ...patch,
        activityLog: log
          ? [...d.activityLog, { ts: new Date().toISOString(), text: log }]
          : d.activityLog,
      })),
    })),
  toggleChecklist: (id, key) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({
        ...d,
        checklistState: { ...d.checklistState, [key]: !d.checklistState[key] },
      })),
    })),
  sendMessage: (id, from, text) =>
    set((s) => ({
      deals: mapDeal(s.deals, id, (d) => ({
        ...d,
        messages: [...d.messages, { from, text, at: "Just now" }],
      })),
    })),
  addDeal: (deal) =>
    set((s) => ({
      deals: [deal, ...s.deals],
      selectedDealId: deal.id,
      tab: "dealer",
    })),
  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<Dealer>;
      if (parsed.brandId && !(parsed.brandId in BRANDS)) return;
      set((s) => applyDealer(s, parsed));
    } catch {
      /* ignore */
    }
  },
}));
