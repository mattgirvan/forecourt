import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/**
 * Solid confirm sheet, in place of the browser confirm box. Call askConfirm() from any
 * handler and await the answer; <ConfirmHost /> (mounted once in the root)
 * draws it. A bottom sheet under 720px, a centred card above. Focus is trapped
 * inside, Escape or a tap outside cancels, and focus goes back to where it was.
 */
export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for things that are hard to undo (refund, end, remove). */
  tone?: "action" | "danger" | "neutral";
};

type Pending = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

let current: Pending | null = null;
let seq = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  // No host (server render, unit tests): never act without an answer.
  if (typeof window === "undefined" || hosts === 0) return Promise.resolve(false);
  current?.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...opts, id: ++seq, resolve };
    emit();
  });
}

function answer(ok: boolean) {
  const p = current;
  current = null;
  emit();
  p?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const pending = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
    };
  }, []);
  return pending ? <ConfirmSheet key={pending.id} p={pending} /> : null;
}

function ConfirmSheet({ p }: { p: Pending }) {
  const box = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [titleId] = useState(() => `fc-confirm-${p.id}`);
  const danger = p.tone === "danger";

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Hard to undo: start on Cancel. Otherwise start on the main action.
    // A frame later, so a closing menu cannot pull focus back to its trigger.
    const first = () => (danger ? cancelRef.current : confirmRef.current)?.focus();
    first();
    const raf = requestAnimationFrame(() => requestAnimationFrame(first));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        answer(false);
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!f.length) return;
      const a = f[0];
      const z = f[f.length - 1];
      if (!box.current.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [danger]);

  return (
    <div className="fc-confirm-wrap" data-testid="confirm-sheet-wrap">
      <div className="fc-confirm-dim" aria-hidden onClick={() => answer(false)} />
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fc-confirm-sheet"
        data-testid="confirm-sheet"
      >
        <span className="fc-confirm-grip" aria-hidden />
        <h2 id={titleId} className="text-[17px] font-semibold text-fg">
          {p.title}
        </h2>
        {p.body ? (
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--fc-text-dim)]">{p.body}</p>
        ) : null}
        <div className="fc-confirm-actions">
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : p.tone === "neutral" ? "default" : "action"}
            onClick={() => answer(true)}
            data-testid="confirm-yes"
          >
            {p.confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            variant="ghost"
            onClick={() => answer(false)}
            data-testid="confirm-no"
          >
            {p.cancelLabel ?? "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
