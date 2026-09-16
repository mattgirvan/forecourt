export function gbp(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}£${Math.abs(n).toLocaleString("en-GB")}`;
}
