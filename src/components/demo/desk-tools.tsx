import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Mail, Phone, Plus } from "lucide-react";
import { SlidingPillTrack } from "@/components/demo/portal-ui";
import { BRANDS } from "@/lib/brands";
import { STAFF } from "@/lib/demo-data";
import { useDemo, type AdminSub, type FormKind } from "@/lib/demo-store";
import { gbp } from "@/lib/utils";

const FORM_KINDS: { id: FormKind; title: string; desc: string }[] = [
  { id: "buyin", title: "Buy-In", desc: "Vehicle purchase invoices & payment request forms, not linked to customer orders." },
  { id: "payment", title: "Payment", desc: "Payment request forms for accounts: refunds by card or bank transfer, not linked to customer orders." },
  { id: "expenses", title: "Expenses", desc: "Expense claim forms for accounts, not linked to customer orders." },
  { id: "overtime", title: "Overtime", desc: "Overtime claim forms for payroll, not linked to customer orders. No bank details." },
  { id: "display", title: "Display", desc: "Showroom price boards for cars on the stand: save and A4 print, not linked to customer orders." },
];

const ADMIN_INFO: Record<AdminSub, { title: string; desc: string }> = {
  users: {
    title: "Admin",
    desc: "Manage who has staff access, their role, and how many deals they're due to deliver this month. Reassign a customer to a different salesperson from their card in Dealer view.",
  },
  content: {
    title: "Content",
    desc: "A voice library that teaches drafts to sound like you, and a quick capture flow for what's worth posting, not linked to customer orders.",
  },
  forms: { title: "Forms", desc: "Staff forms: buy-in, payment, expenses, overtime and display. Not linked to customer orders." },
  carcheck: {
    title: "Car Check",
    desc: "Trade-in due diligence: MOT history & mileage sanity check, not linked to customer orders.",
  },
  quotes: {
    title: "Quotes",
    desc: "Printable four-square quote sheets: vehicle, part exchange, deposit and monthly payment on one page.",
  },
  keepinmind: {
    title: "Keep in Mind",
    desc: "Customers waiting on a model that's out of stock or not yet released, not linked to customer orders.",
  },
};

export function AdminPane() {
  const adminSub = useDemo((s) => s.adminSub);
  const formKind = useDemo((s) => s.formKind);
  const setAdminSub = useDemo((s) => s.setAdminSub);
  const setFormKind = useDemo((s) => s.setFormKind);
  const setTab = useDemo((s) => s.setTab);
  const [menu, setMenu] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const info = adminSub === "forms"
    ? { title: FORM_KINDS.find((f) => f.id === formKind)?.title ?? "Forms", desc: FORM_KINDS.find((f) => f.id === formKind)?.desc ?? ADMIN_INFO.forms.desc }
    : ADMIN_INFO[adminSub];

  function openForms() {
    setAdminSub("forms");
    const el = pillRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, left: r.left });
    }
    setMenu((v) => !v);
  }

  const pill = (id: AdminSub, label: string) => (
    <button
      key={id}
      type="button"
      data-pill-value={id}
      onClick={() => {
        setMenu(false);
        if (id === "forms") {
          openForms();
          return;
        }
        setAdminSub(id);
      }}
      className="relative z-[1] rounded-[11px] border-0 bg-transparent px-3.5 py-[7px] text-[12.5px] font-semibold"
      style={{ color: adminSub === id ? "var(--shell-accent-ink)" : "var(--shell-text-faint)" }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mx-auto max-w-[960px] px-5 pt-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xl font-medium">{info.title}</div>
          <div className="admin-pill-row-wrap">
            <SlidingPillTrack value={adminSub} className="shell-glass-inset admin-pill-row rounded-[14px] p-1">
              {pill("users", "Users")}
              <button
                type="button"
                data-pill-value="stock-jump"
                onClick={() => setTab("stock")}
                className="relative z-[1] rounded-[11px] border-0 bg-transparent px-3.5 py-[7px] text-[12.5px] font-semibold"
                style={{ color: "var(--shell-text-faint)" }}
              >
                Stock
              </button>
              {pill("content", "Content")}
              <button
                ref={pillRef}
                type="button"
                data-pill-value="forms"
                onClick={openForms}
                className="relative z-[1] inline-flex items-center gap-1 rounded-[11px] border-0 bg-transparent px-3.5 py-[7px] text-[12.5px] font-semibold"
                style={{ color: adminSub === "forms" ? "var(--shell-accent-ink)" : "var(--shell-text-faint)" }}
              >
                Forms
                <ChevronDown size={13} style={{ transform: menu ? "rotate(180deg)" : undefined }} />
              </button>
              {pill("carcheck", "Car Check")}
              {pill("quotes", "Quotes")}
              {pill("keepinmind", "Keep in Mind")}
            </SlidingPillTrack>
            <div className="admin-pill-row-fade" aria-hidden />
          </div>
        </div>
        <div className="mb-5 text-[12.5px] text-[var(--mist)]">{info.desc}</div>
      </div>

      {menu && coords && createPortal(
        <div className="forms-menu shell-glass fixed z-50" style={{ top: coords.top, left: coords.left }}>
          {FORM_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className={formKind === kind.id ? "is-active" : ""}
              onClick={() => {
                setFormKind(kind.id);
                setMenu(false);
              }}
            >
              {kind.title}
            </button>
          ))}
        </div>,
        document.body,
      )}

      <div className="tab-pane mx-auto max-w-[960px] px-5 pb-16">
        {adminSub === "users" ? (
          <UsersPane />
        ) : adminSub === "content" ? (
          <ContentPane />
        ) : adminSub === "carcheck" ? (
          <CarCheckPane />
        ) : adminSub === "quotes" ? (
          <FourSquarePane />
        ) : adminSub === "keepinmind" ? (
          <MindPane />
        ) : formKind === "payment" ? (
          <PaymentPane />
        ) : formKind === "expenses" ? (
          <ExpensesPane />
        ) : formKind === "overtime" ? (
          <OvertimePane />
        ) : formKind === "display" ? (
          <DisplayPane />
        ) : (
          <BuyInPane />
        )}
      </div>
    </div>
  );
}

function ToolHead({ title, hint, onNew, cta }: { title?: string; hint?: string; onNew?: () => void; cta?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {title && <h3 className="text-lg font-medium">{title}</h3>}
        {hint && <p className="mt-0.5 text-xs text-[var(--mist)]">{hint}</p>}
      </div>
      {onNew && (
        <button type="button" className="cta-amber inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold" onClick={onNew}>
          <Plus size={14} /> {cta ?? "New"}
        </button>
      )}
    </div>
  );
}

function UsersPane() {
  const site = useDemo((s) => s.site);
  return (
    <div>
      <p className="mb-4 text-xs text-[var(--mist)]">{site}. Magic-link staff. Same desk, different logins.</p>
      {STAFF.map((u) => (
        <div key={u.name} className="flex items-center justify-between border-b border-white/10 py-3">
          <div>
            <div className="text-sm">{u.name}</div>
            <div className="text-xs text-[var(--mist)]">{u.role} · {u.email}{site.toLowerCase().replace(/\s/g, "")}.co.uk</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold text-[var(--emerald)]">Active</div>
            <div className="font-mono text-[11px] text-[var(--mist)]">{u.target} deals this month</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContentPane() {
  const brand = useDemo((s) => s.brandId);
  const posts = useMemo(
    () => [
      { t: "This week’s arrivals", s: "Scheduled · Thu 10:00", ch: "Facebook" },
      { t: `${BRANDS[brand].label} service offer`, s: "Posted · 42 views", ch: "Instagram" },
      { t: "Need a used SUV this weekend?", s: "Draft", ch: "All" },
    ],
    [brand],
  );
  return (
    <div>
      <ToolHead hint="A voice library that teaches drafts to sound like you." />
      <div className="shell-glass mb-4 rounded-[18px] p-4">
        <div className="text-[13px] font-semibold">Voice library</div>
        <p className="mt-1 text-[12.5px] text-[var(--mist)]">4 of 4 minimum active “good” examples, enough to draft in your voice.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {["New arrival / stock spotlight", "Longest in stock", "Handover", "Service offer"].map((x) => (
            <div key={x} className="shell-glass-row rounded-xl px-3 py-2 text-[13px]">{x} · good</div>
          ))}
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        <button type="button" className="rounded-xl border border-white/15 px-3 py-2 text-[12.5px] font-semibold">Paste a past post</button>
        <button type="button" className="cta-amber rounded-xl px-3 py-2 text-[12.5px] font-semibold">Add example</button>
      </div>
      {posts.map((p) => (
        <div key={p.t} className="flex items-center justify-between border-b border-white/10 py-3">
          <div>
            <div className="text-sm font-medium">{p.t}</div>
            <div className="text-xs text-[var(--mist)]">{p.s} · {p.ch}</div>
          </div>
          {p.s.startsWith("Draft") && <button type="button" className="cta-amber rounded-lg px-2.5 py-1 text-[11px] font-semibold">Mark as posted</button>}
        </div>
      ))}
    </div>
  );
}

function FourSquarePane() {
  const deals = useDemo((s) => s.deals);
  const d = deals[0];
  const [open, setOpen] = useState(true);
  const price = 32940;
  const px = 8500;
  const deposit = 2000;
  const fdc = 500;
  const equity = px - 0;
  const totalDeposit = deposit + equity + fdc;
  const finance = price - totalDeposit;
  return (
    <div>
      <ToolHead onNew={() => setOpen(true)} cta="New quote" />
      {d && <p className="mb-3 text-sm text-[var(--shell-text-dim)]">{d.customer} · {d.vehicle}</p>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["1. Vehicle", gbp(price)],
          ["2. Part exchange", gbp(px)],
          ["3. Deposit", gbp(totalDeposit)],
          ["4. Monthly", "£389 / mo"],
        ].map(([k, v]) => (
          <div key={k} className="shell-glass rounded-[18px] p-4">
            <div className="text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">{k}</div>
            <div className="mt-2 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {open && (
        <div className="shell-glass grid gap-4 rounded-[24px] p-5 sm:grid-cols-2">
          <Field label="Customer name" value={d?.customer ?? ""} />
          <Field label="Salesperson" value="Alex Reed" />
          <Field label="Vehicle" value={d?.vehicle ?? ""} />
          <Field label="Registration / stock no." value={d?.reg ?? ""} />
          <Field label="Price (£)" value={String(price)} />
          <Field label="Their vehicle" value="PX: 2019 1.0 TSI" />
          <Field label="Allowance (£)" value={String(px)} />
          <Field label="Settlement (£)" value="0" />
          <Field label="Cash deposit (£)" value={String(deposit)} />
          <Field label="Deposit contribution (£)" value={String(fdc)} />
          <Field label="Finance type" value="PCP" />
          <Field label="Term (months)" value="48" />
          <Field label="APR (%)" value="7.9" />
          <Field label="Monthly payment (£)" value="389" />
          <div className="sm:col-span-2 flex justify-between text-sm">
            <span className="text-[var(--mist)]">Amount financed (calculated)</span>
            <span className="font-semibold">{gbp(finance)}</span>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" className="cta-amber rounded-xl px-4 py-2 text-[13px] font-semibold">Save & preview</button>
            <button type="button" className="rounded-xl border border-white/15 px-4 py-2 text-[13px] font-semibold">Print</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">{label}</span>
      <input defaultValue={value} className="h-10 w-full rounded-[10px] border px-3 text-[13px]" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} />
    </label>
  );
}

function BuyInPane() {
  const stock = useDemo((s) => s.stock);
  const cars = stock.filter((c) => c.type === "Used").slice(0, 3);
  const [open, setOpen] = useState<string | null>(cars[0]?.id ?? null);
  return (
    <div>
      <ToolHead onNew={() => setOpen(cars[0]?.id ?? null)} cta="New buy-in" />
      {cars.map((c) => (
        <div key={c.id} className="border-b border-white/10">
          <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center justify-between py-3 text-left">
            <div>
              <div className="font-medium">{c.vehicle}</div>
              <div className="text-xs text-[var(--mist)]">{c.colour} · {c.reg} · seller walk-in</div>
            </div>
            <div className="font-mono text-sm">{gbp(Math.round(c.price * 0.72))}</div>
          </button>
          {open === c.id && (
            <div className="grid gap-3 pb-4 sm:grid-cols-2">
              <Field label="Seller name" value="Walk-in customer" />
              <Field label="Registration" value={c.reg} />
              <Field label="Make / model" value={c.vehicle} />
              <Field label="Mileometer" value={String(c.miles ?? 0)} />
              <Field label="Purchase price (£)" value={String(Math.round(c.price * 0.72))} />
              <Field label="Settlement amount (£)" value="0" />
              <div className="sm:col-span-2 grid grid-cols-2 gap-2 text-[12.5px]">
                {["Registered mileometer reading is correct", "MOT Test Certificate handed over", "Registration Document handed over"].map((x) => (
                  <label key={x} className="flex items-center gap-2"><input type="checkbox" defaultChecked /> {x}</label>
                ))}
              </div>
              <button type="button" className="cta-amber rounded-xl px-4 py-2 text-[13px] font-semibold sm:col-span-2">Save & preview</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CarCheckPane() {
  const stock = useDemo((s) => s.stock);
  const rows = stock.filter((c) => c.type === "Used").slice(0, 4);
  const [open, setOpen] = useState<string | null>(rows[0]?.id ?? null);
  return (
    <div>
      <ToolHead onNew={() => setOpen(rows[0]?.id ?? null)} cta="New check" />
      {rows.map((c, i) => (
        <div key={c.id} className="border-b border-white/10">
          <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center justify-between py-3 text-left">
            <div>
              <div className="font-medium">{c.reg || c.vehicle}</div>
              <div className="text-xs text-[var(--mist)]">{c.vehicle} · {c.colour} · {c.miles?.toLocaleString()} mi</div>
            </div>
            <div className="text-[12.5px] font-semibold" style={{ color: i === 0 ? "var(--shell-accent)" : "var(--emerald)" }}>
              {i === 0 ? "Mileage check" : "PASSED"}
            </div>
          </button>
          {open === c.id && (
            <div className="grid gap-3 pb-4 sm:grid-cols-3">
              <div className="shell-glass rounded-xl p-3">
                <div className="text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Make / model</div>
                <div className="mt-1 text-sm">{c.vehicle}</div>
              </div>
              <div className="shell-glass rounded-xl p-3">
                <div className="text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">MOT</div>
                <div className="mt-1 text-sm" style={{ color: "var(--emerald)" }}>PASSED · 11 months left</div>
              </div>
              <div className="shell-glass rounded-xl p-3">
                <div className="text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Tax</div>
                <div className="mt-1 text-sm">Taxed</div>
              </div>
              <div className="sm:col-span-3 text-[12.5px] text-[var(--mist)]">Check competitor listings: Auto Trader · Cazoo · We Buy Any Car · Motorway</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MindPane() {
  const briefs = useDemo((s) => s.briefs);
  const stock = useDemo((s) => s.stock);
  const addBrief = useDemo((s) => s.addBrief);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-white/15 px-3 py-2 text-[12.5px] font-semibold">Show closed</button>
        <button type="button" className="cta-amber inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold" onClick={() => setOpen((v) => !v)}>
          <Plus size={14} /> New entry
        </button>
      </div>
      {open && (
        <form
          className="shell-glass mb-4 grid gap-3 rounded-[24px] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            addBrief({
              name: String(fd.get("name") || "Walk-in"),
              want: String(fd.get("want") || "Any SUV"),
              colour: String(fd.get("colour") || "Any"),
              maxMiles: Number(fd.get("miles")) || 25000,
              maxPrice: Number(fd.get("price")) || 30000,
            });
            setOpen(false);
          }}
        >
          <label className="text-[13px]">Customer name<input name="name" className="mt-1 h-10 w-full rounded-[10px] border px-3" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} /></label>
          <label className="text-[13px]">Vehicle / spec they are waiting for<input name="want" className="mt-1 h-10 w-full rounded-[10px] border px-3" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} /></label>
          <button type="submit" className="cta-amber rounded-xl px-4 py-2 text-[13px] font-semibold sm:col-span-2">Save</button>
        </form>
      )}
      <ul className="space-y-3">
        {briefs.map((b) => {
          const hits = stock.filter((car) => car.price <= b.maxPrice).slice(0, 3);
          return (
            <li key={b.id} className="shell-glass rounded-[18px] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-[var(--mist)]">{b.want} · {b.interestType === "out_of_stock" ? "Out of stock" : "Not yet released"}</div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: hits.length ? "var(--wash-emerald-bg)" : "rgba(255,255,255,0.08)", color: hits.length ? "#C5F0B0" : "var(--shell-text-faint)" }}>
                  {hits.length} stock match{hits.length === 1 ? "" : "es"}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-[var(--mist)]">
                <span className="inline-flex items-center gap-1"><Phone size={11} /> {b.phone}</span>
                <span className="inline-flex items-center gap-1"><Mail size={11} /> {b.email}</span>
              </div>
              {hits.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-[var(--shell-text-dim)]">
                  {hits.map((h) => (
                    <li key={h.id}>{h.vehicle} · {h.colour} · {gbp(h.price)}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-1.5 text-[11px]">
                {["+1wk", "+2wk", "+1mo"].map((x) => (
                  <span key={x} className="rounded-full bg-white/10 px-2 py-0.5">{x}</span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PaymentPane() {
  const deals = useDemo((s) => s.deals);
  const [kind, setKind] = useState<"card" | "bank">("card");
  return (
    <div>
      <ToolHead cta="New request" onNew={() => undefined} />
      {deals.filter((d) => d.balance > 0).map((d) => (
        <div key={d.id} className="flex items-center justify-between border-b border-white/10 py-3">
          <div>
            <div className="font-medium">{d.customer}</div>
            <div className="text-xs text-[var(--mist)]">{d.reg} · {kind === "card" ? "Card ending ····" : "Account ending"}</div>
          </div>
          <div className="font-mono text-sm">{gbp(d.balance)}</div>
        </div>
      ))}
      <div className="shell-glass mt-4 rounded-[24px] p-5">
        <div className="mb-3 text-[13px] font-semibold">New payment request</div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" value={deals[0]?.customer ?? ""} />
          <Field label="Vehicle registration" value={deals[0]?.reg ?? ""} />
          <Field label="Amount" value="450" />
          <Field label="Reason / reference" value="Deposit refund: order cancelled" />
        </div>
        <div className="mb-3 text-[11px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Pay by</div>
        <SlidingPillTrack value={kind} className="shell-glass-inset mb-3 inline-flex rounded-full p-1">
          {(["card", "bank"] as const).map((k) => (
            <button key={k} type="button" data-pill-value={k} onClick={() => setKind(k)} className="relative z-[1] rounded-full px-4 py-1.5 text-[12.5px] font-semibold" style={{ color: kind === k ? "var(--shell-accent-ink)" : "var(--shell-text-faint)" }}>
              {k === "card" ? "Card" : "Bank transfer"}
            </button>
          ))}
        </SlidingPillTrack>
        {kind === "card" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Card number" value="•••• •••• •••• 4242" />
            <Field label="Expiry (MM/YY)" value="09/28" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sort code" value="80-05-14" />
            <Field label="Account number" value="0094288" />
          </div>
        )}
        <button type="button" className="cta-amber mt-4 rounded-xl px-4 py-2 text-[13px] font-semibold">Generate request</button>
      </div>
    </div>
  );
}

function ExpensesPane() {
  const site = useDemo((s) => s.site);
  const rows = [
    { t: "Fuel: collection", v: 48.6, s: "Submitted" },
    { t: "Train: PDI course", v: 86, s: "Approved" },
    { t: "Parking: compound", v: 12, s: "Draft" },
  ];
  return (
    <div>
      <ToolHead hint={`${site}. Receipts against the month.`} cta="New claim" onNew={() => undefined} />
      {rows.map((r) => (
        <div key={r.t} className="flex items-center justify-between border-b border-white/10 py-3">
          <div>
            <div className="font-medium">{r.t}</div>
            <div className="text-xs text-[var(--mist)]">{r.s} · Sales</div>
          </div>
          <div className="font-mono text-sm">{gbp(r.v)}</div>
        </div>
      ))}
      <div className="shell-glass mt-4 overflow-x-auto rounded-[18px] p-3">
        <table className="overview-table min-w-[640px]">
          <thead>
            <tr>
              {["Date", "Expense Details", "Fuel", "Travel / Hotel", "Misc", "VAT Included", "Total"].map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t}>
                <td>12 Sep</td>
                <td>{r.t}</td>
                <td>{r.t.startsWith("Fuel") ? gbp(r.v) : "-"}</td>
                <td>{r.t.startsWith("Train") ? gbp(r.v) : "-"}</td>
                <td>{r.t.startsWith("Parking") ? gbp(r.v) : "-"}</td>
                <td>Yes</td>
                <td>{gbp(r.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-sm font-semibold">Net expenses claimed {gbp(rows.reduce((a, r) => a + r.v, 0))}</div>
      </div>
    </div>
  );
}

function OvertimePane() {
  const rows = [
    { t: "Saturday rota: 7 Sep", v: "4.0 h", s: "Approved" },
    { t: "Late handover: Lyle", v: "1.5 h", s: "Submitted" },
  ];
  return (
    <div>
      <ToolHead hint="Record overtime accurately (e.g. 8 to 12pm = 4 hours). One form per week." cta="New claim" onNew={() => undefined} />
      {rows.map((r) => (
        <div key={r.t} className="flex items-center justify-between border-b border-white/10 py-3">
          <div>
            <div className="font-medium">{r.t}</div>
            <div className="text-xs text-[var(--mist)]">{r.s} · Sales Executive</div>
          </div>
          <div className="font-mono text-sm">{r.v}</div>
        </div>
      ))}
      <div className="shell-glass mt-4 overflow-x-auto rounded-[18px] p-3">
        <table className="overview-table min-w-[560px]">
          <thead>
            <tr>{["Day", "Date", "Start Time", "Finish Time", "Hours Worked", "ASM Checked"].map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <tr key={d}>
                <td>{d}</td>
                <td>{7 + i} Sep</td>
                <td>{i === 6 ? "08:00" : "-"}</td>
                <td>{i === 6 ? "12:00" : "-"}</td>
                <td>{i === 6 ? "4.0" : "-"}</td>
                <td>{i === 6 ? "Yes" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-sm font-semibold">Total hours 4.0</div>
      </div>
    </div>
  );
}

function DisplayPane() {
  const stock = useDemo((s) => s.stock);
  const onPitch = stock.filter((c) => c.siteSpot === "Pitch" || c.siteSpot === "Showroom").slice(0, 4);
  const cards = onPitch.length ? onPitch : stock.slice(0, 4);
  return (
    <div>
      <ToolHead cta="New board" onNew={() => undefined} />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.id} className="shell-glass rounded-[20px] p-5">
            <div className="text-[11px] uppercase tracking-wide text-[var(--shell-text-faint)]">{c.siteSpot || c.siteStatus || "Floor"}</div>
            <div className="mt-1 text-xl font-semibold">{c.vehicle}</div>
            {c.derivative && <div className="text-sm text-[var(--shell-text-dim)]">{c.derivative}</div>}
            <div className="mt-1 text-sm text-[var(--shell-text-dim)]">{c.colour}</div>
            <div className="mt-3 text-2xl font-semibold">{gbp(c.price)} <span className="text-sm font-medium text-[var(--mist)]">OTR</span></div>
            <div className="mt-3 text-[12.5px] text-[var(--mist)]">PCP from £389 / mo · £2,000 deposit</div>
          </div>
        ))}
      </div>
    </div>
  );
}
