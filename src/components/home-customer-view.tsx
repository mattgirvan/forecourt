import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CustomerPane } from "@/components/demo/desk";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { BRANDS } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";
import { SHOWCASE_CUSTOMER_STAGES, SHOWCASE_CUSTOMER_STAGE_INDEX } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const highlights = [
  {
    title: "Order progress",
    line: "They see where the car is in the journey, not a status code only the desk can read.",
  },
  {
    title: "Their own to-dos",
    line: "Balance, ID, paperwork. The customer clears what they can without a chasing call.",
  },
  {
    title: "Live status",
    line: "Locator, handover date, what the dealer is still finishing. Fewer switchboard moments.",
  },
] as const;

/**
 * Marketing band: what the buyer sees. Frames the real CustomerPane in a phone bezel.
 * No invented product UI; same cards and labels as the portal customer view.
 */
export function HomeCustomerView({
  id = "customer-view",
  className,
  showPhraseLink = true,
}: {
  id?: string;
  className?: string;
  /** Hide the /for/customer-live-track secondary link when already on that page. */
  showPhraseLink?: boolean;
}) {
  const hydrate = useDemo((s) => s.hydrate);
  const brandId = useDemo((s) => s.brandId);
  const brand = BRANDS[brandId];

  const deals = useDemo((s) => s.deals);
  const pickDeal = useDemo((s) => s.pickDeal);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Shorter Used/Cash journey fits the phone bezel without x-scroll.
    const compact = deals.find((d) => d.type === "Used" && d.customerType === "Cash") ?? deals.find((d) => d.type === "Used");
    if (compact) pickDeal(compact.id);
  }, [deals, pickDeal]);

  return (
    <section
      id={id}
      className={cn("px-4 py-20 sm:px-6 sm:py-28", className)}
      aria-labelledby={`${id}-heading`}
    >
      <div className="mx-auto max-w-5xl">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <Reveal>
            <p className="text-[13px] font-medium tracking-wide text-accent">
              What the customer sees
            </p>
            <h2
              id={`${id}-heading`}
              className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              The big sell is their phone.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              Open the order. See progress, to-dos, and live status. The sales exec stops being a
              switchboard. Sits beside your CRM, not instead of it.
            </p>
            <ul className="mt-8 grid gap-3">
              {highlights.map((h) => (
                <li
                  key={h.title}
                  className="rounded-[1.25rem] border border-line bg-surface/80 px-5 py-4 backdrop-blur-md"
                >
                  <div className="text-[15px] font-semibold tracking-tight">{h.title}</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted">{h.line}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="cta-amber rounded-full" asChild>
                <Link to="/" hash="scene-customer">
                  Watch it update <ArrowRight className="size-4" />
                </Link>
              </Button>
              {showPhraseLink ? (
                <Button variant="secondary" className="rounded-full" asChild>
                  <Link to="/for/customer-live-track">How live track helps</Link>
                </Button>
              ) : (
                <Button variant="secondary" className="rounded-full" asChild>
                  <Link to="/for/beside-crm">Beside your CRM</Link>
                </Button>
              )}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-subtle">
              Built for UK motor trade desks, including Scotland. Same floor product, your name on
              it.
            </p>
          </Reveal>

          <Reveal delay={100} className="flex justify-center lg:justify-end">
            <PhoneFrame accent={brand.accent} glow={brand.glow}>
              <CustomerPane
              hideStaffBar
              stagesOverride={SHOWCASE_CUSTOMER_STAGES}
              stageIndexOverride={SHOWCASE_CUSTOMER_STAGE_INDEX}
            />
            </PhoneFrame>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PhoneFrame({
  children,
  accent,
  glow,
  caption = "Real customer view layout. Sample order, dummy details.",
}: {
  children: ReactNode;
  accent: string;
  glow: string;
  caption?: string;
}) {
  return (
    <div className="relative w-full max-w-[300px] sm:max-w-[320px]">
      <div
        className="absolute -inset-6 rounded-[3rem] opacity-70 blur-3xl"
        style={{ background: glow }}
        aria-hidden
      />
      <div
        className="relative overflow-hidden rounded-[2.35rem] border border-white/15 bg-[#0a0d12] p-[10px] shadow-soft"
        style={{
          boxShadow:
            "0 28px 64px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div className="absolute left-1/2 top-[14px] z-20 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-black/90" aria-hidden />
        <div
          className="desk-shell relative h-[min(62vh,560px)] overflow-hidden rounded-[1.85rem] border-0"
          style={
            {
              "--desk-accent": accent,
              "--desk-glow": glow,
              boxShadow: "none",
            } as CSSProperties
          }
        >
          <div className="desk-orb opacity-60" aria-hidden />
          <div className="customer-phone-scroll relative z-10 h-full overflow-x-hidden overflow-y-auto overscroll-contain pt-8 [&_.mx-auto]:max-w-none [&_.px-5]:px-[14px] [&_.pb-24]:pb-10">
            {children}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-subtle">
        {caption}
      </p>
    </div>
  );
}
