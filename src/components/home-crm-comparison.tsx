import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

type Row = {
  feature: string;
  crm: boolean;
  forecourt: boolean;
};

/** Locked 13-row CRM vs + Forecourt comparison; do not reorder or drop. */
const ROWS: readonly Row[] = [
  { feature: "The stock book", crm: true, forecourt: true },
  { feature: "Detailed stock book", crm: false, forecourt: true },
  { feature: "Deal / order paperwork", crm: true, forecourt: true },
  { feature: "Customer tracks their order live", crm: false, forecourt: true },
  { feature: "Customer sees their to-do list", crm: false, forecourt: true },
  { feature: "Universal smart key locator", crm: false, forecourt: true },
  { feature: "Car photo status", crm: false, forecourt: true },
  { feature: "Staff to-do list for the day", crm: false, forecourt: true },
  { feature: "Daily digests for sales", crm: false, forecourt: true },
  { feature: "Stock tied in with progressor + hosts", crm: false, forecourt: true },
  { feature: "Automatic month-end organisation", crm: false, forecourt: true },
  { feature: "Missed add-on products automation", crm: false, forecourt: true },
  { feature: "Fewer chasing calls / complaints", crm: false, forecourt: true },
] as const;

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none sm:size-7 sm:text-[13px]",
        ok ? "bg-ok/25 text-ok" : "bg-bad/25 text-bad",
      )}
      aria-label={`${label}: ${ok ? "yes" : "no"}`}
    >
      {ok ? "✓" : "✕"}
    </span>
  );
}

export function HomeCrmComparison() {
  return (
    <section
      id="crm-comparison"
      className="bg-bg-2 px-4 py-20 sm:px-6 sm:py-28"
      aria-labelledby="crm-comparison-heading"
    >
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium tracking-wide text-accent">
            What your CRM misses
          </p>
          <h2
            id="crm-comparison-heading"
            className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            Your CRM keeps the book. Forecourt keeps the floor moving.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Same screens you already know. The gaps the floor feels every day.
          </p>
        </Reveal>

        {/* Comparison table: fits one phone viewport; marks fixed-narrow, feature takes rest */}
        <Reveal delay={80} className="mt-12">
          <div className="overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-soft">
            <div className="max-h-[min(70vh,36rem)] overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col />
                  <col className="w-[3.25rem] sm:w-[6.75rem]" />
                  <col className="w-[3.5rem] sm:w-[7.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-elevated">
                    <th
                      scope="col"
                      className="px-2.5 py-3 text-[12px] font-medium text-muted sm:px-6 sm:py-4 sm:text-[13px]"
                    >
                      Feature
                    </th>
                    <th
                      scope="col"
                      className="px-1 py-3 text-center text-[11px] font-medium leading-tight text-muted sm:px-4 sm:py-4 sm:text-[13px]"
                    >
                      <span className="sm:hidden">CRM</span>
                      <span className="hidden sm:inline">CRM alone</span>
                    </th>
                    <th
                      scope="col"
                      className="px-1 py-3 text-center text-[11px] font-semibold leading-tight text-[#0a0b0a] sm:px-4 sm:py-4 sm:text-[13px]"
                      style={{ backgroundColor: "#D9A24B" }}
                    >
                      <span className="sm:hidden">+ FC</span>
                      <span className="hidden sm:inline">+ Forecourt</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={cn(
                        "border-b border-line last:border-b-0",
                        i % 2 === 1 && "bg-bg-2/60",
                      )}
                    >
                      <th
                        scope="row"
                        className="px-2.5 py-2.5 text-left text-[12.5px] font-medium leading-snug text-fg sm:px-6 sm:py-[15px] sm:text-[15px]"
                      >
                        {row.feature}
                      </th>
                      <td className="px-1 py-2.5 text-center sm:px-4 sm:py-[15px]">
                        <span className="inline-flex justify-center">
                          <Mark ok={row.crm} label="CRM alone" />
                        </span>
                      </td>
                      <td className="px-1 py-2.5 text-center sm:px-4 sm:py-[15px]">
                        <span className="inline-flex justify-center">
                          <Mark ok={row.forecourt} label="+ Forecourt" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        <Reveal delay={140} className="mt-10 text-center">
          <p className="text-[13px] font-medium text-muted">
            <Link to="/for/beside-crm" className="underline-offset-4 hover:underline">
              Beside your CRM, not instead of it.
            </Link>
          </p>
          <a
            href="#try"
            className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-[#0a0b0a] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#D9A24B" }}
          >
            Open a desk with your name
            <ArrowRight className="size-4" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
