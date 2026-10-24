import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { getSb } from "@/lib/sb";
import { cn } from "@/lib/utils";

/**
 * Shared Office and account shell (redesign slice 1).
 * Desktop: left rail with brand, nav, counts and the profile menu.
 * Mobile (720px and under): sticky top bar and a floating bottom bar.
 * Motion is transform and opacity only, and drops to fades under
 * prefers-reduced-motion (see .fc-* rules in styles.css).
 */

type LinkTarget = {
  to: "/office" | "/account" | "/contact";
  search?: Record<string, unknown>;
  hash?: string;
};

export type ShellNavItem = LinkTarget & {
  key: string;
  label: string;
  /** Short label for the mobile bottom bar. */
  short?: string;
  icon: LucideIcon;
  count?: number;
  /** Amber count or dot. Only when the user has to do something. */
  action?: boolean;
  /** Show in the mobile bottom bar (max 4, "More" is added). */
  bottom?: boolean;
};

export type ShellMenuItem =
  | (LinkTarget & { label: string; onSelect?: never })
  | { label: string; onSelect: () => void; to?: never };

export function AppShell({
  area,
  items,
  active,
  user,
  menu,
  pageKey,
  children,
}: {
  area: "office" | "account";
  items: ShellNavItem[];
  active: string | null;
  user: { name: string; sub: string };
  menu: ShellMenuItem[];
  /** Changes when the page changes, to replay the page in motion. */
  pageKey?: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fullMenu: ShellMenuItem[] = [
    ...menu,
    { label: "Sign out", onSelect: () => void getSb().auth.signOut() },
  ];
  const bottom = items.filter((i) => i.bottom).slice(0, 4);
  const areaLabel = area === "office" ? "Office" : "Account";

  return (
    <div className="fc-app" data-testid="app-shell" data-area={area}>
      <aside className="fc-rail" aria-label={`${areaLabel} navigation`}>
        <Brand sub={areaLabel} />
        <nav className="fc-nav">
          {items.map((i) => (
            <NavLink key={i.key} item={i} on={active === i.key} />
          ))}
        </nav>
        <div className="fc-me-wrap">
          <button
            type="button"
            className="fc-me fc-press"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            data-testid="shell-profile"
          >
            <Avatar name={user.name} />
            <span className="fc-me-text">
              <span className="fc-me-name">{user.name}</span>
              <span className="fc-me-sub">{user.sub}</span>
            </span>
            <MoreHorizontal className="fc-me-dots" aria-hidden />
          </button>
        </div>
      </aside>

      <header className="fc-mtop">
        <Brand sub={areaLabel} />
        <button
          type="button"
          className="fc-mtop-av fc-press"
          aria-label="Profile and more"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Avatar name={user.name} />
        </button>
      </header>

      <main className="fc-main">
        <div key={pageKey ?? active ?? "page"} className="fc-page">
          {children}
        </div>
      </main>

      <nav
        className="fc-bnav"
        aria-label={`${areaLabel} quick navigation`}
        data-testid="shell-bottom-bar"
      >
        {bottom.map((i) => (
          <ShellLink
            key={i.key}
            target={i}
            className={cn("fc-bnav-item fc-press", active === i.key && "is-on")}
            current={active === i.key}
          >
            <span className="fc-bnav-ic">
              <i.icon aria-hidden />
              {i.action ? <span className="fc-bnav-dot" aria-label="Needs you" /> : null}
            </span>
            <span>{i.short ?? i.label}</span>
          </ShellLink>
        ))}
        <button
          type="button"
          className={cn("fc-bnav-item fc-press", menuOpen && "is-on")}
          onClick={() => setMenuOpen(true)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="fc-bnav-ic">
            <MoreHorizontal aria-hidden />
          </span>
          <span>More</span>
        </button>
      </nav>

      <ShellSheet open={menuOpen} onClose={() => setMenuOpen(false)} user={user}>
        {items
          .filter((i) => !bottom.includes(i))
          .map((i) => (
            <ShellLink
              key={i.key}
              target={i}
              className="fc-sheet-item fc-press fc-only-m"
              onClick={() => setMenuOpen(false)}
            >
              {i.label}
            </ShellLink>
          ))}
        {fullMenu.map((m) =>
          m.onSelect ? (
            <button
              key={m.label}
              type="button"
              role="menuitem"
              className="fc-sheet-item fc-press"
              onClick={() => {
                setMenuOpen(false);
                m.onSelect();
              }}
            >
              {m.label}
            </button>
          ) : (
            <ShellLink
              key={m.label}
              role="menuitem"
              target={m}
              className="fc-sheet-item fc-press"
              onClick={() => setMenuOpen(false)}
            >
              {m.label}
            </ShellLink>
          ),
        )}
      </ShellSheet>
    </div>
  );
}

function Brand({ sub }: { sub: string }) {
  return (
    <Link to="/" className="fc-brand" aria-label="Forecourt home">
      <i aria-hidden />
      <span>
        Forecourt
        <small>{sub}</small>
      </span>
    </Link>
  );
}

function NavLink({ item, on }: { item: ShellNavItem; on: boolean }) {
  const Icon = item.icon;
  return (
    <ShellLink target={item} className={cn("fc-nav-item fc-press", on && "is-on")} current={on}>
      <Icon className="fc-nav-ic" aria-hidden />
      <span>{item.label}</span>
      {item.count != null && item.count > 0 ? (
        <span className={cn("fc-count", item.action && "is-action")}>{item.count}</span>
      ) : null}
    </ShellLink>
  );
}

/**
 * Shell links. The router's Link marks any link whose URL matches as
 * aria-current="page", but the account views (Overview, Sites, Change plan)
 * share one URL. So the shell renders a plain link and sets aria-current only
 * on the item it knows is showing (slice 10).
 */
function ShellLink({
  target,
  current = false,
  className,
  role,
  onClick,
  children,
}: {
  target: LinkTarget;
  current?: boolean;
  className?: string;
  role?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const loc = { to: target.to, search: (target.search ?? {}) as never, hash: target.hash };
  const href = router.buildLocation(loc).href;
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    void navigate(loc);
  };
  return (
    <a
      href={href}
      className={className}
      role={role}
      aria-current={current ? "page" : undefined}
      onClick={go}
    >
      {children}
    </a>
  );
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span className="fc-av" aria-hidden>
      {initials}
    </span>
  );
}

/** Solid sheet: slides up on mobile, scales from .98 on desktop. */
function ShellSheet({
  open,
  onClose,
  user,
  children,
}: {
  open: boolean;
  onClose: () => void;
  user: { name: string; sub: string };
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("a,button");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const els = Array.from(panel.current.querySelectorAll<HTMLElement>("a,button")).filter(
          (el) => el.offsetParent,
        );
        if (!els.length) return;
        const a = els[0];
        const z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div
      className={cn("fc-sheet-layer", open ? "is-open" : "is-closing")}
      onAnimationEnd={(e) => {
        if (!open && e.target === panel.current) setMounted(false);
      }}
    >
      <div className="fc-sheet-dim" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className="fc-sheet"
        role="menu"
        aria-labelledby={titleId}
        data-testid="shell-menu"
      >
        <div className="fc-sheet-head">
          <Avatar name={user.name} />
          <span className="fc-me-text">
            <span className="fc-me-name" id={titleId}>
              {user.name}
            </span>
            <span className="fc-me-sub">{user.sub}</span>
          </span>
        </div>
        <div className="fc-sheet-list">{children}</div>
      </div>
    </div>
  );
}
