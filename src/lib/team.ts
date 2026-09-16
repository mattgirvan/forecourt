export const TEAM_EMAILS = ["hello@forecourt.me"] as const;

export type StaffRole = "owner" | "operator";
export type StaffStatus = "active" | "invited" | "revoked";

export const STAFF_ROLES: { id: StaffRole; label: string; sees: string }[] = [
  { id: "owner", label: "Owner", sees: "Customers, billing, files, and who is on staff." },
  { id: "operator", label: "Operator", sees: "Customers, billing, and files. Cannot add or revoke staff." },
];

export function looksLikeTeam(email?: string | null) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return e.endsWith("@forecourt.me");
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
    case "refunded":
      return "Refunded";
    case "expired":
      return "Trial ended";
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

export function roleLabel(role?: string | null) {
  return role === "owner" ? "Owner" : "Operator";
}
