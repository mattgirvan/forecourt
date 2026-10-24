/**
 * Supabase side of the launch sequence (service role). Tables are in
 * supabase/newsletter-sequence.sql. Until that SQL is run every call reports
 * "unavailable" and the cron sends nothing (fail safe, never a duplicate).
 */
import type { SequenceStore, Claim } from "./newsletter-sequence.ts";

// Loose shape so tests and the real client both fit.
type Db = { from: (t: string) => any };

/** Called by the confirm link. Insert only: an earlier confirm time is kept. */
export async function recordConfirmed(sb: Db | null, email: string, at: number): Promise<void> {
  if (!sb) return;
  await sb
    .from("newsletter_subscribers")
    .upsert({ email, confirmed_at: new Date(at).toISOString(), source: "confirm" }, { onConflict: "email", ignoreDuplicates: true });
}

const CHUNK = 200;
function chunks<T>(a: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += CHUNK) out.push(a.slice(i, i + CHUNK));
  return out;
}

export function supabaseSequenceStore(sb: Db | null): SequenceStore {
  return {
    async ensureSubscribers(rows) {
      if (!sb) return false;
      try {
        for (const part of chunks(rows)) {
          const { error } = await sb
            .from("newsletter_subscribers")
            .upsert(part.map((r) => ({ ...r, source: "backfill" })), { onConflict: "email", ignoreDuplicates: true });
          if (error) return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    async confirmedAt(emails) {
      if (!sb) return null;
      const out = new Map<string, string>();
      try {
        for (const part of chunks(emails)) {
          const { data, error } = await sb.from("newsletter_subscribers").select("email, confirmed_at").in("email", part);
          if (error) return null;
          for (const r of (data ?? []) as { email: string; confirmed_at: string }[]) out.set(r.email, r.confirmed_at);
        }
        return out;
      } catch {
        return null;
      }
    },
    async stepsHad(emails) {
      if (!sb) return null;
      const out = new Map<string, Set<number>>();
      try {
        for (const part of chunks(emails)) {
          const { data, error } = await sb
            .from("newsletter_sequence_sends")
            .select("email, step, status")
            .in("email", part)
            .in("status", ["sending", "sent"]);
          if (error) return null;
          for (const r of (data ?? []) as { email: string; step: number }[]) {
            const s = out.get(r.email) ?? new Set<number>();
            s.add(r.step);
            out.set(r.email, s);
          }
        }
        return out;
      } catch {
        return null;
      }
    },
    async claim(email, step): Promise<Claim> {
      if (!sb) return "unavailable";
      try {
        const { error } = await sb.from("newsletter_sequence_sends").insert({ email, step, status: "sending" });
        if (!error) return "claimed";
        if (error.code !== "23505") return "unavailable";
        // Row exists. Only a failed one may be taken back, and only by one run.
        const { data, error: e2 } = await sb
          .from("newsletter_sequence_sends")
          .update({ status: "sending", error: "", updated_at: new Date().toISOString() })
          .eq("email", email)
          .eq("step", step)
          .eq("status", "failed")
          .select("email");
        if (e2) return "unavailable";
        return Array.isArray(data) && data.length === 1 ? "claimed" : "duplicate";
      } catch {
        return "unavailable";
      }
    },
    async finish(email, step, patch) {
      if (!sb) return;
      try {
        await sb
          .from("newsletter_sequence_sends")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("email", email)
          .eq("step", step);
      } catch {
        /* best effort; the row stays "sending", which blocks a resend */
      }
    },
  };
}
