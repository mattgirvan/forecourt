import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export type PhrasePoint = {
  title: string;
  line?: string;
};

export type PhraseLink = {
  to: "/how" | "/pricing" | "/contact" | "/for/beside-crm" | "/for/key-locator" | "/for/photo-status" | "/for/customer-live-track";
  label: string;
};

export type PhrasePageProps = {
  eyebrow: string;
  h1: string;
  lead: string;
  points: readonly PhrasePoint[];
  ctaLabel: string;
  links: readonly PhraseLink[];
};

export function PhrasePage({ eyebrow, h1, lead, points, ctaLabel, links }: PhrasePageProps) {
  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium tracking-wide text-muted">{eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {h1}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {lead}
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-3">
          {points.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 60}
              className="rounded-[1.75rem] border border-line bg-surface/80 p-6 backdrop-blur-md sm:p-7"
            >
              <li className="list-none">
                <h2 className="text-xl font-semibold tracking-tight">{p.title}</h2>
                {p.line ? (
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.line}</p>
                ) : null}
              </li>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={points.length * 60 + 80} className="mt-12 flex flex-wrap justify-center gap-3">
          <Button
            className="rounded-full text-[#0a0b0a]"
            style={{ backgroundColor: "#D9A24B" }}
            asChild
          >
            <a href={`${SITE.url}/#showcase`}>
              {ctaLabel} <ArrowRight className="size-4" />
            </a>
          </Button>
        </Reveal>

        <p className="mt-10 text-center text-sm text-muted">
          {links.map((l, i) => (
            <span key={l.to}>
              {i > 0 ? " · " : null}
              <Link to={l.to} className="text-fg underline-offset-4 hover:underline">
                {l.label}
              </Link>
            </span>
          ))}
        </p>

        <p className="mx-auto mt-14 max-w-md text-center text-[11px] leading-relaxed text-subtle">
          Forecourt is a UK motor trade floor product for franchise and group desks. It is not a
          consumer car marketplace.
        </p>
      </section>
    </SiteShell>
  );
}
