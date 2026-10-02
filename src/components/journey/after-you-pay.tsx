import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOOK_PATH, CONTACT_EMAIL, CUSTOMER_STEPS, CUSTOMER_STEP_COUNT, type CustomerStep } from "@/lib/journey";
import { cn } from "@/lib/utils";

/** Secondary "Book a call" button with a small calendar icon. Goes via /book. */
export function BookCallButton({
  className,
  size = "default",
  label = "Book a call",
}: {
  className?: string;
  size?: "default" | "sm" | "lg";
  label?: string;
}) {
  return (
    <Button variant="secondary" size={size} className={cn("rounded-full", className)} asChild>
      <a href={BOOK_PATH} target="_blank" rel="noopener">
        <CalendarDays aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}

type Status = "done" | "now" | "upcoming" | "neutral";

function statusFor(step: CustomerStep, current: number | undefined): Status {
  if (current === undefined) return "neutral";
  if (step.n < current) return "done";
  if (step.n === current) return "now";
  return "upcoming";
}

function Dot({ n, status }: { n: number; status: Status }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        status === "done" && "bg-ok text-[#0a0b0a]",
        status === "now" && "bg-[#d9a24b] text-[#0a0b0a]",
        (status === "upcoming" || status === "neutral") && "border-2 border-[#6a6c66] text-muted",
      )}
    >
      {status === "done" ? "✓" : n}
    </span>
  );
}

/**
 * The six steps after payment. Static, no pinning, no sideways scroll:
 * a vertical list on phones and in side columns, a 3 by 2 grid on wide
 * screens when `layout="grid"`.
 *
 * `current` is the customer step number (1 to 6). Leave it out before payment
 * so every step reads neutral.
 */
export function AfterYouPaySteps({
  current,
  layout = "list",
  className,
}: {
  current?: number;
  layout?: "list" | "grid";
  className?: string;
}) {
  return (
    <ol
      className={cn(
        layout === "grid" ? "grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "min-w-0 space-y-2",
        className,
      )}
    >
      {CUSTOMER_STEPS.map((s) => {
        const status = statusFor(s, current);
        return (
          <li
            key={s.id}
            aria-current={status === "now" ? "step" : undefined}
            className={cn(
              "flex min-w-0 gap-3 rounded-2xl border px-4 py-3",
              status === "now" ? "border-[#d9a24b]/50 bg-[#d9a24b]/10" : "border-line bg-surface",
              status === "done" && "opacity-80",
            )}
          >
            <Dot n={s.n} status={status} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{s.title}</span>
                {status === "now" ? (
                  <span className="rounded-full bg-[#d9a24b] px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#0a0b0a]">
                    Now
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-[12px] text-muted">{s.when}</div>
              {status !== "done" ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.line}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The "After you pay" strip for the homepage #start section and /pricing. */
export function AfterYouPayStrip({ className, primary }: { className?: string; primary?: ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-[1.75rem] border border-line bg-bg/60 p-6 sm:p-8", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-[13px] font-medium text-muted">After you pay</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">What happens next</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Six steps from payment to live. We email you as each one moves, and you can always reply to a real person.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {primary}
          <BookCallButton />
        </div>
      </div>
      <AfterYouPaySteps layout="grid" className="mt-6" />
    </div>
  );
}

/**
 * Before Pay panel on the account page: what happens after you pay, and what
 * today's payment covers. Desktop sits in the side column; on phones the
 * account page shows a one-line summary above Pay and this panel below it.
 */
export function BeforePayPanel({
  className,
  todayLine,
  monthlyLine,
}: {
  className?: string;
  todayLine: string;
  monthlyLine: string | null;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line p-5", className)} aria-labelledby="after-you-pay">
      <p className="text-[13px] font-medium text-muted">After you pay</p>
      <h2 id="after-you-pay" className="mt-1 font-display text-2xl tracking-tight">
        What happens next
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Within a few minutes you get your receipt from Stripe and an email from us with a link to book your kickoff call.
      </p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-2">
          <dt className="text-muted">Today</dt>
          <dd className="text-right">{todayLine}</dd>
        </div>
        {monthlyLine ? (
          <div className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-2">
            <dt className="text-muted">Monthly</dt>
            <dd className="text-right">{monthlyLine}</dd>
          </div>
        ) : null}
      </dl>
      <AfterYouPaySteps className="mt-4" />
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <BookCallButton size="sm" />
        <p className="text-[13px] text-muted">
          Questions first?{" "}
          <a className="text-fg underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </section>
  );
}

/** Where a paid site is now, for the account page. */
export function JourneyNow({ current, className }: { current: number; className?: string }) {
  const step = CUSTOMER_STEPS[Math.max(1, Math.min(current, CUSTOMER_STEP_COUNT)) - 1]!;
  const next = current < CUSTOMER_STEP_COUNT ? CUSTOMER_STEPS[current] : null;
  return (
    <article className={cn("min-w-0 rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8", className)}>
      <p className="text-[13px] font-medium text-muted">
        Step {step.n} of {CUSTOMER_STEP_COUNT}
      </p>
      <h2 className="mt-1 text-3xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{step.line}</p>
      {next ? (
        <p className="mt-3 text-sm">
          <span className="text-muted">Next: </span>
          {next.title} <span className="font-mono text-[12px] text-muted">· {next.when}</span>
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {current <= 2 ? (
          <Button className="cta-amber rounded-full" asChild>
            <a href={BOOK_PATH} target="_blank" rel="noopener">
              Book your kickoff call
            </a>
          </Button>
        ) : null}
        {current > 2 ? <BookCallButton /> : null}
      </div>
      <AfterYouPaySteps current={current} className="mt-6" />
      <p className="mt-4 text-[13px] text-muted">
        We email you as your desk moves on to each step. Questions:{" "}
        <a className="text-fg underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    </article>
  );
}
