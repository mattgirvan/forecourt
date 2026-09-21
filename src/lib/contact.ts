import { z } from "zod";

export const CONTACT_ROLES = [
  { value: "principal", label: "Principal" },
  { value: "sales_manager", label: "Sales manager" },
  { value: "ops", label: "Ops" },
  { value: "other", label: "Other" },
] as const;

export const CONTACT_SITES = [
  { value: "1", label: "1" },
  { value: "2-5", label: "2-5" },
  { value: "6+", label: "6+" },
] as const;

export const CONTACT_TOPICS = [
  { value: "trial", label: "Trial questions" },
  { value: "group_pricing", label: "Group or franchise pricing" },
  { value: "special", label: "Special requirements" },
  { value: "integration", label: "Integration" },
  { value: "other", label: "Something else" },
] as const;

const roleValues = CONTACT_ROLES.map((r) => r.value) as [
  (typeof CONTACT_ROLES)[number]["value"],
  ...(typeof CONTACT_ROLES)[number]["value"][],
];
const sitesValues = CONTACT_SITES.map((r) => r.value) as [
  (typeof CONTACT_SITES)[number]["value"],
  ...(typeof CONTACT_SITES)[number]["value"][],
];
const topicValues = CONTACT_TOPICS.map((r) => r.value) as [
  (typeof CONTACT_TOPICS)[number]["value"],
  ...(typeof CONTACT_TOPICS)[number]["value"][],
];

/** Body accepted by POST /api/contact (honeypot included). */
export const contactBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z
    .string()
    .trim()
    .email("Work email looks off.")
    .max(200)
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length ? v : "")),
  dealership: z.string().trim().min(1, "Dealership / group is required.").max(200),
  role: z.enum(roleValues, { error: "Pick a role." }),
  sites: z.enum(sitesValues, { error: "Pick how many sites." }),
  topic: z.enum(topicValues, { error: "Pick what this is about." }),
  message: z.string().trim().min(1, "Message is required.").max(5000),
  /** Honeypot. Bots that fill it get a silent success. */
  website: z.string().max(200).optional().default(""),
});

export type ContactBody = z.infer<typeof contactBodySchema>;

export function labelForRole(value: string) {
  return CONTACT_ROLES.find((r) => r.value === value)?.label ?? value;
}

export function labelForSites(value: string) {
  return CONTACT_SITES.find((r) => r.value === value)?.label ?? value;
}

export function labelForTopic(value: string) {
  return CONTACT_TOPICS.find((r) => r.value === value)?.label ?? value;
}
