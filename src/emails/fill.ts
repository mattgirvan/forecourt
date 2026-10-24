/** Fill {{MERGE_TAGS}} in a rendered template. Pure. */
export type Fill = {
  unsubscribeUrl: string;
  /** Editorial slots for the monthly template, e.g. { MONTH: "November" }. */
  extra?: Record<string, string>;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillPlaceholders(body: string, f: Fill, kind: "html" | "text"): string {
  const e = kind === "html" ? esc : (s: string) => s;
  const map: Record<string, string> = { UNSUBSCRIBE_URL: f.unsubscribeUrl, ...f.extra };
  return body.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k: string) => (k in map ? e(map[k]) : m));
}

/** Tags still unfilled. A send must refuse when this is not empty. */
export function unfilled(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{([A-Z0-9_]+)\}\}|\[([A-Z][A-Z0-9_]+)\]/g)].map((m) => m[1] ?? m[2]))];
}
