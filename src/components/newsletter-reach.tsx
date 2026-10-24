import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { NewsletterForm } from "@/components/newsletter-form";
import { cn } from "@/lib/utils";

/**
 * Ways to reach the one newsletter form (newsletter-form.tsx) without nagging.
 * Nothing here opens on page load: the sheet opens only from a tap, and the
 * slim bar waits for a scroll and remembers a dismiss.
 */

export const NEWSLETTER_LINE = "Product news, new features and pricing changes. About one email a month.";

/** Set to false to drop the slim bar everywhere. */
export const SHOW_NEWSLETTER_BAR = true;
const BAR_KEY = "fc-nl-bar-dismissed";

/* ---------- Sheet open state, shared by every trigger ---------- */
let sheetOpen = false;
const listeners = new Set<() => void>();
const setSheet = (v: boolean) => {
  sheetOpen = v;
  listeners.forEach((l) => l());
};
export const openNewsletterSheet = () => setSheet(true);
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Compact block for pages: heading, the shared line, the shared form. */
export function NewsletterBlock({
  id,
  eyebrow = "Forecourt updates",
  title = "Hear when the desk gets better.",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  className?: string;
}) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className={cn("px-4 py-6 sm:px-6", className)}>
      <div className="mx-auto grid max-w-3xl gap-4 rounded-[1.75rem] border border-line bg-surface/90 px-5 py-6 sm:grid-cols-[1fr_1.3fr] sm:items-start sm:px-8">
        <div>
          <p className="text-[13px] font-medium text-muted">{eyebrow}</p>
          <h2 id={hid} className="mt-1 text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{NEWSLETTER_LINE}</p>
        </div>
        <NewsletterForm compact />
      </div>
    </section>
  );
}

/** Nav trigger. Looks like the other nav links. */
export function GetUpdatesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openNewsletterSheet}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-[13px] text-muted transition-transform duration-150 hover:text-fg active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
        className,
      )}
    >
      Get updates
    </button>
  );
}

/** Mounted once in SiteShell. Bottom sheet on phones, small dialog on desktop. */
export function NewsletterSheetHost() {
  const open = useSyncExternalStore(
    subscribe,
    () => sheetOpen,
    () => false,
  );
  return open ? <NewsletterSheet onClose={() => setSheet(false)} /> : null;
}

function NewsletterSheet({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [
        ...(box.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([tabindex="-1"]):not([disabled]), a[href]',
        ) ?? []),
      ].filter((el) => !el.closest("[aria-hidden='true']"));
    box.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const f = focusables();
      if (!f.length) return;
      const a = f[0];
      const z = f[f.length - 1];
      if (!box.current.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="nl-sheet-wrap" data-testid="nl-sheet">
      <div className="nl-sheet-dim" aria-hidden onClick={onClose} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Sign up for Forecourt updates"
        className="nl-sheet border border-line bg-surface text-fg"
      >
        <span className="nl-sheet-grip" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
              Forecourt updates
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{NEWSLETTER_LINE}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4">
          <NewsletterForm compact />
        </div>
      </div>
    </div>
  );
}

/**
 * Optional slim bar. Rendered only after hydration and after the first real
 * scroll, as a fixed overlay, so it never pushes content (no layout shift).
 */
export function NewsletterBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!SHOW_NEWSLETTER_BAR) return;
    try {
      if (localStorage.getItem(BAR_KEY)) return;
    } catch {
      return;
    }
    const onScroll = () => {
      if (window.scrollY > 600) {
        setShow(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(BAR_KEY, "1");
    } catch {
      /* private mode: just hide for now */
    }
    setShow(false);
  };
  return (
    <div className="nl-bar" role="region" aria-label="Forecourt updates" data-testid="nl-bar">
      <div className="nl-bar-inner border border-line bg-surface text-fg">
        <p className="min-w-0 flex-1 px-2 text-[13px] leading-snug text-muted">
          About one email a month on new features and pricing.
        </p>
        <button
          type="button"
          onClick={openNewsletterSheet}
          className="nl-btn cta-amber min-h-11 shrink-0 rounded-full border px-4 text-[14px] font-medium"
        >
          Get updates
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
