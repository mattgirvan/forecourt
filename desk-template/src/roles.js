/** Keep in step with forecourt/src/lib/roles.ts — this app cannot import the marketing site. */

/** Matt trial seats (Chief + Atlas): sales, management, host, progressor — not admin/accounts. */
export const TRIAL_ROLES = ["sales", "management", "host", "progressor"];

export const ROLES = {
  sales: {
    label: "Sales exec",
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    editStock: true,
    editDeals: true,
    ownBook: true,
  },
  management: {
    label: "Sales manager",
    trial: true,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    editStock: true,
    editDeals: true,
    ownBook: false,
  },
  progressor: {
    label: "Progressor",
    trial: true,
    tabs: ["stock", "locator", "pipeline"],
    gp: false,
    editStock: true,
    editDeals: false,
    ownBook: false,
  },
  host: {
    label: "Host",
    trial: true,
    tabs: ["customer", "locator"],
    gp: false,
    editStock: false,
    editDeals: false,
    ownBook: false,
  },
  admin: {
    label: "Admin",
    trial: false,
    tabs: ["overview", "pipeline"],
    gp: false,
    editStock: false,
    editDeals: false,
    ownBook: false,
  },
  accounts: {
    label: "Accounts",
    trial: false,
    tabs: ["overview"],
    gp: true,
    editStock: false,
    editDeals: false,
    ownBook: false,
  },
  principal: {
    label: "Principal",
    trial: false,
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    editStock: false,
    editDeals: false,
    ownBook: false,
  },
};

export function roleOf(id) {
  const pack = ROLES[id] || ROLES.sales;
  return {
    ...pack,
    edit: Boolean(pack.editStock || pack.editDeals),
  };
}

export function normaliseStaff(staff) {
  if (!Array.isArray(staff) || staff.length === 0) {
    return [{ name: "Preview", email: "", role: "management", site: "Main" }];
  }
  return staff.map((s) =>
    typeof s === "string"
      ? { name: s, email: s, role: "sales", site: "Main" }
      : {
          name: s.name || s.email || "Staff",
          email: s.email || "",
          role: ROLES[s.role] ? s.role : "sales",
          site: s.site || "Main",
          franchise: s.franchise,
        },
  );
}
