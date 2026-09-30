/**
 * First-run vocabulary.
 *
 * BUSINESS_TYPES is mirrored in `api/app/services/preview.py` — the public preview
 * guesses one of these so the onboarding select can be prefilled. Keep both in sync.
 */
import type { PresenceType } from "./preview";

export const BUSINESS_TYPES = [
  "מאפייה / קפה / מסעדה",
  "חנות פיזית / קמעונאות",
  "חנות אונליין (אי-קומרס)",
  "שירותים מקצועיים (עו\"ד, רו\"ח, ייעוץ)",
  "קליניקה, יופי ובריאות",
  "סטודיו לאימון / ספורט",
  "עיצוב / אדריכלות / נדל״ן",
  "הדרכות, קורסים וחינוך",
  "תיירות ואירוח",
  "עסק אחר",
];

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
