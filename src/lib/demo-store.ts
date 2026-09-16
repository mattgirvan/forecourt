import { create } from "zustand";
import {
  type Brief,
  type Deal,
  type StockCar,
  type TenantSlug,
  seedBriefs,
  seedDeals,
  seedStock,
  tenants,
} from "./demo-data";

export type DeskTab =
  | "overview"
  | "stock"
  | "locator"
  | "pipeline"
  | "customer"
  | "mind";

export type ViewMode = "staff" | "customer";

type DemoState = {
  tenant: TenantSlug;
  tab: DeskTab;
  view: ViewMode;
  deals: Deal[];
  stock: StockCar[];
  briefs: Brief[];
  selectedDealId: string;
  setTenant: (slug: TenantSlug) => void;
  setTab: (tab: DeskTab) => void;
  setView: (view: ViewMode) => void;
  selectDeal: (id: string) => void;
  setGp: (id: string, gp: number | null) => void;
  toggleMonthEnd: (id: string) => void;
  confirmDeal: (id: string) => void;
  advanceLocator: (id: string) => void;
  setStage: (id: string, index: number) => void;
  addBrief: (brief: Omit<Brief, "id">) => void;
};

export const useDemo = create<DemoState>((set) => ({
  tenant: "northbridge",
  tab: "overview",
  view: "staff",
  deals: seedDeals,
  stock: seedStock,
  briefs: seedBriefs,
  selectedDealId: "ORD-1042",
  setTenant: (slug) =>
    set((s) => {
      const sites = tenants[slug].sites;
      const next = s.deals.find((d) => sites.includes(d.site));
      return { tenant: slug, selectedDealId: next?.id ?? s.selectedDealId };
    }),
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
}));
