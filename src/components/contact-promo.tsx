import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";

/**
 * Soft mid-page band for long marketing pages. One per page is enough.
 * Amber CTA matches the desk family without shouting.
 */
export function ContactPromo({
  eyebrow = "Not sure yet",
  title = "Plans can be fuzzy. Tell us what you need.",
  body = "Trial questions, group pricing, something odd about your sites. Send a short note. No desk opens until you are ready.",
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
}) {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14">
      <Reveal>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 rounded-[1.75rem] border border-line bg-surface/90 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-9">
          <div className="max-w-xl">
            <p className="text-[13px] font-medium text-muted">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p>
          </div>
          <div className="shrink-0">
            <Button className="cta-amber rounded-full" asChild>
              <Link to="/contact" hash="form">
                Talk to us <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
