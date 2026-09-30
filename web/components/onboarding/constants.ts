/**
 * First-run vocabulary.
 *
 * The business field list lives in `lib/businessFields.ts` (BUSINESS_FIELDS), shared with
 * the API through `lib/businessFields.json`. Re-exported here for the onboarding screens.
 */
import type { PresenceType } from "./preview";

export { BUSINESS_FIELDS } from "@/lib/businessFields";

/** How customers reach the business, worded for a shop and a service provider alike. */
export const PRESENCE_MODELS: { key: PresenceType; title: string }[] = [
  { key: "brick_and_mortar", title: "מגיעים אלינו" },
  { key: "online_only", title: "רק אונליין" },
  { key: "hybrid", title: "גם וגם" },
];

/** Short labels for the three-way products / services choice on a phone. */
export const MODEL_SHORT: Record<"products" | "services" | "both", string> = {
  products: "מוצרים",
  services: "שירותים",
  both: "גם וגם",
};

/** Generation stages as the API reports them, in order. */
export const GENERATE_STAGES: { key: string; label: string }[] = [
  { key: "usp", label: "מנסחים מה מייחד אתכם" },
  { key: "plan", label: "בונים את תוכנית החודש" },
  { key: "posts", label: "כותבים פוסטים לשבועות 1–2" },
  { key: "posts_late", label: "כותבים פוסטים לשבועות 3–4" },
];
