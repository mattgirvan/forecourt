import { useEffect, useState } from "react";
import { tenant } from "./tenant";
import { useDesk } from "./data/store";
import { normaliseStaff, roleOf } from "./roles";
import { normaliseSites, seatSiteCodes } from "./data/sites";
import { supabase } from "./data/supabase";
import { loadRestorableSites, loadStaffSites, restoreSite, saveStaffSites } from "./data/siteAccess";

const DAY = 86_400_000;
/** Whole days left to restore, never below 0. */
export function daysLeft(until, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / DAY));
}
/** Without Supabase (preview), archived sites in tenant.json with archivedAt get the same 30 day window. */
function demoArchived(list) {
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && typeof s === "object" && s.status === "archived" && s.archivedAt)
    .map((s) => ({ code: s.code, name: s.name, restoreUntil: new Date(new Date(s.archivedAt).getTime() + 30 * DAY).toISOString() }))
    .filter((s) => daysLeft(s.restoreUntil) > 0);
}

/** Admin tab: choose each person's sites. Staff can be on several sites. */
export function AdminSites({ me }) {
  const access = useDesk((s) => s.siteAccess);
  const sites = (access?.sites || []).length ? access.sites : normaliseSites(tenant.sites).filter((s) => s.status !== "archived");
  const [people, setPeople] = useState(null);
  const [msg, setMsg] = useState("");
  const [archived, setArchived] = useState([]);

  useEffect(() => {
    if (supabase) {
      loadStaffSites().then(setPeople).catch((e) => setMsg(String(e.message || e)));
      loadRestorableSites().then(setArchived).catch(() => setArchived([]));
    } else {
      setArchived(demoArchived(tenant.sites));
      setPeople(
        normaliseStaff(tenant.staff).map((s) => ({ email: s.email, name: s.name, role: s.role, allSites: s.allSites, sites: seatSiteCodes(s) })),
      );
    }
  }, []);

  const update = (email, patch) => setPeople((list) => list.map((p) => (p.email === email ? { ...p, ...patch, dirty: true } : p)));

  async function save(p) {
    setMsg("");
    try {
      if (supabase) await saveStaffSites(p.email, p.sites, p.allSites);
      setPeople((list) => list.map((x) => (x.email === p.email ? { ...x, dirty: false } : x)));
      setMsg(`Saved ${p.name}.`);
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function restore(s) {
    setMsg("");
    try {
      await restoreSite(s.code);
      setArchived((list) => list.filter((x) => x.code !== s.code));
      setMsg(`Restored ${s.name}. Forecourt has been told.`);
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  return (
    <div className="admin-sites" data-testid="admin-sites">
      <div className="eyebrow">Admin</div>
      <h2 style={{ margin: "4px 0 6px" }}>Staff and sites</h2>
      <p className="faint" style={{ marginTop: 0 }}>
        Tick each person's sites. Staff can be on several sites. All sites is unticked by default and covers sites added later. Anyone without it only gets new sites when you tick them.
      </p>
      {msg && <p className="ok">{msg}</p>}
      {!people ? (
        <p className="faint">Loading staff…</p>
      ) : (
        <ul className="admin-list">
          {people.map((p) => {
            const self = me && p.email === me;
            const locked = self || p.role === "principal" || (p.allSites && !access?.allSites);
            return (
              <li key={p.email}>
                <div className="admin-who">
                  <strong>{p.name}</strong>
                  <span className="faint">{roleOf(p.role).label}{p.role === "principal" ? ", sees every site" : ""}{self ? ", that's you" : ""}</span>
                </div>
                <div className="admin-sites-row">
                  <label className={"chip" + (p.allSites ? " on" : "")} title={access?.allSites ? "" : "Only someone with All sites can tick this."}>
                    <input
                      type="checkbox"
                      checked={Boolean(p.allSites)}
                      disabled={locked || !access?.allSites}
                      onChange={(e) => update(p.email, { allSites: e.target.checked })}
                    />
                    All sites
                  </label>
                  {sites.map((s) => {
                    const on = p.sites.some((c) => c.toLowerCase() === s.code.toLowerCase());
                    return (
                      <label key={s.code} className={"chip" + (on ? " on" : "")}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          onChange={(e) =>
                            update(p.email, { sites: e.target.checked ? [...p.sites, s.code] : p.sites.filter((c) => c.toLowerCase() !== s.code.toLowerCase()) })
                          }
                        />
                        {s.name}
                        {s.status === "setting_up" && <span className="faint"> Setting up</span>}
                      </label>
                    );
                  })}
                  <button type="button" className="ghost" disabled={!p.dirty || locked} onClick={() => save(p)}>
                    Save
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {archived.length > 0 && (
        <div data-testid="admin-archived" style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 6px" }}>Archived sites</h3>
          <p className="faint" style={{ marginTop: 0 }}>You can restore an archived site within 30 days.</p>
          <ul className="admin-list">
            {archived.map((s) => (
              <li key={s.code}>
                <div className="admin-who">
                  <strong>{s.name}</strong>
                  <span className="pill-grey" data-testid="archived-pill">
                    Archived, restore within {daysLeft(s.restoreUntil)} {daysLeft(s.restoreUntil) === 1 ? "day" : "days"}
                  </span>
                  <span className="faint">Restore by {new Date(s.restoreUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <button type="button" className="ghost" onClick={() => restore(s)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
