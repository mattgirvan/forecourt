import { useEffect, useMemo, useState } from "react";
import { KeyRound, MapPin, TriangleAlert } from "lucide-react";
import { tenant, groupMark, featureOn, applyBrand } from "./tenant";
import { locatorLane, pipelineStages } from "./config/locator";
import { useDesk } from "./data/store";
import { gbp } from "./lib/money";
import { LoginGate } from "./LoginGate";

const ALL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "stock", label: "Stock" },
  { id: "locator", label: "Locator" },
  { id: "pipeline", label: "Pipeline" },
  { id: "customer", label: "Customer" },
  { id: "mind", label: "Keep in mind" },
];

export default function App() {
  return (
    <LoginGate>
      <Desk />
    </LoginGate>
  );
}

function Desk() {
  const boot = useDesk((s) => s.boot);
  const ready = useDesk((s) => s.ready);
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState("staff");
  const tabs = ALL_TABS.filter((t) => featureOn(t.id));
  const mark = groupMark();
  const word = tenant.franchise?.word || "";
  const logo = "/brand/logo.svg";

  useEffect(() => {
    applyBrand();
    boot();
  }, [boot]);

  useEffect(() => {
    if (!tabs.find((t) => t.id === tab)) setTab(tabs[0]?.id || "overview");
  }, [tab, tabs]);

  if (!ready) return null;

  return (
    <div className="shell">
      <div className="orb" />
      <div className="orb orb-2" />
      <header className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span className="mark">
            <img
              src={logo}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement.textContent = mark.slice(0, 1);
              }}
            />
          </span>
          <div>
            <div className="word">
              {mark} <span style={{ color: "rgba(255,255,255,0.35)" }}>+</span> <span>{word}</span>
            </div>
            <div className="eyebrow">
              My order portal · {tenant.sites?.[0] || "Main"}
            </div>
          </div>
        </div>
        <div className="eyebrow">{tenant.domain}</div>
      </header>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); setView("staff"); }} type="button">
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => setView(view === "staff" ? "customer" : "staff")} style={{ marginLeft: "auto" }}>
          {view === "staff" ? "As customer" : "As staff"}
        </button>
      </div>

      <div className="pane">
        {view === "customer" ? (
          <Customer />
        ) : tab === "stock" ? (
          <Stock />
        ) : tab === "locator" ? (
          <Locator />
        ) : tab === "pipeline" ? (
          <Pipeline />
        ) : tab === "mind" ? (
          <Mind />
        ) : (
          <Overview />
        )}
      </div>
    </div>
  );
}

function Overview() {
  const deals = useDesk((s) => s.deals);
  const selectDeal = useDesk((s) => s.selectDeal);
  const toggleMonthEnd = useDesk((s) => s.toggleMonthEnd);
  const live = deals.filter((d) => d.stageIndex < 5);
  const gpSum = live.reduce((a, d) => a + (d.gp ?? 0), 0);
  const leaking = live.filter((d) => d.gp == null || d.gp < 0 || d.missing.length > 0);

  if (!live.length) {
    return (
      <div className="glass empty">
        No live deals yet. Add an order or ingest stock — this rooftop starts empty on purpose.
      </div>
    );
  }

  return (
    <div>
      <div className="stats">
        <div className="glass stat"><span className="eyebrow">Live deals</span><b>{live.length}</b></div>
        <div className="glass stat"><span className="eyebrow">GP on book</span><b>{gbp(gpSum)}</b></div>
        <div className="glass stat"><span className="eyebrow">Month-end</span><b>{live.filter((d) => d.monthEnd).length}</b></div>
        <div className="glass stat"><span className="eyebrow">Leaking</span><b className={leaking.length ? "warn" : ""}>{leaking.length}</b></div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Deal</th><th>Vehicle</th><th>Stage</th><th>GP</th><th>ME</th><th></th>
            </tr>
          </thead>
          <tbody>
            {live.map((d) => (
              <tr key={d.id}>
                <td>
                  <div>{d.customer}</div>
                  <div className="eyebrow">{d.id}</div>
                </td>
                <td>
                  {d.vehicle}
                  <div className="faint">{d.colour}</div>
                </td>
                <td className="muted">{pipelineStages[d.stageIndex]}</td>
                <td className={d.gp == null || d.gp < 0 ? "bad" : ""}>{d.gp == null ? "—" : gbp(d.gp)}</td>
                <td>
                  <button className="ghost" type="button" onClick={() => toggleMonthEnd(d.id)}>
                    {d.monthEnd ? "ME" : "—"}
                  </button>
                </td>
                <td>
                  <button className="ghost" type="button" onClick={() => selectDeal(d.id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stock() {
  const stock = useDesk((s) => s.stock);
  const ingestFile = useDesk((s) => s.ingestFile);
  const [msg, setMsg] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const n = await ingestFile(file);
    setMsg(`${n} rows upserted by VIN`);
    e.target.value = "";
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="muted">
          {stock.length} units. Ingest is Excel / CSV, upsert by VIN
          {tenant.ingest === "manufacturer" ? " — manufacturer adapter is on." : "."}
        </p>
        <label className="ghost" style={{ display: "inline-flex", alignItems: "center" }}>
          Upload spreadsheet
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
        </label>
      </div>
      {msg && <p className="ok">{msg}</p>}
      {!stock.length && (
        <div className="glass empty" style={{ marginTop: 16 }}>
          No stock. Drop an Excel sheet — columns VIN, Model, Colour, Price, Miles.
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
        {stock.map((car) => (
          <li key={car.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <strong>{car.vehicle}</strong>
              <div className="faint" style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <span>{car.type}</span>
                <span><MapPin size={12} /> {car.site}</span>
                <span><KeyRound size={12} /> {car.keys}</span>
                {car.missing && <span className="bad">Missing</span>}
              </div>
            </div>
            <div>{gbp(car.price)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Locator() {
  const deals = useDesk((s) => s.deals);
  const selectedDealId = useDesk((s) => s.selectedDealId);
  const selectDeal = useDesk((s) => s.selectDeal);
  const setLocator = useDesk((s) => s.setLocator);
  const setGp = useDesk((s) => s.setGp);
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];

  if (!deal) return <div className="glass empty">No deals to locate.</div>;
  const pct = (deal.locatorIndex / (locatorLane.length - 1)) * 100;

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(160px, 200px) 1fr" }}>
      <div>
        {deals.map((d) => (
          <button
            key={d.id}
            type="button"
            className={d.id === deal.id ? "ghost" : ""}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginBottom: 6,
              background: d.id === deal.id ? "rgba(255,255,255,0.1)" : "transparent",
              border: 0,
              color: "inherit",
              padding: "8px 10px",
              borderRadius: 8,
            }}
            onClick={() => selectDeal(d.id)}
          >
            {d.customer}
            <div className="eyebrow">{locatorLane[d.locatorIndex]?.code}</div>
          </button>
        ))}
      </div>
      <div>
        <h2 style={{ margin: 0 }}>{deal.vehicle}</h2>
        <p className="muted">
          {deal.customer} · {deal.colour} · {deal.vin.slice(-7)}
        </p>
        <div className="rail">
          <div className="rail-bar">
            <div className="rail-fill" style={{ width: `${pct}%` }} />
          </div>
          {locatorLane.map((step, i) => (
            <button
              key={step.code}
              type="button"
              onClick={() => setLocator(deal.id, i)}
              style={{ background: "none", border: 0, color: "inherit", paddingTop: 0 }}
            >
              <div className={i <= deal.locatorIndex ? "dot on" : "dot"} />
              <div className="eyebrow">{step.code}</div>
              <div className="faint">{step.label}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "end" }}>
          <label className="faint">
            GP
            <input
              defaultValue={deal.gp ?? ""}
              key={`${deal.id}-${deal.gp}`}
              style={{ display: "block", marginTop: 6, width: 120 }}
              onBlur={(e) => {
                const n = e.target.value.trim();
                setGp(deal.id, n === "" ? null : Number(n));
              }}
            />
          </label>
        </div>
        {deal.missing.length > 0 && (
          <p className="warn" style={{ marginTop: 16 }}>
            <TriangleAlert size={14} /> Still open: {deal.missing.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function Pipeline() {
  const deals = useDesk((s) => s.deals);
  const setStage = useDesk((s) => s.setStage);
  if (!deals.length) return <div className="glass empty">No pipeline yet.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {deals.map((d) => (
        <div key={d.id} className="glass" style={{ padding: 14 }}>
          <div>
            <strong>{d.customer}</strong>
            <div className="faint">{d.vehicle} · {d.customerType} · {d.site}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {pipelineStages.map((stage, i) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStage(d.id, i)}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11,
                  background: i === d.stageIndex ? "var(--accent)" : "rgba(255,255,255,0.06)",
                  color: i === d.stageIndex ? "var(--accent-ink)" : "var(--dim)",
                }}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Customer() {
  const deals = useDesk((s) => s.deals);
  const selectedDealId = useDesk((s) => s.selectedDealId);
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
  if (!deal) return <div className="glass empty">No customer order to show.</div>;
  const step = locatorLane[deal.locatorIndex];
  const pct = ((deal.locatorIndex + 1) / locatorLane.length) * 100;
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="eyebrow">Your order · {tenant.name}</div>
      <h2 style={{ margin: "6px 0" }}>{deal.vehicle}</h2>
      <p className="muted">{deal.colour}</p>
      <div className="glass" style={{ padding: 16, marginTop: 16 }}>
        <div className="eyebrow">Where it is</div>
        <div style={{ fontSize: 18, marginTop: 4 }}>{step?.label}</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 99, marginTop: 12 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 99 }} />
        </div>
      </div>
    </div>
  );
}

function Mind() {
  const briefs = useDesk((s) => s.briefs);
  const stock = useDesk((s) => s.stock);
  const matches = useMemo(
    () =>
      briefs.map((b) => ({
        brief: b,
        hits: stock.filter((car) => car.price <= b.maxPrice),
      })),
    [briefs, stock],
  );
  if (!briefs.length) {
    return (
      <div className="glass empty">
        No saved briefs. This is Keep in mind — scan live stock against a customer want.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {matches.map(({ brief, hits }) => (
        <div key={brief.id} className="glass" style={{ padding: 14 }}>
          <strong>{brief.name}</strong>
          <div className="faint">{brief.want} · ≤ {gbp(brief.maxPrice)}</div>
          {hits.slice(0, 3).map((h) => (
            <div key={h.id} className="muted" style={{ marginTop: 6 }}>
              {h.vehicle} · {gbp(h.price)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

