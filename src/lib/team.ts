export const TEAM_EMAILS = ["hello@forecourt.me", "mattgirvan39@gmail.com"] as const;

export function looksLikeTeam(email?: string | null) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (e.endsWith("@forecourt.me")) return true;
  return (TEAM_EMAILS as readonly string[]).includes(e);
}

export function packageLive(status: string | null | undefined) {
  return status === "trial" || status === "subscribed" || status === "paid" || status === "live";
}

export function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "trial":
      return "60-day trial";
    case "subscribed":
      return "Subscription";
    case "paid":
      return "Paid";
    case "live":
      return "Live";
    case "cancelled":
      return "Cancelled";
    default:
      return "Not started";
  }
}

export function trialDaysLeft(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
