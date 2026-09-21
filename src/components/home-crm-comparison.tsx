import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

type Row = {
  feature: string;
  crm: boolean;
  forecourt: boolean;
};

/** Locked 13-row CRM vs + Forecourt comparison — do not reorder or drop. */
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
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold leading-none",
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

        {/* Desktop / tablet: three-column table */}
        <Reveal delay={80} className="mt-12 hidden md:block">
          <div className="overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-soft">
            <div className="max-h-[min(70vh,36rem)] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-elevated">
                    <th scope="col" className="px-6 py-4 text-[13px] font-medium text-muted">
                      Feature
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-4 text-center text-[13px] font-medium text-muted"
                    >
                      CRM alone
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-4 text-center text-[13px] font-semibold text-[#0a0b0a]"
                      style={{ backgroundColor: "#D9A24B" }}
                    >
                      + Forecourt
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
                        className="px-6 py-[15px] text-[15px] font-medium text-fg"
                      >
                        {row.feature}
                      </th>
                      <td className="px-4 py-[15px] text-center">
                        <span className="inline-flex justify-center">
                          <Mark ok={row.crm} label="CRM alone" />
                        </span>
                      </td>
                      <td className="px-4 py-[15px] text-center">
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

        {/* Mobile: card stack */}
        <Reveal delay={80} className="mt-10 space-y-3 md:hidden">
          <div className="flex items-center justify-center gap-4 text-[12px] font-medium text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted" aria-hidden />
              CRM alone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#D9A24B]" aria-hidden />
              + Forecourt
            </span>
          </div>
          {ROWS.map((row) => (
            <article
              key={row.feature}
              className="rounded-2xl border border-line bg-surface px-5 py-4"
            >
              <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                {row.feature}
              </h3>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span>CRM alone</span>
                  <Mark ok={row.crm} label="CRM alone" />
                </div>
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span className="font-medium text-[#D9A24B]">+ Forecourt</span>
                  <Mark ok={row.forecourt} label="+ Forecourt" />
                </div>
              </div>
            </article>
          ))}
        </Reveal>

        <Reveal delay={140} className="mt-10 text-center">
          <p className="text-[13px] font-medium text-muted">
            Beside your CRM — not instead of it.
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
