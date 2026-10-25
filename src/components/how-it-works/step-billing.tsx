import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { Chip, REDUCED_MQ, StepCopy, StepTrack } from "./kit";
import { cn } from "@/lib/utils";

type Inv = { date: string; what: string; total: string; net: string; vat: string; no: string };
const ROWS: Inv[] = [
  { date: "1 Nov 2026", what: "Site plan, Nov 2026", total: "£399.00", net: "£332.50", vat: "£66.50", no: "FC-10482" },
  { date: "1 Oct 2026", what: "Site plan, Oct 2026", total: "£399.00", net: "£332.50", vat: "£66.50", no: "FC-10371" },
  { date: "1 Sep 2026", what: "Site plan, Sep 2026", total: "£399.00", net: "£332.50", vat: "£66.50", no: "FC-10259" },
  { date: "14 Aug 2026", what: "Setup", total: "£4,500.00", net: "£3,750.00", vat: "£750.00", no: "FC-10144" },
];

type Doc = Document & { startViewTransition?: (cb: () => void) => unknown };

export function StepBilling() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [ripple, setRipple] = useState(0);

  // Play-on-view stagger (phones, reduced motion, and browsers without scroll timelines).
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia(REDUCED_MQ).matches) return setSeen(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = (i: number | null) => {
    const d = document as Doc;
    if (d.startViewTransition && !window.matchMedia(REDUCED_MQ).matches) {
      d.startViewTransition(() => flushSync(() => setOpen(i)));
    } else setOpen(i);
  };

  const inv = open === null ? null : ROWS[open];

  return (
    <StepTrack n={5} kind="c">
      <div className="hiw-c">
        <StepCopy n={5} title="Every bill, in one place." line="Plan, invoices and receipts sit in your account. Tap a row to see the breakdown, or grab the PDF." />
        <div ref={cardRef} className={cn("hiw-card hiw-bill", seen && "is-seen")}>
          <div className="hiw-card-head">
            <div>
              <div className="hiw-card-kicker">Billing</div>
              <div className="hiw-card-title">Site, £399 a month inc. VAT</div>
            </div>
            <span className="hiw-tag">Example dealer</span>
          </div>
          <div className="hiw-bill-body">
            <ul className={cn("hiw-bill-list", inv && "is-away")} aria-hidden={inv ? true : undefined}>
              {ROWS.map((r, i) => (
                <li key={r.no} className="hiw-bill-row" style={{ "--i": i } as React.CSSProperties}>
                  <button
                    type="button"
                    className="hiw-bill-open"
                    tabIndex={inv ? -1 : 0}
                    onClick={() => go(i)}
                    style={{ viewTransitionName: open === null ? `hiw-inv-${i}` : undefined } as React.CSSProperties}
                  >
                    <span className="hiw-row-title">{r.date}</span>
                    <span className="hiw-row-sub">{r.what}</span>
                    <span className="hiw-bill-amt">{r.total}</span>
                    <Chip tone="done">
                      <Check size={12} strokeWidth={3} /> Paid
                    </Chip>
                  </button>
                  <button
                    type="button"
                    className="hiw-pdf"
                    tabIndex={inv ? -1 : 0}
                    aria-label={`Download PDF for ${r.date}`}
                    onClick={() => setRipple((n) => n + 1)}
                  >
                    <FileText size={17} />
                    <span key={ripple} className="hiw-ripple" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div
              className={cn("hiw-bill-detail", inv && "is-in")}
              aria-hidden={inv ? undefined : true}
              style={{ viewTransitionName: open !== null ? `hiw-inv-${open}` : undefined } as React.CSSProperties}
            >
              {inv && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="hiw-card-kicker">Invoice {inv.no}</div>
                      <div className="hiw-row-title">{inv.what}, {inv.date}</div>
                    </div>
                    <Chip tone="done">
                      <Check size={12} strokeWidth={3} /> Paid
                    </Chip>
                  </div>
                  <dl className="hiw-bill-sum">
                    <dt>Subtotal</dt>
                    <dd>{inv.net}</dd>
                    <dt>VAT at 20%</dt>
                    <dd>{inv.vat}</dd>
                    <dt className="is-total">Total inc. VAT</dt>
                    <dd className="is-total">{inv.total}</dd>
                  </dl>
                  <button type="button" className="hiw-btn" data-tone="quiet" onClick={() => go(null)}>
                    <ArrowLeft size={15} /> Back
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="hiw-note">All prices inc. VAT.</p>
        </div>
      </div>
    </StepTrack>
  );
}
