/**
 * Where staff go from the site header and from /account.
 * "team" is always whoAmI().team, the same check that gates /office and the
 * old "You're on the team" interstitial, so the three cannot drift apart.
 */
export type HeaderAccountLink = { to: "/office" | "/account"; label: "Office" | "Account" };

export function headerAccountLink(team: boolean | undefined): HeaderAccountLink {
  return team ? { to: "/office", label: "Office" } : { to: "/account", label: "Account" };
}

/**
 * True when /account should send a staff member straight to /office (with a
 * replace). This is exactly when the interstitial used to show: staff with no
 * dealer accounts of their own, not asking for a plan or checkout.
 */
export function staffAccountRedirect(input: {
  team: boolean;
  tenantCount: number;
  plan?: string | null;
  checkout?: boolean;
}): boolean {
  return input.team && input.tenantCount === 0 && !input.plan && !input.checkout;
}
