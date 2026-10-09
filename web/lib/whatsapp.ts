/**
 * The WhatsApp tracked link (api/app/routers/whatsapp.py).
 *
 * Kept out of lib/api.ts on purpose: it is one self-contained feature with its own demo
 * fixture, and the big client file is shared by every screen.
 *
 * What is measured, in the words the UI uses: taps on the link, per source. Not whether a
 * message was sent, and not whether anyone bought. The code in the message ("(קוד: IG-BIO)")
 * is what shows the source inside the chat, when a chat does start.
 */
import { ApiError, api, isDemo } from "@/lib/api";

export type WhatsappLink = {
  code: string;
  source_key: string;
  label_he: string;
  /** The code the customer's message carries, e.g. "IG-BIO", "IG-POST-3". */
  tag: string;
  url: string;
  clicks_7d?: number;
  clicks_total?: number;
};

export type WhatsappPayload = {
  number_e164: string | null;
  number_display: string;
  /** A number we already saw for the business (its links or its site). Never saved on its own. */
  suggested_number: string;
  default_text_he: string;
  /** What the message starts with when no default text was written. */
  default_text_fallback_he: string;
  public_base_url: string;
  links: WhatsappLink[];
  /** Taps per coarse device bucket, all time: instagram | facebook | ios | android | desktop | other. */
  clicks_by_family: Record<string, number>;
  clicks_7d: number;
  clicks_total: number;
};

export type WhatsappPostLink = {
  number_set: boolean;
  cta_is_whatsapp: boolean;
  link: WhatsappLink | null;
};

/** The fixed sources, in the order the card shows them. */
export const FIXED_SOURCES = ["default", "ig-bio", "story", "gbp"] as const;

/** Where each fixed link goes, one short line under its label. */
export const SOURCE_HINT_HE: Record<string, string> = {
  default: "לכל מקום אחר: חתימה, פלאייר, הודעה",
  "ig-bio": "בקישור שבפרופיל האינסטגרם",
  story: "במדבקת קישור בסטורי",
  gbp: "בכפתור האתר או הצ׳אט בכרטיס בגוגל",
};

export const FAMILY_HE: Record<string, string> = {
  instagram: "מתוך אינסטגרם",
  facebook: "מתוך פייסבוק",
  ios: "אייפון",
  android: "אנדרואיד",
  desktop: "מחשב",
  other: "אחר",
};

/* ------------------------------------ demo ------------------------------------ */

const DEMO_BASE = "https://isramarket.co.il";

function demoSeed(): WhatsappPayload {
  const links: WhatsappLink[] = [
    { code: "Tm7bQ2x", source_key: "default", label_he: "הקישור הכללי", tag: "WA", url: "", clicks_7d: 3, clicks_total: 11 },
    { code: "Hk3LpW9", source_key: "ig-bio", label_he: "הביו באינסטגרם", tag: "IG-BIO", url: "", clicks_7d: 14, clicks_total: 41 },
    { code: "r8ZcN4v", source_key: "story", label_he: "סטורי", tag: "STORY", url: "", clicks_7d: 6, clicks_total: 9 },
    { code: "Qe2sJ7d", source_key: "gbp", label_he: "הכרטיס של העסק בגוגל", tag: "GOOGLE", url: "", clicks_7d: 2, clicks_total: 5 },
    {
      code: "Wb5yF1m",
      source_key: "ig-post-202609-2",
      label_he: "פוסט 2 באינסטגרם: חלות לשבת, מהתנור ב-07:00",
      tag: "IG-POST-2",
      url: "",
      clicks_7d: 9,
      clicks_total: 9,
    },
  ].map((link) => ({ ...link, url: `${DEMO_BASE}/r/${link.code}` }));
  return {
    number_e164: "+972501234567",
    number_display: "050-1234567",
    suggested_number: "",
    default_text_he: "היי, אשמח להזמין חלות לשישי",
    default_text_fallback_he: "היי, אשמח לפרטים",
    public_base_url: DEMO_BASE,
    links,
    clicks_by_family: { instagram: 48, ios: 14, android: 9, desktop: 4 },
    clicks_7d: links.reduce((sum, link) => sum + (link.clicks_7d || 0), 0),
    clicks_total: links.reduce((sum, link) => sum + (link.clicks_total || 0), 0),
  };
}

let DEMO: WhatsappPayload = demoSeed();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A light client-side copy of the server's rule, for the demo only. */
function demoNormalize(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let national = digits.startsWith("00972") ? digits.slice(5) : digits.startsWith("972") ? digits.slice(3) : digits;
  national = national.replace(/^0+/, "");
  if (/^[57]\d{8}$/.test(national) || /^[23489]\d{7}$/.test(national)) return `+972${national}`;
  throw new ApiError("המספר לא נראה כמו מספר ישראלי. כתבו אותו כך: 050-1234567, או ‎+972501234567.", 422);
}

/* ---------------------------------- endpoints ---------------------------------- */

export const whatsappEndpoints = {
  get: async (): Promise<WhatsappPayload> => {
    if (isDemo()) return clone(DEMO);
    return api<WhatsappPayload>("/whatsapp/link");
  },
  /** Save the number (validated server-side; a Hebrew 422 when it is not Israeli) and the
   *  default text. The fixed links are created on the first save. `""` clears the number. */
  save: async (body: { number: string; default_text_he?: string }): Promise<WhatsappPayload> => {
    if (isDemo()) {
      if (body.number.trim()) {
        const e164 = demoNormalize(body.number);
        DEMO.number_e164 = e164;
        const national = `0${e164.slice(4)}`;
        DEMO.number_display = national.length === 10 ? `${national.slice(0, 3)}-${national.slice(3)}` : `${national.slice(0, 2)}-${national.slice(2)}`;
      } else {
        DEMO = { ...demoSeed(), number_e164: null, number_display: "" };
      }
      if (body.default_text_he !== undefined) DEMO.default_text_he = body.default_text_he.trim();
      return clone(DEMO);
    }
    return api<WhatsappPayload>("/whatsapp/link", { method: "PUT", body: JSON.stringify(body) });
  },
  /** One link per source, created on first use. */
  source: async (source_key: string, label_he?: string): Promise<{ link: WhatsappLink }> => {
    if (isDemo()) {
      const found = DEMO.links.find((link) => link.source_key === source_key);
      if (found) return { link: clone(found) };
      throw new ApiError("בדמו אי אפשר ליצור קישורים חדשים.", 400);
    }
    return api<{ link: WhatsappLink }>("/whatsapp/link/source", {
      method: "POST",
      body: JSON.stringify({ source_key, label_he }),
    });
  },
  /** The post's own link — null, with the reason, when its CTA is not WhatsApp or the
   *  number is not set. */
  forPost: async (index: number, cta = "", postUid = ""): Promise<WhatsappPostLink> => {
    if (isDemo()) {
      const ctaIsWhatsapp = /וואטסאפ|ווטסאפ|whatsapp/i.test(cta);
      const post = DEMO.links.find((link) => link.source_key.startsWith("ig-post-"));
      return {
        number_set: Boolean(DEMO.number_e164),
        cta_is_whatsapp: ctaIsWhatsapp,
        link: ctaIsWhatsapp && post ? clone({ ...post, label_he: `פוסט ${index + 1} באינסטגרם`, tag: `IG-POST-${index + 1}` }) : null,
      };
    }
    return api<WhatsappPostLink>(`/whatsapp/link/post/${index}${postUid ? `?post_uid=${encodeURIComponent(postUid)}` : ""}`);
  },
};
