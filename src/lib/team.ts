export const TEAM_EMAILS = ["hello@forecourt.me"] as const;

export type StaffRole = "owner" | "operator";
export type StaffStatus = "active" | "invited" | "revoked";

export const STAFF_ROLES: { id: StaffRole; label: string; sees: string }[] = [
  { id: "owner", label: "Owner", sees: "Customers, billing, files, and who is on staff." },
  { id: "operator", label: "Operator", sees: "Customers, billing, and files. Cannot add or revoke staff." },
];

/** The one address that becomes owner on its own, once its email is confirmed. */
export const OWNER_EMAIL = "hello@forecourt.me";

/**
 * True for any @forecourt.me address. Only used to avoid sending customer
 * emails to our own addresses. NEVER use it to grant access: anyone can sign
 * up with an @forecourt.me address.
 */
export function onForecourtDomain(email?: string | null) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return e.endsWith("@forecourt.me");
}

export type TeamMemberRow = { status?: string | null; role?: string | null; name?: string | null };

export type TeamAccess = {
  team: boolean;
  role: StaffRole | null;
  /** True only for a confirmed hello@forecourt.me with no team_members row yet: the server may create its owner row. */
  seedOwner: boolean;
};

/**
 * Who is staff. The email domain is never trusted:
 * - hello@forecourt.me counts only once its email is confirmed;
 * - a team_members row decides (invited or active is staff, revoked is not);
 * - with no row, only hello@forecourt.me is owner;
 * - anyone else is not staff.
 */
export function teamAccess(input: { email: string | null | undefined; emailConfirmed: boolean; member: TeamMemberRow | null | undefined }): TeamAccess {
  const email = (input.email ?? "").trim().toLowerCase();
  const m = input.member;
  if (email === OWNER_EMAIL && !input.emailConfirmed) return { team: false, role: null, seedOwner: false };
  if (m) {
    if (m.status === "active" || m.status === "invited") {
      return { team: true, role: m.role === "owner" ? "owner" : "operator", seedOwner: false };
    }
    return { team: false, role: null, seedOwner: false };
  }
  if (email === OWNER_EMAIL) return { team: true, role: "owner", seedOwner: true };
  return { team: false, role: null, seedOwner: false };
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
