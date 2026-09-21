import { useState, type CSSProperties } from "react";
import {
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  FileCheck,
  Key,
  ListTodo,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Receipt,
  Search,
  Send,
  Sparkles,
  Truck,
  Users,
  X,
} from "lucide-react";
import {
  AdminPane,
} from "@/components/demo/desk-tools";
import { ChipRow, GlassModal, InfoBubble, SegmentedControl, SlidingPillTrack } from "@/components/demo/portal-ui";
import { BRANDS, groupMark } from "@/lib/brands";
import {
  CHECKLIST_DEFS,
  CUSTOMER_TYPE_TINT,
  HANDOVER_METHODS,
  PRODUCTS_INCLUDED,
  SITE_SPOT_OPTIONS,
  SITE_STATUS_OPTIONS,
  SITE_STATUS_PILL,
  STAFF,
  checklistKeysFor,
  daysUntil,
  firstNameFor,
  formatLongDate,
  formatShortDate,
  getStages,
  initials,
  isCarAtDealership,
  isOrderDelivered,
  locatorLane,
  monthTarget,
  wsReqApplicable,
  type Deal,
  type SiteStatus,
} from "@/lib/demo-data";
import { useDemo, type DeskTab } from "@/lib/demo-store";
import { cn, gbp } from "@/lib/utils";

const PRIMARY: { id: DeskTab; label: string; icon?: typeof Lock }[] = [
  { id: "customer", label: "Customer view" },
  { id: "dealer", label: "Dealer view", icon: Lock },
  { id: "overview", label: "Overview", icon: Lock },
  { id: "todo", label: "To-Do", icon: ListTodo },
  { id: "stock", label: "Stock", icon: Car },
  { id: "admin", label: "Admin", icon: Users },
];

export function Desk({ fill = false }: { compact?: boolean; fill?: boolean }) {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const tab = useDemo((s) => s.tab);
  const adminSub = useDemo((s) => s.adminSub);
  const setTab = useDemo((s) => s.setTab);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");
  const pillValue = tab;

  return (
    <div
      className={cn("desk-shell relative overflow-hidden", fill && "desk-fill flex min-h-0 flex-1 flex-col")}
      style={{ "--desk-accent": brand.accent, "--desk-glow": brand.glow } as CSSProperties}
    >
      <div className="desk-orb" aria-hidden />
      <div className="desk-orb desk-orb-2" aria-hidden />
      <div className="desk-orb desk-orb-3" aria-hidden />

      <header className="desk-nav relative z-10">
        <div className="app-header-inner flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span
              className="flex h-9 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] font-bold tracking-[0.14em]"
              style={{ background: "var(--shell-accent)", color: "var(--shell-accent-ink)" }}
            >
              {mark}
            </span>
            <span className="hidden h-[30px] w-px bg-white/15 sm:block" />
            <span className="text-[13px] font-bold tracking-[0.16em]" style={{ color: brand.accent }}>
              {brand.word}
            </span>
            <span className="hidden h-[30px] w-px bg-white/15 sm:block" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium text-[#F6F5F1] sm:text-[17px]">
                {company.trim() || "Your group"} {brand.label} {site}
              </div>
            </div>
          </div>
          <div className="app-header-controls flex min-w-0 items-center">
            <SlidingPillTrack
              value={pillValue}
              className="app-role-toggle shell-glass-inset flex gap-1 rounded-[14px] p-1"
            >
              {PRIMARY.map((item) => {
                const Icon = item.icon;
                const on = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-pill-value={item.id}
                    onClick={() => setTab(item.id)}
                    className="relative z-[1] flex shrink-0 items-center gap-1.5 rounded-[11px] border-0 bg-transparent px-4 py-2 text-[13px] font-semibold whitespace-nowrap"
                    style={{ color: on ? "var(--shell-accent-ink)" : "var(--shell-text-faint)" }}
                  >
                    {Icon && <Icon size={12} color={on ? "var(--shell-accent-ink)" : "var(--shell-accent)"} />}
                    {item.label}
                  </button>
                );
              })}
              <div
                className="app-role-toggle-hint pointer-events-none sticky right-0 w-[34px] shrink-0 items-center justify-end self-stretch rounded-r-[10px] pr-[3px]"
                style={{ background: "linear-gradient(to right, transparent, var(--shell-inset-bg))" }}
                aria-hidden
              >
                <ChevronRight size={15} color="var(--shell-text)" />
              </div>
            </SlidingPillTrack>
          </div>
        </div>
      </header>

      <div className={cn("relative z-10 min-h-0 flex-1 overflow-auto", fill && "flex-1")} key={`${brandId}-${tab}-${adminSub}`}>
        <div className="tab-pane">
          {tab === "customer" ? (
            <CustomerPane />
          ) : tab === "dealer" ? (
            <DealerPane />
          ) : tab === "overview" ? (
            <OverviewPane />
          ) : tab === "todo" ? (
            <TodoPane />
          ) : tab === "stock" ? (
            <StockPane />
          ) : (
            <AdminPane />
          )}
        </div>
      </div>
    </div>
  );
}

function YesNo({ yes }: { yes: boolean }) {
  return (
    <span className={cn("yes-no", yes ? "is-yes" : "is-no")}>
      <span className="size-1.5 rounded-full" style={{ background: "currentColor" }} />
      {yes ? "Yes" : "No"}
    </span>
  );
}

function ProgressRail({ stages, stageIndex }: { stages: readonly string[]; stageIndex: number }) {
  return (
    <div className="rail-scroll">
      <div className="progress-rail">
        <div className="progress-track">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(stageIndex / Math.max(stages.length - 1, 1)) * 100}%`,
              background: "var(--desk-accent)",
            }}
          />
        </div>
        <div className="progress-nodes">
          {stages.map((stage, i) => {
            const current = i === stageIndex;
            const done = i < stageIndex;
            const last = i === stages.length - 1 && current;
            return (
              <div key={stage} className={cn("progress-node", current && "is-current")}>
                <div className="rail-mark">
                  {current ? (
                    <span className={last ? "arrived-pill" : "now-pill"}>{last ? "Delivered" : "Now"}</span>
                  ) : (
                    <span className={cn("stage-disc", !done && "is-faint")}>{done ? <Check size={13} /> : i + 1}</span>
                  )}
                </div>
                <div className={cn("rail-label", done && "is-done", current && (last ? "is-arrived" : "is-now"))}>{stage}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LocatorRail({ index, onPick }: { index: number; onPick?: (i: number) => void }) {
  return (
    <div className="rail-scroll">
      <div className="locator-rail">
        <div className="locator-track">
          <div
            className="h-full rounded-full"
            style={{ width: `${(index / (locatorLane.length - 1)) * 100}%`, background: "var(--desk-accent)" }}
          />
        </div>
        <div className="locator-nodes">
          {locatorLane.map((step, i) => {
            const current = i === index;
            const done = i < index;
            const arrived = current && i === locatorLane.length - 1;
            return (
              <button
                key={step.code}
                type="button"
                className={cn("locator-node", current && "is-current")}
                onClick={() => onPick?.(i)}
              >
                <div className="rail-mark">
                  {current ? (
                    <span className={arrived ? "arrived-pill" : "now-pill"}>
                      <Car size={13} /> {arrived ? "Arrived" : "Now"}
                    </span>
                  ) : (
                    <span className={cn("stage-disc", !done && "is-faint")}>{done ? <Check size={13} /> : null}</span>
                  )}
                </div>
                <div className={cn("rail-label", done && "is-done", current && (arrived ? "is-arrived" : "is-now"))}>
                  {step.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MessageThread({
  deal,
  self,
}: {
  deal: Deal;
  self: "staff" | "customer";
}) {
  const sendMessage = useDemo((s) => s.sendMessage);
  const [text, setText] = useState("");
  return (
    <div>
      <div className="mb-3 flex max-h-[260px] flex-col gap-2.5 overflow-y-auto">
        {deal.messages.map((m, i) => {
          const mine = m.from === self;
          return (
            <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className="max-w-[78%]">
                <div
                  className={cn("rounded-[16px] px-3 py-2 text-[13.5px] leading-snug", mine ? "shell-glass-row" : "shell-glass-float")}
                >
                  {m.text}
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--shell-text-faint)]" style={{ textAlign: mine ? "right" : "left" }}>
                  {m.at}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <div className="shell-glass-inset login-field flex-1 rounded-[10px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                sendMessage(deal.id, self, text.trim());
                setText("");
              }
            }}
            placeholder={self === "customer" ? "Message me…" : "Type a message…"}
            className="w-full bg-transparent px-3 py-2.5 text-[13.5px] text-white outline-none"
          />
        </div>
        <button
          type="button"
          className="cta-amber flex items-center rounded-xl px-3.5"
          onClick={() => {
            if (!text.trim()) return;
            sendMessage(deal.id, self, text.trim());
            setText("");
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

function CustomerPane() {
  const deals = useDemo((s) => s.deals);
  const selectedDealId = useDemo((s) => s.selectedDealId);
  const pickDeal = useDemo((s) => s.pickDeal);
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const brand = BRANDS[brandId];
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
  const [showLocator, setShowLocator] = useState(true);
  const [showFinance, setShowFinance] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  if (!deal) return null;

  const stages = getStages(deal.customerType, deal.type);
  const keys = checklistKeysFor(deal);
  const doneCount = keys.filter((k) => deal.checklistState[k]).length;
  const pct = keys.length ? Math.round((doneCount / keys.length) * 100) : 0;
  const delivered = isOrderDelivered(deal);
  const first = firstNameFor(deal);
  const locator = locatorLane[deal.locatorIndex];
  const days = deal.handover && deal.handoverConfirmed ? daysUntil(deal.handover) : null;

  if (delivered) {
    return (
      <div className="mx-auto max-w-[640px] px-5 py-10">
        <div className="customer-preview-bar mb-4 flex flex-wrap items-center gap-2.5">
          <div className="font-mono text-xs text-[var(--mist)]">Staff preview: viewing as customer</div>
          <select
            value={deal.id}
            onChange={(e) => pickDeal(e.target.value)}
            className="rounded-[11px] border px-2.5 py-2 text-[13px]"
            style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
          >
            {deals.map((o) => (
              <option key={o.id} value={o.id}>
                {o.customer}: {o.vehicle}
              </option>
            ))}
          </select>
        </div>
        <div className="shell-glass mb-5 rounded-[22px] p-10 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full" style={{ background: "var(--wash-emerald-bg)" }}>
            <CheckCircle2 size={28} color="var(--emerald)" />
          </div>
          <div className="mb-2 text-2xl font-medium">Hi {first}, I hope you're enjoying your new car!</div>
          <p className="text-[14.5px] leading-relaxed text-[var(--shell-text-dim)]">
            If you need any help, message me below, or reach out directly any time.
          </p>
        </div>
        <div className="shell-glass rounded-[24px] p-5">
          <div className="mb-3.5 text-[13px] font-semibold">Message Me</div>
          <MessageThread deal={deal} self="customer" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-7 pb-24">
      <div className="customer-preview-bar mb-2.5 flex flex-wrap items-center gap-2.5">
        <div className="font-mono text-xs text-[var(--mist)]">Staff preview: viewing as customer</div>
        <select
          value={deal.id}
          onChange={(e) => pickDeal(e.target.value)}
          className="rounded-[11px] border px-2.5 py-2 text-[13px]"
          style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
        >
          {deals.map((o) => (
            <option key={o.id} value={o.id}>
              {o.customer}: {o.vehicle}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3.5 text-lg font-medium">Welcome back, {first}</div>

      <div className="shell-glass customer-header-card mb-5 rounded-[24px] p-7">
        <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
          <div className="shell-eyebrow font-mono text-xs tracking-widest">
            {deal.type !== "Used" && `${deal.id} · `}
            {deal.customerType} · {deal.type}
          </div>
          {deal.reg && (
            <div className="rounded-[9px] px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest" style={{ background: "var(--shell-accent)", color: "var(--shell-accent-ink)" }}>
              {deal.reg}
            </div>
          )}
        </div>
        <div className="mb-1 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Car size={18} color="var(--shell-text-faint)" />
          </span>
          <div className="text-[26px] leading-tight font-medium text-[#F6F5F1]">{deal.vehicle}</div>
        </div>
        <div className="mb-1.5 font-mono text-[11.5px] text-[#7C8F84]">VIN: {deal.vin || "-"}</div>
        <div className="mb-4 text-sm text-[#9FB0A6]">{deal.colour}</div>

        <div className="mb-4 flex flex-wrap gap-4 text-[12.5px] text-[#C9D3CC]">
          {(deal.balance > 0 || deal.checklistState.balancePaid) && (
            <div className="flex items-center">
              {deal.checklistState.balancePaid ? "Balance" : "Balance outstanding"}:
              <strong className="ml-1" style={{ color: deal.checklistState.balancePaid ? "var(--emerald)" : "#F6F5F1" }}>
                {deal.checklistState.balancePaid ? "Paid" : gbp(deal.balance)}
              </strong>
              {!deal.checklistState.balancePaid && (
                <span className="ml-1">
                  <InfoBubble text={`Pay to ${company}. Ref: ${deal.reg || "your registration"}`} />
                </span>
              )}
            </div>
          )}
          {deal.hasPartExchange && (
            <div className="flex items-center gap-1">
              Part exchange: <strong className="text-white">{deal.partExchangeReg || "-"}</strong>
              <InfoBubble text="Final value will be confirmed before handover" />
            </div>
          )}
        </div>

        {deal.monthEnd && (
          <div className="mb-2.5 flex items-center gap-3 rounded-[14px] px-4 py-3" style={{ background: deal.monthEndTasksComplete ? "rgba(75,168,46,0.14)" : "rgba(185,139,78,0.14)", border: `1px solid ${deal.monthEndTasksComplete ? "rgba(75,168,46,0.35)" : "rgba(185,139,78,0.35)"}` }}>
            {deal.monthEndTasksComplete ? <CheckCircle2 size={19} color="var(--emerald)" /> : <FileCheck size={19} color="var(--brass)" />}
            <div>
              <div className="text-sm font-semibold">{deal.monthEndTasksComplete ? "Your paperwork is all sorted!" : "Everything needs to be finalised by the end of the month"}</div>
              <div className="font-mono text-[11.5px]" style={{ color: deal.monthEndTasksComplete ? "var(--emerald)" : "var(--brass)" }}>
                Your car itself follows a little later. See the date below
              </div>
            </div>
          </div>
        )}

        {deal.handover && deal.handoverConfirmed ? (
          <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] px-4 py-3.5" style={{ background: "rgba(185,139,78,0.14)", border: "1px solid rgba(185,139,78,0.35)" }}>
            <Calendar size={22} color="var(--brass)" />
            <div>
              <div className="text-[15px] font-semibold">{formatLongDate(deal.handover)}{deal.handoverTime ? ` at ${deal.handoverTime}` : ""}</div>
              <div className="font-mono text-xs" style={{ color: "var(--brass)" }}>
                {days != null && days > 0 ? `${days} day${days === 1 ? "" : "s"} until handover` : days === 0 ? "Handover is today" : "Handover arranged"}
              </div>
            </div>
            {deal.handoverMethod && (
              <div className="ml-auto rounded-full px-3 py-1 font-mono text-xs font-semibold" style={{ background: "rgba(185,139,78,0.18)", border: "1px solid rgba(185,139,78,0.35)", color: "var(--brass)" }}>
                {deal.handoverMethod}
              </div>
            )}
          </div>
        ) : deal.estimatedStart || deal.estimatedEnd ? (
          <div className="flex items-center gap-3.5 rounded-[14px] px-4 py-3.5" style={{ background: "rgba(185,139,78,0.14)", border: "1px solid rgba(185,139,78,0.35)" }}>
            <Calendar size={22} color="var(--brass)" />
            <div>
              <div className="text-[15px] font-semibold">
                {deal.estimatedStart && deal.estimatedEnd
                  ? `${formatShortDate(deal.estimatedStart)} to ${formatShortDate(deal.estimatedEnd)}`
                  : "Window to follow"}
              </div>
              <div className="font-mono text-xs" style={{ color: "var(--brass)" }}>Estimated arrival: exact date to follow</div>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-[#9FB0A6]">Handover date to be confirmed</div>
        )}
      </div>

      {deal.type === "New" && locator && (
        <div className="shell-glass mb-5 rounded-[24px] p-5">
          <button type="button" onClick={() => setShowLocator((v) => !v)} className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck size={15} />
              <div className="text-[13px] font-semibold">Car Locator</div>
              <span className="font-mono text-xs font-semibold" style={{ color: "var(--emerald)" }}>{locator.label}</span>
            </div>
            <ChevronRight size={13} color="var(--mist)" style={{ transform: showLocator ? "rotate(90deg)" : undefined }} />
          </button>
          {showLocator && (
            <div className="mt-4">
              <LocatorRail index={deal.locatorIndex} />
            </div>
          )}
        </div>
      )}

      <div className="shell-glass mb-5 rounded-[24px] p-5">
        <div className="mb-3.5 text-[13px] font-semibold">Order Progress</div>
        <ProgressRail stages={stages} stageIndex={deal.stageIndex} />
      </div>

      {(deal.customerType === "Finance" || deal.customerType === "Lease") && (
        <div className="shell-glass mb-5 rounded-[24px] p-5">
          <button type="button" onClick={() => setShowFinance((v) => !v)} className="flex w-full items-center justify-between text-[13px] font-semibold">
            Finance Details
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--emerald)" }}>
              {showFinance ? "Hide" : "View finance details"} <ChevronRight size={13} style={{ transform: showFinance ? "rotate(90deg)" : undefined }} />
            </span>
          </button>
          {showFinance && (
            <div className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
              <Row k="Finance company" v={deal.financeCompany || brand.label + " Financial Services"} />
              <Row k="Finance type" v={deal.financeType || "-"} />
              <Row k="Monthly amount" v={deal.monthlyAmount ? gbp(deal.monthlyAmount) : "-"} />
            </div>
          )}
        </div>
      )}

      <div className="shell-glass mb-5 rounded-[24px] p-5">
        <button type="button" onClick={() => setShowProducts((v) => !v)} className="flex w-full items-center justify-between text-[13px] font-semibold">
          Products Included
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--emerald)" }}>
            {showProducts ? "Hide" : "View products included"} <ChevronRight size={13} style={{ transform: showProducts ? "rotate(90deg)" : undefined }} />
          </span>
        </button>
        {showProducts && (
          <div className="mt-4 flex flex-col gap-2">
            {PRODUCTS_INCLUDED.filter((p) => !p.hiddenFor?.includes(deal.customerType)).map((p) => {
              const has = Boolean(deal[p.key]);
              return (
                <div key={p.key} className="shell-glass-row flex items-center gap-2.5 rounded-[16px] px-3 py-2.5">
                  {has ? <CheckCircle2 size={18} color="var(--emerald)" /> : <X size={18} color="#C0463A" />}
                  <div className="flex-1 text-[13.5px]">{p.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shell-glass mb-5 rounded-[24px] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[13px] font-semibold">Your Outstanding Tasks</div>
          <div className="font-mono text-xs" style={{ color: pct === 100 ? "var(--emerald)" : "var(--mist)" }}>
            {doneCount}/{keys.length} complete
          </div>
        </div>
        <div className="shell-glass-inset mb-5 h-1.5 overflow-hidden rounded-full">
          <div className="h-full" style={{ width: `${pct}%`, background: pct === 100 ? "var(--emerald)" : "var(--shell-accent)" }} />
        </div>
        <div className="flex flex-col gap-1.5">
          {keys.map((k) => {
            const done = !!deal.checklistState[k];
            const label = k === "connect" ? `${brand.label} Connect` : CHECKLIST_DEFS[k]?.label ?? k;
            return (
              <div key={k} className="shell-glass-row flex items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-sm">
                {done ? <CheckCircle2 size={18} color="var(--emerald)" /> : <Circle size={18} color="#C6CBC1" />}
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {deal.agreedActions.length > 0 && (
        <div className="shell-glass mb-5 rounded-[24px] p-5">
          <div className="mb-1 text-[13px] font-semibold">Being Taken Care of for You</div>
          <div className="mb-4 text-[12.5px] text-[var(--mist)]">Work being completed on your vehicle before handover.</div>
          {deal.agreedActions.map((a) => (
            <div key={a.id} className="shell-glass-row mb-1.5 flex items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-sm">
              {a.done ? <CheckCircle2 size={18} color="var(--emerald)" /> : <Circle size={18} color="#C6CBC1" />}
              {a.label}
            </div>
          ))}
        </div>
      )}

      {deal.handoverChecklist.length > 0 && (
        <div className="shell-glass mb-5 rounded-[24px] p-5">
          <div className="mb-1 text-[13px] font-semibold">Handover Checklist</div>
          <div className="mb-4 text-[12.5px] text-[var(--mist)]">Quick reminders for your handover day.</div>
          {deal.handoverChecklist.map((item) => (
            <div key={item.id} className="shell-glass-row mb-1.5 flex items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-sm">
              <Check size={16} color="var(--emerald)" /> {item.label}
            </div>
          ))}
        </div>
      )}

      {deal.notes && (
        <div className="shell-glass mb-5 rounded-[24px] p-5">
          <div className="mb-2 text-[13px] font-semibold">A note from me</div>
          <p className="text-sm text-[var(--shell-text-dim)]">{deal.notes}</p>
        </div>
      )}

      <div className="shell-glass mb-5 rounded-[24px] p-5">
        <div className="mb-3.5 text-[13px] font-semibold">Message Me</div>
        <MessageThread deal={deal} self="customer" />
      </div>

      <div className="flex flex-wrap justify-center gap-2.5">
        <span className="shell-glass inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-[13px]">
          <Phone size={14} color="var(--emerald)" /> Call the desk
        </span>
        <span className="shell-glass inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-[13px]">
          <Mail size={14} color="var(--emerald)" /> Email the desk
        </span>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--mist)]">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}

function DealerPane() {
  const deals = useDemo((s) => s.deals);
  const selectedDealId = useDemo((s) => s.selectedDealId);
  const selectDeal = useDemo((s) => s.selectDeal);
  const search = useDemo((s) => s.search);
  const setSearch = useDemo((s) => s.setSearch);
  const monthOnly = useDemo((s) => s.monthOnly);
  const setMonthOnly = useDemo((s) => s.setMonthOnly);
  const setStage = useDemo((s) => s.setStage);
  const setLocator = useDemo((s) => s.setLocator);
  const patchDeal = useDemo((s) => s.patchDeal);
  const toggleChecklist = useDemo((s) => s.toggleChecklist);
  const confirmDeal = useDemo((s) => s.confirmDeal);
  const addDeal = useDemo((s) => s.addDeal);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const brand = BRANDS[brandId];
  const [collapsed, setCollapsed] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVehicle, setNewVehicle] = useState("");
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
  const q = search.trim().toLowerCase();
  const filtered = deals.filter((d) => {
    if (q) {
      const hay = `${d.customer} ${d.vehicle} ${d.vin} ${d.reg} ${d.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    } else if (monthOnly && !d.monthEnd && !(d.handover && d.handover.startsWith("2026-09"))) {
      return false;
    }
    return true;
  });
  if (!deal) return null;
  const stages = getStages(deal.customerType, deal.type);
  const keys = checklistKeysFor(deal);
  const products = PRODUCTS_INCLUDED.filter((p) => !p.hiddenFor?.includes(deal.customerType));

  return (
    <div className="mx-auto flex max-w-[1600px] gap-4 px-4 py-5 sm:px-5">
      <aside
        className={cn("shrink-0 transition-all", collapsed ? "w-0 overflow-hidden" : "w-[300px]")}
        style={{ display: collapsed ? "none" : undefined }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-semibold">Customers</div>
          <button type="button" onClick={() => setCollapsed(true)} className="p-1 text-[var(--mist)]">
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="mb-3.5 flex gap-2">
          <div className="relative flex-1">
            <Search size={15} color="#8D9BA4" className="pointer-events-none absolute top-2.5 left-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, VIN, reg, email…"
              className="dealer-sidebar-search h-[38px] w-full rounded-[22px] border pr-3 pl-8 text-[13px]"
              style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            title="New order"
            className="flex size-[38px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--emerald)", color: "#fff" }}
          >
            <Plus size={17} />
          </button>
        </div>
        {!q && (
          <label className="mb-3 flex cursor-pointer items-center gap-1.5 text-xs text-[var(--mist)]">
            <input type="checkbox" checked={monthOnly} onChange={(e) => setMonthOnly(e.target.checked)} />
            This month only <span>(untick to see every active customer)</span>
          </label>
        )}
        <div className="flex flex-col gap-2">
          {filtered.map((o) => {
            const oKeys = checklistKeysFor(o);
            const pct = oKeys.length ? Math.round((oKeys.filter((k) => o.checklistState[k]).length / oKeys.length) * 100) : 0;
            const selected = o.id === deal.id;
            const tint = CUSTOMER_TYPE_TINT[o.customerType];
            const oStages = getStages(o.customerType, o.type);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => selectDeal(o.id)}
                className="flex gap-2 rounded-2xl px-3.5 py-3 text-left"
                style={{
                  background: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${selected ? "rgba(75,168,46,0.5)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                <div
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold"
                  style={{ background: selected ? "rgba(255,255,255,0.15)" : tint.bg, color: selected ? "#fff" : tint.fg }}
                >
                  {initials(o.customer)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="truncate text-[13.5px] font-semibold">{o.customer}</div>
                    <ChevronRight size={14} color="#9FB0A6" />
                  </div>
                  <div className="truncate text-xs text-[#9FB0A6]">{o.vehicle}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wide" style={{ background: selected ? "rgba(255,255,255,0.15)" : tint.bg, color: selected ? "#DCE7DF" : tint.fg }}>
                      {o.customerType.toUpperCase()} · {o.type.toUpperCase()}
                    </span>
                    {o.monthEnd && <span className="month-end-tag">MONTH-END</span>}
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] font-semibold text-[#DCE7DF]">{oStages[o.stageIndex]}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--desk-accent)" }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {collapsed && (
        <button type="button" onClick={() => setCollapsed(false)} className="shell-glass h-10 w-10 shrink-0 rounded-xl" title="Show customer list">
          <ChevronRight size={18} className="mx-auto" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="shell-glass mb-4 rounded-[24px] p-6">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div className="shell-eyebrow font-mono text-xs tracking-widest">
              {deal.id} · {deal.reg}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold" style={{ background: CUSTOMER_TYPE_TINT[deal.customerType].bg, color: CUSTOMER_TYPE_TINT[deal.customerType].fg }}>
                {deal.customerType} · {deal.type}
              </span>
              {isCarAtDealership(deal) && (
                <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold" style={{ background: deal.trackerRef ? "var(--pine-tint)" : "var(--brass-tint)", color: deal.trackerRef ? "var(--emerald)" : "var(--brass)" }}>
                  <Key size={12} /> {deal.trackerRef || "Not set"}
                </span>
              )}
              <button type="button" onClick={() => confirmDeal(deal.id)}>
                <YesNo yes={deal.confirmed} />
              </button>
            </div>
          </div>
          <div className="text-[26px] leading-tight font-medium">{deal.customer}{deal.nickname ? ` (goes by ${deal.nickname})` : ""}</div>
          <div className="mt-1 text-lg text-white/90">{deal.vehicle}</div>
          <div className="mt-1 text-sm text-[var(--shell-text-dim)]">
            {deal.colour} · VIN {deal.vin.slice(-7)} · {deal.email} · {deal.phone}
          </div>
          {deal.internalNotes && (
            <div className="mt-3 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "rgba(217,162,75,0.12)", color: "var(--shell-accent)" }}>
              Internal note (staff only): {deal.internalNotes}
            </div>
          )}
          <div className="mt-3 text-xs text-[var(--shell-text-faint)]">Salesperson: {deal.salesperson}</div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-3 text-[13px] font-semibold">Handover</div>
              <label className="mb-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={deal.monthEnd} onChange={() => patchDeal(deal.id, { monthEnd: !deal.monthEnd }, `Month-end ${!deal.monthEnd ? "on" : "off"}`)} />
                Month-end deal: counts toward this month
              </label>
              {deal.monthEnd && (
                <label className="mb-3 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={deal.monthEndTasksComplete} onChange={() => patchDeal(deal.id, { monthEndTasksComplete: !deal.monthEndTasksComplete })} />
                  Month-end paperwork complete
                </label>
              )}
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <label className="text-[12.5px] text-[var(--mist)]">
                  Confirmed date
                  <input
                    type="date"
                    value={deal.handover ?? ""}
                    onChange={(e) => patchDeal(deal.id, { handover: e.target.value || null, handoverConfirmed: !!e.target.value })}
                    className="mt-1 h-9 w-full rounded-[10px] border px-2 text-[13px]"
                    style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
                  />
                </label>
                <label className="text-[12.5px] text-[var(--mist)]">
                  Time
                  <input
                    type="time"
                    value={deal.handoverTime ?? ""}
                    onChange={(e) => patchDeal(deal.id, { handoverTime: e.target.value || null })}
                    className="mt-1 h-9 w-full rounded-[10px] border px-2 text-[13px]"
                    style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
                  />
                </label>
              </div>
              <div className="mb-3 text-[12.5px] text-[var(--mist)]">
                {deal.handoverConfirmed && deal.handover
                  ? `${formatLongDate(deal.handover)}${deal.handoverTime ? ` at ${deal.handoverTime}` : ""}`
                  : deal.estimatedStart
                    ? `Estimated ${formatShortDate(deal.estimatedStart)}${deal.estimatedEnd ? ` to ${formatShortDate(deal.estimatedEnd)}` : ""}`
                    : "No date set"}
              </div>
              <div className="mb-2 text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Method</div>
              <div className="flex flex-wrap gap-1.5">
                {HANDOVER_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => patchDeal(deal.id, { handoverMethod: m })}
                    className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
                    style={{
                      background: deal.handoverMethod === m ? "var(--shell-accent)" : "rgba(255,255,255,0.08)",
                      color: deal.handoverMethod === m ? "var(--shell-accent-ink)" : "var(--shell-text-dim)",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[12.5px] text-[var(--mist)]">
                Salesperson
                <select
                  value={deal.salesperson}
                  onChange={(e) => {
                    const name = e.target.value;
                    const seat = STAFF.find((s) => s.name === name);
                    patchDeal(deal.id, { salesperson: name, salespersonInitials: seat?.initials ?? initials(name) });
                  }}
                  className="mt-1 h-9 w-full rounded-[10px] border px-2 text-[13px]"
                >
                  {STAFF.filter((s) => s.target > 0).map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              {isCarAtDealership(deal) && (
                <label className="mt-3 block text-[12.5px] text-[var(--mist)]">
                  Tracker / key location
                  <input
                    value={deal.trackerRef}
                    onChange={(e) => patchDeal(deal.id, { trackerRef: e.target.value })}
                    placeholder="e.g. Cabinet A"
                    className="mt-1 h-9 w-full rounded-[10px] border px-2 text-[13px]"
                    style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
                  />
                </label>
              )}
            </div>

            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-3 text-[13px] font-semibold">
                {deal.customerType} · {deal.type} car journey
              </div>
              <div className="flex flex-wrap gap-1">
                {stages.map((stage, i) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setStage(deal.id, i)}
                    className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold"
                    style={{
                      background: i === deal.stageIndex ? "var(--emerald)" : "rgba(255,255,255,0.06)",
                      color: i === deal.stageIndex ? "#fff" : "var(--shell-text-faint)",
                    }}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            {deal.type === "New" && (
              <div className="shell-glass mb-4 rounded-[24px] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[13px] font-semibold">Car Locator</div>
                  <span className="font-mono text-xs" style={{ color: "var(--emerald)" }}>{locatorLane[deal.locatorIndex]?.label}</span>
                </div>
                <LocatorRail index={deal.locatorIndex} onPick={(i) => setLocator(deal.id, i)} />
                <button type="button" className="cta-amber mt-3 rounded-xl px-3 py-2 text-[12.5px] font-semibold">
                  Notify customer of this status
                </button>
              </div>
            )}

            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-3 text-[13px] font-semibold">Order details</div>
              <div className="mb-3 text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Purchase method</div>
              <ChipRow
                options={["Motability", "Finance", "Cash", "Lease"].map((t) => ({ value: t, label: t }))}
                value={deal.customerType}
                onChange={(ct) => patchDeal(deal.id, { customerType: ct as Deal["customerType"] })}
              />
              <div className="mt-3 mb-2 text-[10.5px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">Car type</div>
              <SegmentedControl
                options={[{ value: "New", label: "New" }, { value: "Used", label: "Used" }]}
                value={deal.type}
                onChange={(v) => patchDeal(deal.id, { type: v as Deal["type"] })}
              />
              <label className="mt-4 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={deal.hasPartExchange} onChange={() => patchDeal(deal.id, { hasPartExchange: !deal.hasPartExchange })} />
                Part exchange
              </label>
              {deal.hasPartExchange && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    value={deal.partExchangeReg}
                    onChange={(e) => patchDeal(deal.id, { partExchangeReg: e.target.value })}
                    placeholder="Part-exchange registration"
                    className="h-9 rounded-[10px] border px-2 text-[13px]"
                    style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
                  />
                  <select
                    value={deal.financeSettle}
                    onChange={(e) => patchDeal(deal.id, { financeSettle: e.target.value as Deal["financeSettle"] })}
                    className="h-9 rounded-[10px] border px-2 text-[13px]"
                  >
                    <option value="">Finance to settle?</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              )}
              <div className="mt-4 mb-2 text-[13px] font-semibold">Products included</div>
              {products.map((p) => (
                <label key={p.key} className="mb-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={Boolean(deal[p.key])} onChange={() => patchDeal(deal.id, { [p.key]: !deal[p.key] } as Partial<Deal>)} />
                  {p.label}
                </label>
              ))}
              <div className="mt-4 text-[13px] text-[var(--mist)]">Balance outstanding</div>
              <div className="text-xl font-semibold">{gbp(deal.balance)}</div>
              {(deal.customerType === "Finance" || deal.customerType === "Lease") && (
                <div className="mt-3 grid gap-1 text-[13px]">
                  <div className="flex justify-between"><span className="text-[var(--mist)]">Finance company</span><span>{deal.financeCompany || `${brand.label} Financial Services`}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--mist)]">Type</span><span>{deal.financeType || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--mist)]">Monthly</span><span>{deal.monthlyAmount ? gbp(deal.monthlyAmount) : "-"}</span></div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-1 text-[13px] font-semibold">Agreed actions</div>
              <div className="mb-3 text-[12.5px] text-[var(--mist)]">Internal prep work, shown to the customer as read-only.</div>
              {deal.agreedActions.map((a) => (
                <label key={a.id} className="mb-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={a.done} onChange={() => patchDeal(deal.id, { agreedActions: deal.agreedActions.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) })} />
                  {a.label}
                </label>
              ))}
              {deal.handoverChecklist.length > 0 && (
                <>
                  <div className="mt-4 mb-1 text-[13px] font-semibold">Handover checklist</div>
                  <div className="mb-2 text-[12.5px] text-[var(--mist)]">Shown to the customer as reminders for the day.</div>
                  {deal.handoverChecklist.map((item) => (
                    <div key={item.id} className="mb-1 flex items-center gap-2 text-sm">
                      <Check size={14} color="var(--emerald)" /> {item.label}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-3 text-[13px] font-semibold">Customer to-do list</div>
              {keys.map((k) => {
                const label = k === "connect" ? `${brand.label} Connect` : CHECKLIST_DEFS[k]?.label ?? k;
                return (
                  <label key={k} className="mb-1.5 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!deal.checklistState[k]} onChange={() => toggleChecklist(deal.id, k)} />
                    {label}
                  </label>
                );
              })}
            </div>
            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                <MessageCircle size={14} /> Messages with {firstNameFor(deal)}
              </div>
              <MessageThread deal={deal} self="staff" />
            </div>
            <div className="shell-glass mb-4 rounded-[24px] p-5">
              <div className="mb-2 text-[13px] font-semibold">Note visible to customer</div>
              <textarea
                value={deal.notes}
                onChange={(e) => patchDeal(deal.id, { notes: e.target.value })}
                rows={3}
                placeholder="e.g. Bring your driving licence and old V5 on handover day."
                className="w-full rounded-xl border p-2.5 text-[13.5px]"
                style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
              />
            </div>
            <div className="shell-glass mb-4 rounded-[24px] px-5 py-4">
              <button type="button" onClick={() => setShowLog((v) => !v)} className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                  Activity log <span className="font-mono text-[11px] text-[var(--mist)]">{deal.activityLog.length} entries</span>
                </div>
                <ChevronDown size={14} style={{ transform: showLog ? "rotate(180deg)" : undefined }} />
              </button>
              {showLog && (
                <div className="mt-3 max-h-[220px] overflow-y-auto">
                  {[...deal.activityLog].reverse().map((e, i) => (
                    <div key={i} className="flex gap-2.5 border-b border-white/10 py-1.5 font-mono text-[11.5px] text-[var(--shell-text-dim)]">
                      <span className="shrink-0 text-[var(--mist)]">{e.ts.slice(0, 10)}</span>
                      <span>{e.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <GlassModal open={showNew} onClose={() => setShowNew(false)}>
        <div className="mb-3 text-sm font-bold">New customer profile</div>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" className="mb-1.5 h-10 w-full rounded-[10px] border px-3 text-[13px]" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} />
        <input value={newVehicle} onChange={(e) => setNewVehicle(e.target.value)} placeholder={`Vehicle (e.g. ${brand.label} model)`} className="mb-3 h-10 w-full rounded-[10px] border px-3 text-[13px]" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} />
        <p className="mb-3 text-[10.5px] text-white/80">This is a demo book. New profiles stay on this site until you refresh.</p>
        <button
          type="button"
          className="w-full rounded-[10px] py-2.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--emerald)" }}
          onClick={() => {
            if (!newName.trim()) return;
            const id = `ORD-${1071 + deals.length}`;
            addDeal({
              ...deal,
              id,
              customer: newName.trim(),
              vehicle: newVehicle.trim() || deal.vehicle,
              email: "",
              phone: "",
              nickname: "",
              confirmed: false,
              stageIndex: 0,
              locatorIndex: 0,
              gp: null,
              monthEnd: false,
              messages: [],
              activityLog: [{ ts: new Date().toISOString(), text: "Order created" }],
              site,
            });
            setShowNew(false);
            setNewName("");
            setNewVehicle("");
          }}
        >
          Create
        </button>
      </GlassModal>
    </div>
  );
}

function OverviewPane() {
  const deals = useDemo((s) => s.deals);
  const selectedDealId = useDemo((s) => s.selectedDealId);
  const selectDeal = useDemo((s) => s.selectDeal);
  const setGp = useDemo((s) => s.setGp);
  const confirmDeal = useDemo((s) => s.confirmDeal);
  const patchDeal = useDemo((s) => s.patchDeal);
  const toggleChecklist = useDemo((s) => s.toggleChecklist);
  const brandId = useDemo((s) => s.brandId);
  const brand = BRANDS[brandId];
  const [mode, setMode] = useState<"table" | "calendar" | "delivered">("table");
  const [rep, setRep] = useState("all");

  const scoped = deals.filter((d) => (rep === "all" ? true : d.salesperson === rep));
  const live = scoped.filter((d) => !isOrderDelivered(d));
  const current = live.filter((d) => d.handover?.startsWith("2026-09") || d.monthEnd);
  const forward = live.filter((d) => d.estimatedStart && !d.handover?.startsWith("2026-09") && !d.monthEnd);
  const unassigned = live.filter((d) => !current.includes(d) && !forward.includes(d));
  const delivered = scoped.filter(isOrderDelivered);

  const confirmedThisMonth = scoped.filter((d) => d.confirmed && (d.handover?.startsWith("2026-09") || d.monthEnd || isOrderDelivered(d)));
  const gpSum = confirmedThisMonth.reduce((a, d) => a + (d.gp ?? 0), 0);
  const eligible = confirmedThisMonth.filter((d) => d.customerType !== "Motability" && d.customerType !== "Lease");
  const sold = eligible.reduce((n, d) => n + [d.ceramicProtection, d.bodyworkProtection, d.alloyTyreProtection].filter(Boolean).length, 0);
  const opp = eligible.length * 3;
  const attach = opp ? Math.round((sold / opp) * 100) : 0;

  const cols = ["Delivered", "Confirmed", "Type", "Customer", "Delivery date", "REG", "Connect", "WS Req", "Identity", "On H/O diary", "PX?", "PX V5", "Tracker", "On-site", "Notes", "Deal File", "Model", "Finance", "Finance to Settle?", "GP (£)"];

  function section(title: string, subtitle: string, rows: Deal[]) {
    return (
      <div className="mb-6">
        <div className="mb-1 text-[15px] font-medium">{title}</div>
        <div className="mb-2 text-[12.5px] text-[var(--mist)]">{subtitle}</div>
        <div className="overflow-x-auto rounded-[24px] shell-glass p-2">
          <table className="overview-table min-w-[1400px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <OverviewRow
                  key={d.id}
                  deal={d}
                  selected={d.id === selectedDealId}
                  connectLabel={`${brand.label} Connect`}
                  onPick={() => selectDeal(d.id)}
                  onGp={(n) => setGp(d.id, n)}
                  onConfirm={() => confirmDeal(d.id)}
                  onPatch={(p) => patchDeal(d.id, p)}
                  onToggle={(k) => toggleChecklist(d.id, k)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1900px] px-5 py-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-medium">Overview</div>
          <div className="mt-0.5 text-[12.5px] text-[var(--mist)]">
            {mode === "table"
              ? "Click a customer's name (or edit any of their cells) to switch Dealer view / Customer view to them."
              : mode === "calendar"
                ? "Click a customer in the calendar to jump straight to Dealer view for them. Only confirmed handover dates appear here."
                : "Vehicles handed over this month, for your commission figures."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="h-9 rounded-xl border px-2.5 text-[12.5px]">
            <option value="all">All</option>
            {STAFF.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          <SegmentedControl
            options={[
              { value: "table", label: "Table" },
              { value: "calendar", label: "Calendar" },
              { value: "delivered", label: "Delivered" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <StatTile icon={ClipboardList} value={`${confirmedThisMonth.length}/${monthTarget.units}`} subtitle="Confirmed cars this month" tone={confirmedThisMonth.length >= monthTarget.units ? "ok" : confirmedThisMonth.length / monthTarget.units >= 0.71 ? "warn" : "bad"} />
        <StatTile icon={Receipt} value={gbp(gpSum)} subtitle="Confirmed GP this month" />
        <StatTile icon={Sparkles} value={`${attach}%`} subtitle={`Confirmed extras attach rate this month (${sold}/${opp})`} />
      </div>

      {mode === "table" && (
        <>
          {section("This month", "Includes anything overdue", current)}
          {section("Forward Orders", "Estimated delivery in a future month", forward)}
          {section("Unassigned", "No estimated or handover date set yet", unassigned)}
        </>
      )}
      {mode === "calendar" && <OverviewCalendar deals={live} onPick={selectDeal} />}
      {mode === "delivered" && (
        <div className="overflow-x-auto rounded-[24px] shell-glass p-3">
          <div className="mb-3 text-[12.5px] text-[var(--mist)]">
            {delivered.length} total deals counted in September · {delivered.filter((d) => d.isBev).length} BEV
          </div>
          <table className="overview-table min-w-[1100px]">
            <thead>
              <tr>
                {["Customer", "New/Used", "Type", "REG", "Delivery", "BEV", "Finance", "Ceramic", "Bodywork", "Alloy/Tyre", "GP (£)"].map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {delivered.map((d) => (
                <tr key={d.id}>
                  <td><button type="button" onClick={() => selectDeal(d.id)} className="font-medium">{d.customer}</button></td>
                  <td>{d.type}</td>
                  <td>{d.customerType}</td>
                  <td>{d.reg}</td>
                  <td>{d.handover ? formatShortDate(d.handover) : "-"}</td>
                  <td>{d.isBev ? "Yes" : "No"}</td>
                  <td>{d.financeType || "-"}</td>
                  <td>{d.ceramicProtection ? "Yes" : "-"}</td>
                  <td>{d.bodyworkProtection ? "Yes" : "-"}</td>
                  <td>{d.alloyTyreProtection ? "Yes" : "-"}</td>
                  <td>{d.gp == null ? "-" : gbp(d.gp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  value,
  subtitle,
  tone,
}: {
  icon: typeof ClipboardList;
  value: string;
  subtitle: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const wash =
    tone === "ok" ? "var(--wash-emerald-bg)" : tone === "warn" ? "var(--wash-amber-bg)" : tone === "bad" ? "var(--wash-danger-bg)" : "var(--shell-glass-bg)";
  const border =
    tone === "ok" ? "var(--wash-emerald-border)" : tone === "warn" ? "var(--wash-amber-border)" : tone === "bad" ? "var(--wash-danger-border)" : "var(--shell-glass-border)";
  return (
    <div className="shell-glass min-w-[220px] flex-1 rounded-[24px] px-4 py-3.5" style={{ background: wash, borderColor: border }}>
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: tone === "ok" ? "var(--emerald)" : tone === "bad" ? "var(--danger)" : "var(--shell-accent)" }}>
          <Icon size={15} color="#fff" />
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
          <div className="text-[11.5px] text-[var(--shell-text-faint)]">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function OverviewRow({
  deal,
  selected,
  connectLabel,
  onPick,
  onGp,
  onConfirm,
  onPatch,
  onToggle,
}: {
  deal: Deal;
  selected: boolean;
  connectLabel: string;
  onPick: () => void;
  onGp: (n: number | null) => void;
  onConfirm: () => void;
  onPatch: (p: Partial<Deal>) => void;
  onToggle: (k: string) => void;
}) {
  const delivered = isOrderDelivered(deal);
  const financeYes = deal.customerType === "Finance" || deal.customerType === "Lease";
  const canPx = deal.customerType !== "Motability" && deal.customerType !== "Lease";
  return (
    <tr style={{ background: selected ? "rgba(255,255,255,0.14)" : undefined }}>
      <td><YesNo yes={delivered} /></td>
      <td>
        <button type="button" onClick={onConfirm}><YesNo yes={deal.confirmed} /></button>
      </td>
      <td>{deal.type} · {deal.customerType}</td>
      <td>
        <button type="button" onClick={onPick} className="flex items-center gap-1.5 text-left" style={{ fontWeight: selected ? 700 : 400 }}>
          <span className="rounded bg-white/10 px-1 font-mono text-[9.5px] font-bold text-[var(--shell-text-dim)]">{deal.salespersonInitials}</span>
          {deal.customer}
          {deal.monthEnd && <span className="month-end-tag">MONTH-END</span>}
        </button>
      </td>
      <td>{deal.handover ? formatShortDate(deal.handover) : deal.estimatedStart ? `est ${formatShortDate(deal.estimatedStart)}` : "-"}</td>
      <td>{deal.reg || "-"}</td>
      <td>{deal.type === "New" && deal.vin ? <CheckCell checked={!!deal.checklistState.connect} onToggle={() => onToggle("connect")} title={connectLabel} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{wsReqApplicable(deal) ? <CheckCell checked={deal.wsReq === "Pushed"} onToggle={() => onPatch({ wsReq: deal.wsReq === "Pushed" ? "" : "Pushed" })} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{deal.customerType !== "Motability" ? <CheckCell checked={!!deal.checklistState.idVerification} onToggle={() => onToggle("idVerification")} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{isCarAtDealership(deal) ? <CheckCell checked={deal.onHoDiary} onToggle={() => onPatch({ onHoDiary: !deal.onHoDiary })} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{canPx ? <CheckCell checked={deal.hasPartExchange} onToggle={() => onPatch({ hasPartExchange: !deal.hasPartExchange })} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{canPx && deal.hasPartExchange ? <CheckCell checked={!!deal.checklistState.v5Document} onToggle={() => onToggle("v5Document")} /> : <span className="text-[var(--mist)]">-</span>}</td>
      <td>{isCarAtDealership(deal) ? deal.trackerRef || "-" : "-"}</td>
      <td>{deal.type === "New" ? locatorLane[deal.locatorIndex]?.label ?? "-" : deal.usedOnSite || "-"}</td>
      <td>
        <input
          value={deal.internalNotes}
          onChange={(e) => onPatch({ internalNotes: e.target.value })}
          placeholder="Internal note..."
          className="w-[170px] rounded-[9px] border px-1.5 py-1 text-[12.5px]"
          style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)" }}
        />
      </td>
      <td>
        <select value={deal.dealFileStatus} onChange={(e) => onPatch({ dealFileStatus: e.target.value as Deal["dealFileStatus"] })} className="rounded-[9px] border px-1 py-1 text-xs">
          <option value="No">No</option>
          <option value="Uploaded">Uploaded</option>
        </select>
      </td>
      <td>{deal.vehicle}</td>
      <td>{deal.customerType === "Motability" ? "-" : financeYes ? "Y" : "No"}</td>
      <td>{deal.hasPartExchange ? deal.financeSettle || "-" : "-"}</td>
      <td>
        <input
          inputMode="decimal"
          defaultValue={deal.gp ?? ""}
          key={`${deal.id}-${deal.gp}`}
          onBlur={(e) => {
            const n = e.target.value.trim();
            onGp(n === "" ? null : Number(n));
          }}
          className="w-20 rounded-[9px] border px-1.5 py-1 text-[12.5px]"
          style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.14)" }}
        />
      </td>
    </tr>
  );
}

function CheckCell({ checked, onToggle, title }: { checked: boolean; onToggle: () => void; title?: string }) {
  return (
    <button type="button" onClick={onToggle} title={title} className="flex">
      {checked ? <CheckCircle2 size={18} color="var(--emerald)" /> : <Circle size={18} color="#C6CBC1" />}
    </button>
  );
}

function OverviewCalendar({ deals, onPick }: { deals: Deal[]; onPick: (id: string) => void }) {
  const dated = deals.filter((d) => d.handover && d.handoverConfirmed);
  const byDay: Record<string, Deal[]> = {};
  dated.forEach((d) => {
    const day = d.handover!.slice(8, 10);
    byDay[day] = byDay[day] ? [...byDay[day]!, d] : [d];
  });
  return (
    <div className="shell-glass rounded-[24px] p-4">
      <div className="mb-3 text-[15px] font-medium">September 2026</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-wide text-[var(--shell-text-faint)]">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 1 }, (_, i) => (
          <div key={`pad-${i}`} className="min-h-[72px] rounded-xl border border-transparent p-1.5" />
        ))}
        {Array.from({ length: 30 }, (_, i) => {
          const day = String(i + 1).padStart(2, "0");
          const items = byDay[day] ?? [];
          return (
            <div key={day} className="min-h-[72px] rounded-xl border border-white/10 p-1.5">
              <div className="mb-1 text-[11px] text-[var(--shell-text-dim)]">{i + 1}</div>
              {items.map((d) => (
                <button key={d.id} type="button" onClick={() => onPick(d.id)} className="mb-0.5 block w-full truncate rounded-md px-1 py-0.5 text-left text-[10.5px] font-semibold" style={{ background: "var(--wash-amber-bg)", color: "var(--shell-accent)" }}>
                  {d.customer.split(" ")[0]}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodoPane() {
  const deals = useDemo((s) => s.deals);
  const selectDeal = useDemo((s) => s.selectDeal);
  const brandId = useDemo((s) => s.brandId);
  const brand = BRANDS[brandId];
  const [citnow, setCitnow] = useState(1);
  const [posts] = useState(2);
  const live = deals.filter((d) => !isOrderDelivered(d));
  const extrasChase = live.filter((d) => (d.customerType === "Finance" || d.customerType === "Lease") && !d.ceramicProtection);
  const open = live.flatMap((d) => {
    const keys = checklistKeysFor(d);
    const tasks = keys.filter((k) => !d.checklistState[k]).map((k) => ({
      deal: d,
      tag: "TASK" as const,
      label: k === "connect" ? `${brand.label} Connect` : CHECKLIST_DEFS[k]?.label ?? k,
    }));
    const diary = d.handover && d.handoverConfirmed && !d.onHoDiary
      ? [{ deal: d, tag: "DIARY" as const, label: `Handover confirmed for ${formatShortDate(d.handover)}, not yet on the H/O diary` }]
      : [];
    return [...tasks, ...diary];
  });

  return (
    <div className="mx-auto max-w-[960px] px-5 py-7">
      <div className="mb-1 text-xl font-medium">To-Do List</div>
      <p className="mb-5 text-[12.5px] text-[var(--mist)]">Outstanding tasks and promises for customers due this month, earliest delivery first.</p>

      <div className="mb-3 shell-glass rounded-[18px] p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold">CitNOW videos today</div>
          <div className="font-mono text-xs">{citnow} of 3</div>
        </div>
        <div className="mb-2 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-3 rounded-full" style={{ background: i < citnow ? "var(--emerald)" : "rgba(255,255,255,0.18)" }} />
          ))}
        </div>
        <p className="mb-2 text-[12.5px] text-[var(--mist)]">{citnow >= 3 ? "Target hit. Nice one." : "You'll get a nudge at 3pm if you're still short."}</p>
        <button type="button" className="cta-amber rounded-xl px-3 py-1.5 text-[12.5px] font-semibold" onClick={() => setCitnow((n) => Math.min(3, n + 1))}>
          Log one
        </button>
      </div>

      <div className="mb-3 shell-glass rounded-[18px] p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold">Social posts this week</div>
          <div className="font-mono text-xs">{posts} of 3</div>
        </div>
        <p className="text-[12.5px] text-[var(--mist)]">Counts automatically when you tap "Mark posted" in Content.</p>
      </div>

      <div className="mb-3 shell-glass rounded-[18px] p-4">
        <div className="text-[13px] font-semibold">Reminders</div>
        <p className="mt-1 text-[12.5px] text-[var(--mist)]">Appear in your daily digest from the due date until ticked off.</p>
        <div className="mt-2 text-sm">Chase Motability PIN: Helen · Fri 18 Sep</div>
      </div>

      <div className="mb-6 shell-glass rounded-[18px] p-4">
        <div className="mb-1 text-[13px] font-semibold">Additional products · {extrasChase.length} to chase</div>
        <p className="mb-2 text-[12.5px] text-[var(--mist)]">Tick once you've asked. Stops it repeating in the daily digest.</p>
        {extrasChase.slice(0, 4).map((d) => (
          <div key={d.id} className="flex justify-between border-b border-white/10 py-2 text-sm">
            <span>{d.customer}</span>
            <span className="text-[var(--mist)]">{d.financeType || "Finance"} · not taken: Ceramic, Cosmetic, Alloy & Tyre</span>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-[var(--mist)]">Nothing outstanding for this month. You're all caught up.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {open.map((row, i) => (
            <li key={`${row.deal.id}-${i}`}>
              <button type="button" onClick={() => selectDeal(row.deal.id)} className="flex w-full items-center justify-between py-3 text-left">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold" style={{ background: row.tag === "DIARY" ? "var(--tint-blue-bg)" : "var(--wash-amber-bg)", color: row.tag === "DIARY" ? "var(--tint-blue-fg)" : "var(--shell-accent)" }}>{row.tag}</span>
                    {row.label}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--mist)]">
                    {row.deal.customer} · {row.deal.vehicle}
                  </div>
                </div>
                <span className="text-xs text-[var(--shell-text-faint)]">Open in Dealer view</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StockPane() {
  const stock = useDemo((s) => s.stock);
  const patchStock = useDemo((s) => s.patchStock);
  const brandId = useDemo((s) => s.brandId);
  const brand = BRANDS[brandId];
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "New" | "Used">("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const rows = stock
    .filter((c) => {
      if (kind !== "all" && c.type !== kind) return false;
      if (!q.trim()) return true;
      return `${c.vehicle} ${c.colour} ${c.vin} ${c.reg} ${c.keys}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => (sort === "new" ? a.days - b.days : b.days - a.days));
  const missingKeys = stock.filter((c) => c.missing || !c.keys);
  const reviewCount = missingKeys.length;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-7">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xl font-medium">Stock</div>
        <div className="flex gap-2">
          <button type="button" className="rounded-xl border border-white/15 px-3 py-2 text-[12.5px] font-semibold">Add car</button>
          <button type="button" className="cta-amber rounded-xl px-3 py-2 text-[12.5px] font-semibold">Upload VAG Excel</button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: "var(--moss-tint)", color: "var(--moss)" }}>
          <span className="size-1.5 rounded-full" style={{ background: "var(--moss)" }} /> {brand.label} UK: today 08:12
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: "var(--moss-tint)", color: "var(--moss)" }}>
          <span className="size-1.5 rounded-full" style={{ background: "var(--moss)" }} /> VAG Excel: yesterday 16:40
        </span>
        {reviewCount > 0 && (
          <button type="button" onClick={() => setReviewOpen((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold text-white" style={{ background: "var(--pine)" }}>
            {reviewCount} to review
          </button>
        )}
      </div>
      {reviewOpen && (
        <div className="shell-glass mb-4 rounded-[18px] p-4">
          <div className="mb-2 text-[13px] font-semibold">Needs a key location</div>
          {missingKeys.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-white/10 py-2 text-sm">
              <span>{c.vehicle} · {c.reg || c.vin.slice(-7)}</span>
              <span className="text-[var(--mist)]">{c.days}d on site</span>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 size-3.5 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reg, model, colour…" className="h-10 w-full rounded-[10px] border pr-3 pl-9 text-[13px]" style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }} />
        </div>
        <SegmentedControl
          options={[
            { value: "all", label: "New & Used" },
            { value: "New", label: "New only" },
            { value: "Used", label: "Used only" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
        />
        <SegmentedControl
          options={[
            { value: "new", label: "Newest arrivals" },
            { value: "old", label: "Longest in stock" },
          ]}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
        />
      </div>
      <ul>
        {rows.map((car) => {
          const sitePill = car.siteStatus && SITE_STATUS_PILL[car.siteStatus]
            ? { ...SITE_STATUS_PILL[car.siteStatus], label: car.siteStatus === "On-site" && car.siteSpot ? `On-site · ${car.siteSpot}` : car.siteStatus }
            : { bg: "var(--brass-tint)", fg: "var(--brass)", label: "Not set" };
          const keySet = Boolean(car.keys);
          return (
            <li key={car.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{car.vehicle}</span>
                  {car.derivative && <span className="text-sm text-[var(--shell-text-dim)]">{car.derivative}</span>}
                  <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold" style={{ background: car.type === "New" ? "var(--tint-blue-bg)" : "var(--wash-emerald-bg)", color: car.type === "New" ? "var(--tint-blue-fg)" : "#C5F0B0" }}>{car.type}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--shell-text-faint)]">
                  <span className="font-mono">{car.reg || car.vin.slice(-7)}</span>
                  <span>{car.colour}</span>
                  {car.miles != null && <span>{car.miles.toLocaleString()} mi</span>}
                  <span>{car.fuel} · {car.transmission}</span>
                  <span className="font-mono">{car.days}d</span>
                  <span>{car.source}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={car.siteStatus}
                  onChange={(e) => {
                    const next = e.target.value as SiteStatus | "";
                    patchStock(car.id, { siteStatus: next, siteSpot: next === "On-site" ? car.siteSpot || "Pitch" : "" });
                  }}
                  className="status-pill h-8 rounded-xl border-0 px-2 text-[11px] font-bold"
                  style={{ background: sitePill.bg, color: sitePill.fg }}
                >
                  <option value="">Not set</option>
                  {SITE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {car.siteStatus === "On-site" && (
                  <select value={car.siteSpot} onChange={(e) => patchStock(car.id, { siteSpot: e.target.value as typeof car.siteSpot })} className="status-pill-spot h-8 rounded-xl border-0 bg-white/10 px-2 text-[11px] text-white">
                    {SITE_SPOT_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
                {car.siteStatus !== "Not arrived yet" && (
                  editingKey === car.id ? (
                    <input
                      autoFocus
                      defaultValue={car.keys}
                      placeholder="Key location"
                      onBlur={(e) => {
                        patchStock(car.id, { keys: e.target.value, missing: e.target.value.trim() === "" });
                        setEditingKey(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-8 w-[140px] rounded-xl border px-2 text-[11px]"
                      style={{ background: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingKey(car.id)}
                      className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: keySet ? "var(--pine-tint)" : "var(--brass-tint)", color: keySet ? "var(--emerald)" : "var(--brass)" }}
                    >
                      <Key size={12} /> {car.keys || "Not set"}
                    </button>
                  )
                )}
                <span className="font-mono text-sm">{gbp(car.price)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
