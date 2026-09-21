import { useEffect, useState } from "react";
import { tenant, groupMark, applyBrand } from "./tenant";
import { supabase } from "./data/supabase";
import { StaffSeatContext, loadStaffSeat } from "./data/staffSession";

/**
 * Magic-link gate. After sign-in, loadStaffSeat prefers staff_me(), then
 * staff_users by email, then staff_role() — provides { mode, seat, email, session }.
 */
export function LoginGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [seatState, setSeatState] = useState({
    mode: supabase ? "loading" : "preview",
    email: null,
    seat: null,
    error: "",
  });
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    applyBrand();
    if (!supabase) {
      setSeatState({ mode: "preview", email: null, seat: null, error: "" });
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function bindSeat(nextSession) {
      setSession(nextSession);
      if (!nextSession) {
        if (!cancelled) {
          setSeatState({ mode: "loading", email: null, seat: null, error: "" });
          setChecking(false);
        }
        return;
      }
      const result = await loadStaffSeat();
      if (cancelled) return;
      setSeatState({
        mode: result.mode,
        email: result.email,
        seat: result.seat,
        error: result.error || "",
      });
      setChecking(false);
    }

    supabase.auth.getSession().then(({ data }) => bindSeat(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setChecking(true);
      bindSeat(s);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking || (supabase && session && seatState.mode === "loading")) return null;

  // No Supabase → preview desk (local template).
  if (!supabase) {
    return (
      <StaffSeatContext.Provider value={{ ...seatState, mode: "preview", session: null }}>
        {children}
      </StaffSeatContext.Provider>
    );
  }

  if (!session) {
    const mark = groupMark();
    const word = tenant.franchise?.word || "";

    async function send(e) {
      e.preventDefault();
      setNotice("");
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setNotice(error ? error.message : "Check your email for the link.");
    }

    return (
      <div className="shell login">
        <div className="orb" />
        <div className="login-card glass">
          <div className="eyebrow">My order portal</div>
          <div className="word" style={{ fontSize: 22, margin: "8px 0 16px" }}>
            {mark} <span style={{ color: "rgba(255,255,255,0.35)" }}>+</span> <span>{word}</span>
          </div>
          <p className="muted">{tenant.name}</p>
          <form onSubmit={send} style={{ marginTop: 20, display: "grid", gap: 10 }}>
            <input
              type="email"
              required
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="cta" type="submit">
              Email me a link
            </button>
          </form>
          {notice && <p className="muted" style={{ marginTop: 12 }}>{notice}</p>}
        </div>
      </div>
    );
  }

  return (
    <StaffSeatContext.Provider value={{ ...seatState, session }}>
      {children}
    </StaffSeatContext.Provider>
  );
}
