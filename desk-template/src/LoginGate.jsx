import { useEffect, useState } from "react";
import { tenant, groupMark, applyBrand } from "./tenant";
import { supabase } from "./data/supabase";

export function LoginGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(!supabase);

  useEffect(() => {
    applyBrand();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) return null;
  if (preview || session) return children;

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
