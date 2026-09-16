import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { rooftopSearch } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";

function DeskFooterLink() {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  return (
    <Link to="/demo" search={rooftopSearch({ company, brandId, site })} className="hover:text-fg">
      Desk
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Mark className="size-5" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Forecourt
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted">
            The dealer operating system you already run — packaged for others.
            Working name. Swap the wordmark per buyer.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <Link to="/how" className="hover:text-fg">
            How it ships
          </Link>
          <DeskFooterLink />
          <Link to="/pricing" className="hover:text-fg">
            Commercial
          </Link>
          <Link to="/pilot" className="hover:text-fg">
            Pilot
          </Link>
          <span>Confidential · Sep 2026</span>
        </div>
      </div>
    </footer>
  );
}
