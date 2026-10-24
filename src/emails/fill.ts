/** Per-recipient placeholder fill for the rendered templates. Pure. */
export type Fill = {
  firstName?: string;
  unsubscribeUrl: string;
  why?: string;
  extra?: Record<string, string>;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillPlaceholders(body: string, f: Fill, kind: "html" | "text"): string {
  const e = kind === "html" ? esc : (s: string) => s;
  const map: Record<string, string> = {
    FIRST_NAME: f.firstName?.trim() || "there",
    WHY_YOU_GOT_THIS: f.why ?? "you signed up for Forecourt updates at forecourt.me and confirmed by email",
    UNSUBSCRIBE_LINK: f.unsubscribeUrl,
    ...f.extra,
  };
  return body.replace(/\[([A-Z0-9_]+)\]/g, (m, k: string) => (k in map ? e(map[k]) : m));
}
