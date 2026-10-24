import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function times(): string[] {
  const out: string[] = [];
  for (let h = 7; h <= 20; h++) for (const m of [0, 15, 30, 45]) out.push(`${pad(h)}:${pad(m)}`);
  return out;
}

/**
 * Date and time picker that always reads in UK order (day, month, year, 24 hour time),
 * whatever the browser locale. Plain selects, so iOS shows its own wheel for each part.
 * Value is "YYYY-MM-DDTHH:mm" in local time, or "" until every part is picked.
 */
export function UkDateTimePicker({
  value,
  onChange,
  className,
  label = "Call",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(value);
  const year = new Date().getFullYear();
  const parts = { y: m?.[1] ?? "", mo: m?.[2] ?? "", d: m?.[3] ?? "", t: m?.[4] ?? "" };
  const set = (k: keyof typeof parts, v: string) => {
    const n = { ...parts, [k]: v };
    if (!n.y) n.y = String(year);
    if (!n.t) n.t = "10:00";
    if (!n.mo) n.mo = pad(new Date().getMonth() + 1);
    if (!n.d) n.d = pad(new Date().getDate());
    const last = new Date(Number(n.y), Number(n.mo), 0).getDate();
    if (Number(n.d) > last) n.d = pad(last);
    onChange(`${n.y}-${n.mo}-${n.d}T${n.t}`);
  };
  const sel = cn(className, "min-h-11");
  return (
    <fieldset
      className="grid grid-cols-[1fr_1.2fr_1.3fr] gap-2"
      lang="en-GB"
    >
      <legend className="sr-only">{label} date and time</legend>
      <select
        aria-label={`${label} day`}
        className={sel}
        value={parts.d}
        onChange={(e) => set("d", e.target.value)}
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => pad(i + 1)).map((d) => (
          <option key={d} value={d}>
            {Number(d)}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} month`}
        className={sel}
        value={parts.mo}
        onChange={(e) => set("mo", e.target.value)}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={pad(i + 1)}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} year`}
        className={sel}
        value={parts.y}
        onChange={(e) => set("y", e.target.value)}
      >
        <option value="">Year</option>
        {[year, year + 1].map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} time`}
        className={cn(sel, "col-span-3")}
        value={parts.t}
        onChange={(e) => set("t", e.target.value)}
      >
        <option value="">Time</option>
        {times().map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </fieldset>
  );
}
