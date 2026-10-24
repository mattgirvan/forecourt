/** Shared rules for collapsible sections, kept pure so they can be unit tested. */
export const COLLAPSE_MOBILE_MAX = 767;

export function collapseKey(id: string): string {
  return `fc-collapse:${id}`;
}

/** Stored choice wins. Otherwise collapsed under 768px, open on desktop. */
export function initialOpen(stored: string | null | undefined, viewportWidth: number | undefined): boolean {
  if (stored === "open") return true;
  if (stored === "closed") return false;
  if (viewportWidth == null) return true;
  return viewportWidth > COLLAPSE_MOBILE_MAX;
}

export function storedValue(open: boolean): "open" | "closed" {
  return open ? "open" : "closed";
}

/** Header label, for example "History (12)". */
export function collapseLabel(title: string, count?: number | null): string {
  return count == null ? title : `${title} (${count})`;
}
