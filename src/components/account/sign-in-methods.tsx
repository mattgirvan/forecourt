import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getSb } from "@/lib/sb";
import { passkeyAddMessage } from "@/lib/auth/signin-options";
import { useSignInOptions } from "@/lib/auth/use-signin-options";

type PasskeyRow = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

function day(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Passkeys for the signed-in person: add, list, remove.
 *
 * Shown only where a passkey can actually work: the VITE_PASSKEYS build flag
 * on, on forecourt.me, in a browser with WebAuthn, with passkeys switched on
 * for the project. With the flag on but on a preview or localhost it shows a
 * one-line pointer to www.forecourt.me instead. Otherwise it shows nothing.
 *
 * Used on /account (customers and dealers) and in the office's Sign-in &
 * security tab (staff). `embedded` drops the page padding when it sits
 * inside another page's layout.
 */
export function SignInMethods({ embedded = false }: { embedded?: boolean } = {}) {
  const { passkey } = useSignInOptions();
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  // What is in progress: adding waits for the device prompt, removing does not.
  const [busy, setBusy] = useState<null | "adding" | { removing: string }>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSb().auth.passkey.list();
    if (error) {
      setRows([]);
      setNotice("Could not load your passkeys. Refresh to try again.");
      return;
    }
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    if (passkey === "ready") void load();
  }, [passkey, load]);

  if (passkey === "off_domain") {
    return (
      <Section embedded={embedded}>
        <p className="mt-2 text-sm text-muted" data-testid="passkeys-off-domain">
          Passkeys work on www.forecourt.me. Open your account there to add one.
        </p>
      </Section>
    );
  }
  if (passkey !== "ready") return null;

  async function add() {
    setBusy("adding");
    setNotice(null);
    try {
      const { error } = await getSb().auth.registerPasskey();
      if (error) {
        const message = passkeyAddMessage(error);
        if (message) setNotice(message);
        return;
      }
      setNotice("Passkey added. Next time, choose Sign in with a passkey.");
      await load();
    } catch (err) {
      const message = passkeyAddMessage(err as Error);
      if (message) setNotice(message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: PasskeyRow) {
    const label = row.friendly_name || "this passkey";
    if (!window.confirm(`Remove ${label}? You can still sign in with an email code.`)) return;
    setBusy({ removing: row.id });
    setNotice(null);
    try {
      const { error } = await getSb().auth.passkey.delete({ passkeyId: row.id });
      if (error) {
        setNotice(`Could not remove ${label}. Try again.`);
        return;
      }
      setNotice(`Removed ${label}.`);
      await load();
    } catch {
      setNotice(`Could not remove ${label}. Try again.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section embedded={embedded}>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Sign in with Face ID, Touch ID, Windows Hello or your phone instead of waiting for a code.
        Your email code still works.
      </p>
      {rows === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted" data-testid="passkeys-empty">
          No passkeys yet.
        </p>
      ) : (
        <ul
          className="mt-4 divide-y divide-line border-y border-line text-sm"
          data-testid="passkeys-list"
        >
          {rows.map((row) => {
            const name = row.friendly_name || "Passkey";
            const removing = typeof busy === "object" && busy?.removing === row.id;
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-xs text-muted">
                    Added {day(row.created_at) ?? "recently"}
                    {row.last_used_at && day(row.last_used_at)
                      ? `. Last used ${day(row.last_used_at)}`
                      : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={busy !== null}
                  aria-label={`Remove ${name}`}
                  onClick={() => void remove(row)}
                >
                  {removing ? "Removing…" : "Remove"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        type="button"
        variant="secondary"
        className="mt-4"
        disabled={busy !== null}
        onClick={() => void add()}
      >
        {busy === "adding" ? "Waiting for your device…" : "Add a passkey"}
      </Button>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mt-3 min-h-5 text-sm text-muted"
        data-testid="passkeys-notice"
      >
        {notice ?? ""}
      </p>
    </Section>
  );
}

function Section({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  return (
    <section
      className={embedded ? undefined : "mx-auto max-w-6xl px-4 pb-14 sm:px-6"}
      data-testid="passkeys-section"
    >
      <div className="rounded-lg border border-line p-5">
        <h2 className="font-medium">Passkeys</h2>
        {children}
      </div>
    </section>
  );
}
