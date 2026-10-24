/** Shared UK date formatting: "27 Oct 2026, 12:33" (en-GB, London time, no seconds). */
const TZ = "Europe/London";

function valid(iso: string | number | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatUkDate(iso: string | number | Date | null | undefined): string {
  const d = valid(iso);
  if (!d) return "";
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })
    .replace("Sept", "Sep");
}

export function formatUkDateTime(iso: string | number | Date | null | undefined): string {
  const d = valid(iso);
  if (!d) return "";
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
  return `${formatUkDate(d)}, ${time}`;
}

/** "YYYY-MM-DDTHH:mm" in the browser's local time to an ISO string. */
export function ukLocalToIso(local: string): string {
  return new Date(local).toISOString();
}
