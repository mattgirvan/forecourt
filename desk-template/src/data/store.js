import { create } from "zustand";
import { tenant } from "../tenant";
import { parseWorkbook, upsertByVin } from "./ingest";
import { supabase } from "./supabase";

const empty = { deals: [], stock: [], briefs: [] };

function sample(site) {
  return {
    deals: [
      {
        id: "ORD-1000",
        customer: "Sample customer",
        customerEmail: "sample@example.invalid",
        vehicle: "Sample vehicle",
        colour: "White",
        vin: "TEST0000000000001",
        type: "New",
        customerType: "Finance",
        site,
        stageIndex: 1,
        locatorIndex: 2,
        gp: 1500,
        monthEnd: true,
        handover: null,
        confirmed: false,
        missing: ["V5"],
      },
    ],
    stock: [
      {
        id: "STK-SAMPLE",
        vehicle: "Sample vehicle",
        colour: "White",
        vin: "TEST0000000000001",
        type: "New",
        site,
        keys: "Cabinet A",
        days: 2,
        price: 28995,
        miles: 12,
        missing: false,
        matchedDealId: "ORD-1000",
      },
    ],
    briefs: [],
  };
}

export const useDesk = create((set, get) => ({
  ...empty,
  ready: false,
  error: null,
  selectedDealId: null,

  async boot() {
    const site = tenant.sites?.[0] || "Main";
    if (supabase) {
      try {
        const [{ data: deals, error: dErr }, { data: stock, error: sErr }] = await Promise.all([
          supabase.from("orders").select("*").order("created_at", { ascending: false }),
          supabase.from("stock").select("*").order("created_at", { ascending: false }),
        ]);
        if (dErr) throw dErr;
        if (sErr) throw sErr;
        const mapped = (deals || []).map(fromOrderRow);
        set({
          deals: mapped,
          stock: (stock || []).map(fromStockRow),
          briefs: [],
          selectedDealId: mapped[0]?.id ?? null,
          ready: true,
        });
        return;
      } catch (err) {
        set({ error: String(err.message || err), ready: true });
        return;
      }
    }
    const seed = tenant.seedDemo ? sample(site) : empty;
    set({ ...seed, selectedDealId: seed.deals[0]?.id ?? null, ready: true });
  },

  selectDeal(id) {
    set({ selectedDealId: id });
  },

  async setGp(id, gp) {
    set((s) => ({
      deals: s.deals.map((d) =>
        d.id === id
          ? {
              ...d,
              gp,
              missing:
                gp == null
                  ? Array.from(new Set([...d.missing.filter((m) => m !== "GP"), "GP"]))
                  : d.missing.filter((m) => m !== "GP"),
            }
          : d,
      ),
    }));
    if (supabase) await supabase.from("orders").update({ gp, last_updated: new Date().toISOString() }).eq("id", id);
  },

  async setLocator(id, index) {
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, locatorIndex: index } : d)),
    }));
    if (supabase) {
      await supabase
        .from("orders")
        .update({ locator_index: index, last_updated: new Date().toISOString() })
        .eq("id", id);
    }
  },

  async setStage(id, index) {
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, stageIndex: index } : d)),
    }));
    if (supabase) {
      await supabase
        .from("orders")
        .update({ stage_index: index, last_updated: new Date().toISOString() })
        .eq("id", id);
    }
  },

  async toggleMonthEnd(id) {
    const deal = get().deals.find((d) => d.id === id);
    if (!deal) return;
    const next = !deal.monthEnd;
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, monthEnd: next } : d)),
    }));
    if (supabase) await supabase.from("orders").update({ month_end: next }).eq("id", id);
  },

  async ingestFile(file) {
    const buf = await file.arrayBuffer();
    const rows = parseWorkbook(buf);
    const site = tenant.sites?.[0] || "Main";
    const stock = upsertByVin(get().stock, rows, site);
    set({ stock });
    if (supabase) {
      for (const row of stock) {
        await supabase.from("stock").upsert(
          {
            id: row.id,
            vin: row.vin,
            vehicle: row.vehicle,
            colour: row.colour,
            car_type: row.type,
            site: row.site,
            keys: row.keys,
            days_on_site: row.days,
            price: row.price,
            miles: row.miles,
            missing: row.missing,
          },
          { onConflict: "vin" },
        );
      }
    }
    return rows.length;
  },
}));

function fromOrderRow(r) {
  return {
    id: r.id,
    customer: r.customer_name,
    customerEmail: r.customer_email,
    vehicle: r.vehicle,
    colour: r.colour,
    vin: r.vin,
    type: r.car_type,
    customerType: r.customer_type,
    site: r.site || tenant.sites?.[0] || "Main",
    stageIndex: r.stage_index ?? 0,
    locatorIndex: r.locator_index ?? 0,
    gp: r.gp,
    monthEnd: Boolean(r.month_end),
    handover: r.handover_date,
    confirmed: Boolean(r.confirmed),
    missing: Array.isArray(r.missing) ? r.missing : [],
  };
}

function fromStockRow(r) {
  return {
    id: r.id,
    vehicle: r.vehicle,
    colour: r.colour,
    vin: r.vin,
    type: r.car_type,
    site: r.site,
    keys: r.keys,
    days: r.days_on_site,
    price: Number(r.price) || 0,
    miles: r.miles,
    missing: Boolean(r.missing),
    matchedDealId: r.matched_deal_id,
  };
}
