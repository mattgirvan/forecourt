/** Keep in step with forecourt/src/lib/roles.ts — this app cannot import the marketing site. */
export const ROLES = {
  sales: {
    label: "Sales exec",
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    edit: true,
    ownBook: true,
  },
  management: {
    label: "Sales manager",
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    edit: true,
    ownBook: false,
  },
  progressor: {
    label: "Progressor",
    tabs: ["stock", "locator", "pipeline"],
    gp: false,
    edit: true,
    ownBook: false,
  },
  host: {
    label: "Host",
    tabs: ["customer", "locator"],
    gp: false,
    edit: false,
    ownBook: false,
  },
  admin: {
    label: "Admin",
    tabs: ["overview", "pipeline"],
    gp: false,
    edit: false,
    ownBook: false,
  },
  accounts: {
    label: "Accounts",
    tabs: ["overview"],
    gp: true,
    edit: false,
    ownBook: false,
  },
  principal: {
    label: "Principal",
    tabs: ["overview", "stock", "locator", "pipeline", "customer", "mind"],
    gp: true,
    edit: false,
    ownBook: false,
  },
};

export function roleOf(id) {
  return ROLES[id] || ROLES.sales;
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
