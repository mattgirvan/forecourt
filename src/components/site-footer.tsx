import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { deskSearch } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);

  return (
    <footer className="px-4 pb-10 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 rounded-[2rem] border border-line bg-surface px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <div className="flex items-center gap-2">
            <Mark className="size-5" />
            <span className="text-sm font-medium">Forecourt</span>
          </div>
          <p className="mt-2 text-sm text-muted">The screen on the sales desk.</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          <Link to="/" className="hover:text-fg">
            Product
          </Link>
          <Link to="/demo" search={deskSearch({ company, brandId, site })} className="hover:text-fg">
            Try it
          </Link>
          <Link to="/how" className="hover:text-fg">
            How it works
          </Link>
          <Link to="/pricing" className="hover:text-fg">
            Pricing
          </Link>
          <a href={`mailto:${SITE.email}`} className="hover:text-fg">
            {SITE.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
