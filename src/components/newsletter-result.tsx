import { Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";

export type ResultCopy = { eyebrow: string; title: string; body: string };

export function NewsletterResult({ copy }: { copy: ResultCopy }) {
  return (
    <SiteShell>
      <section className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="text-[13px] font-medium text-muted">{copy.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">{copy.body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3 text-[15px]">
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 hover:text-fg">
            Back to Forecourt
          </Link>
          <Link to="/privacy" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 hover:text-fg">
            Privacy notice
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}

export function statusFrom(search: Record<string, unknown>): string {
  return typeof search.status === "string" ? search.status : "invalid";
}
