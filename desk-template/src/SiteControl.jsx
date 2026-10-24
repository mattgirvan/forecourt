import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useDesk } from "./data/store";
import { ALL, siteControl } from "./data/sites";

/** Header site control: a fixed label for site staff, a switcher for managers and admins. */
export function SiteControl() {
  const access = useDesk((s) => s.siteAccess);
  const pick = useDesk((s) => s.sitePick);
  const setPick = useDesk((s) => s.setSitePick);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ctl = siteControl(access, pick);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!access) return null;
  if (ctl.kind === "label") {
    return (
      <span className="site-label" data-testid="site-label">
        <span className="site-label-name">{ctl.text}</span>
        <span className="faint site-label-hint">{ctl.hint}</span>
      </span>
    );
  }

  const choose = (code) => {
    setPick(code);
    setOpen(false);
  };
  return (
    <div className="site-switch" ref={ref}>
      <button type="button" className="site-switch-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="site-switcher">
        {ctl.text} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="site-menu" role="listbox">
          <button type="button" role="option" aria-selected={pick === ALL} className={pick === ALL ? "on" : ""} onClick={() => choose(ALL)}>
            <span>{ctl.allLabel}</span>
            <span className="count">{ctl.count}</span>
          </button>
          <div className="site-menu-line" />
          {access.sites.map((s) => (
            <button type="button" role="option" key={s.code} aria-selected={pick === s.code} className={pick === s.code ? "on" : ""} onClick={() => choose(s.code)}>
              <span>{s.name}</span>
              {s.status === "setting_up" && <span className="faint">Setting up</span>}
            </button>
          ))}
          <div className="site-menu-line" />
          <p className="site-menu-foot">{ctl.foot}</p>
        </div>
      )}
    </div>
  );
}
