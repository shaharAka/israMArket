/**
 * Fixtures for the 3-month plan (with its numbers and content mix) and the success options. Loaded only in mock mode
 * (`?mock=1` / NEXT_PUBLIC_DRAFT_MOCK=1), by dynamic import from `draft.ts`, so they never
 * ship in the flow a real owner walks. Everything is computed from the answers: a shop with
 * a budget, a bakery with nothing yet and a service business get visibly different plans.
 *
 * Honest like the real thing should be: costs are ranges, results are never promised, and
 * a number we do not have is said to be unknown.
 */
import type { BusinessModel, PlanDirection, PlanInsight } from "./api";
import {
  IL_DATES,
  MONTHS_HE,
  firstOffering,
  inferBusinessModel,
  kitFor,
  type OnboardingDraft,
} from "./draft";
import { mockTargetSuggestion, targetText, type LeverKey } from "./goals";
import {
  KPI_UNITS,
  budgetIls,
  type Cadence,
  type GrowWhere,
  type IntegrationKey,
  type PlanInputs,
  type ContentType,
  type PlanNumbers,
  type QuarterPlan,
  type SuccessOption,
} from "./quarterPlan";

/* ----------------------------- Success options ----------------------------- */

/** The same keys, names and rules as `KPI_OPTIONS` in api/app/services/onboarding_draft.py. */
const OPTIONS: (SuccessOption & { grow: (GrowWhere | null)[] })[] = [
  { key: "online_orders", name_he: "יותר הזמנות באתר", hint_he: "הזמנות שמגיעות דרך האתר", goal: "sales", models: ["products", "both"], grow: ["online", "both", null] },
  { key: "store_visits", name_he: "יותר אנשים בחנות", hint_he: "לקוחות שמגיעים פיזית לעסק", goal: "sales", models: ["products", "both"], grow: ["store", "both", null] },
  { key: "whatsapp_inquiries", name_he: "יותר שיחות ופניות בוואטסאפ", hint_he: "הודעות ושיחות מלקוחות חדשים", models: ["products", "services", "both"], grow: ["online", "store", "both", null] },
  { key: "bookings", name_he: "יותר פגישות והזמנות מקום", hint_he: "תורים, פגישות או שולחנות שנקבעים", models: ["services", "both"], grow: ["online", "store", "both", null] },
  { key: "form_leads", name_he: "יותר טפסים באתר", hint_he: "פניות שמשאירים בטופס באתר", goal: "leads", models: ["services", "both"], grow: ["online", "store", "both", null] },
  { key: "local_awareness", name_he: "שיכירו אותנו באזור", hint_he: "שיותר אנשים באזור ידעו שאתם קיימים", models: ["products", "services", "both"], grow: ["online", "store", "both", null] },
];

export function mockSuccessOptions(model: BusinessModel, grow: GrowWhere | undefined, hasSite: boolean): SuccessOption[] {
  void hasSite;
  const g = model === "services" ? null : (grow ?? null);
  return OPTIONS.filter((o) => o.models?.includes(model) && o.grow.includes(g)).map((o) => {
    const { grow: _grow, models: _models, ...option } = o;
    void _grow;
    void _models;
    return { ...KPI_UNITS[o.key], ...option };
  });
}

/* ------------------------------- The plan ------------------------------- */

const CADENCE_HE: Record<Cadence, string> = { "1-2": "1-2 בשבוע", "3-4": "3-4 בשבוע", "5+": "5 ומעלה בשבוע" };

/**
 * The mock's own coarse buckets. The field says the industry; whether a shop sells in a
 * store or online comes from where the owner wants to grow, not from the field.
 */
type TypeGroup = "food" | "retail" | "ecommerce" | "professional" | "clinic" | "fitness" | "design" | "education" | "tourism" | "other";

function typeGroup(d: OnboardingDraft): TypeGroup {
  const online = d.grow_where === "online" || d.presence_type === "online_only";
  switch (kitFor(d.business_type, d.offerings).key) {
    case "food":
      return "food";
    case "fashion":
    case "jewelry":
    case "kids":
    case "pets":
    case "gifts":
      return online ? "ecommerce" : "retail";
    case "beauty":
    case "health":
      return "clinic";
    case "fitness":
      return "fitness";
    case "home":
    case "real_estate":
      return "design";
    case "professional":
      return "professional";
    case "education":
      return "education";
    case "hospitality":
      return "tourism";
    default:
      return "other";
  }
}

const LOCAL_GROUPS: TypeGroup[] = ["food", "retail", "clinic", "fitness", "design", "professional", "tourism", "education"];

type Channel = QuarterPlan["channels"][number];

function roundTo(n: number, step = 50): number {
  return Math.max(step, Math.round(n / step) * step);
}

function lamed(name: string): string {
  return /^[֐-׿]/.test(name) ? `ל${name}` : `ל־${name}`;
}

/** The first plan month: this one if most of it is still ahead, otherwise the next. */
function planMonths(now = new Date()): { label: string; year: number; month: number }[] {
  const start = now.getDate() > 20 ? 1 : 0;
  return [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + start + i, 1);
    return { label: MONTHS_HE[d.getMonth()], year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

function datesFor(group: TypeGroup, year: number, month: number) {
  const relevant: Record<string, TypeGroup[] | "all"> = {
    "שמחת תורה": "all",
    "יום הרווקים": ["ecommerce", "retail"],
    "בלאק פריידי": ["ecommerce", "retail", "clinic", "fitness"],
    "סייבר מאנדיי": ["ecommerce"],
    חנוכה: "all",
    "סוף השנה האזרחית": ["professional", "design", "ecommerce", "fitness"],
    "ט״ו בשבט": ["food", "retail"],
    פורים: "all",
    פסח: "all",
  };
  const action: Record<string, string> = {
    "שמחת תורה": "סוגרים את החגים ומזכירים שחזרתם לשגרה",
    "יום הרווקים": "מבצע קטן ליום אחד, רק לעוקבים",
    "בלאק פריידי": "מתחילים לספר שבוע לפני, לא ביום עצמו",
    "סייבר מאנדיי": "הזדמנות אחרונה למי שפספס",
    חנוכה: group === "food" ? "סופגניות ומגשים בהזמנה מראש" : "רעיונות למתנות, שבועיים לפני",
    "סוף השנה האזרחית": group === "professional" ? "תזכורת: מה כדאי לסגור לפני סוף השנה" : "סיכום השנה עם לקוחות אמיתיים",
    "ט״ו בשבט": "משהו עונתי ופשוט",
    פורים: "משלוחי מנות ותחפושות",
    פסח: "מזמינים מוקדם, לפני העומס",
  };
  return IL_DATES.filter((d) => {
    const [y, m] = d.date.split("-").map(Number);
    const rel = relevant[d.name];
    return y === year && m === month && (rel === "all" || (rel ?? []).includes(group));
  }).map((d) => ({ date: d.date, name_he: d.name, action_he: action[d.name] ?? "פוסט שמתאים לתאריך" }));
}

export function mockQuarterPlan(
  d: OnboardingDraft,
  direction: PlanDirection,
  inputs: PlanInputs,
  insights: PlanInsight[],
): QuarterPlan {
  const model = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  const group = typeGroup(d);
  const kit = kitFor(d.business_type);
  const offer = firstOffering(d.offerings) || "מה שאתם עושים";
  const hasSite = Boolean(d.links.website);
  const nets = (["instagram", "facebook", "tiktok"] as const).filter((n) => !d.has_none && d.links[n] !== undefined);
  const regular = nets.some((n) => d.activity?.[n] === "regular");
  const local = LOCAL_GROUPS.includes(group) && d.grow_where !== "online";
  const months = planMonths();
  const refOf = (source: string) => {
    const index = insights.findIndex((i) => i.source === source);
    return index >= 0 ? index : undefined;
  };

  const audiences = (d.audiences.length ? d.audiences.map((a) => a.name) : kit.audiences.map((a) => a.name)).slice(0, 3);
  const primary =
    (inputs.primary_audience && audiences.includes(inputs.primary_audience) && inputs.primary_audience) ||
    (audiences.includes(direction.audience) ? direction.audience : audiences[0]);
  const cadence: Cadence = inputs.cadence ?? (regular ? "3-4" : "1-2");

  // The money: an exact figure, the range's middle, or nothing to spend.
  const unknownBudget = !d.budget || d.budget.range === "unknown";
  const monthly = unknownBudget ? null : budgetIls(d.budget);
  const paid = (monthly ?? 0) > 0;

  /* The KPI, from "מה ייחשב הצלחה". */
  const option =
    mockSuccessOptions(model, model === "services" ? undefined : d.grow_where, hasSite).find((o) => o.key === d.success?.kpi) ??
    mockSuccessOptions(model, d.grow_where, hasSite)[0];
  const unit = option.unit_he ?? "פניות";
  const kpiHow: Record<string, string> = {
    online_orders: "כל הזמנה באתר נספרת לפי הערוץ שממנו הגיעה.",
    store_visits: "שואלים בקופה ״איך שמעתם עלינו?״, ומציעים קוד קטן למי שמגיע בזכות פוסט.",
    whatsapp_inquiries: "כל פנייה מפוסט מגיעה עם סימון, ונרשמת עם הפוסט שהביא אותה.",
    bookings: "כל פגישה שנקבעה נרשמת עם המקום שממנו הגיעה הפנייה.",
    form_leads: "כל טופס שמולא באתר נספר לפי הערוץ שממנו הגיעו.",
    local_awareness: "אנשים שראו את הפוסטים ועוקבים חדשים, לפי הנתונים של אינסטגרם.",
  };

  /* Integrations: what the measures need, and whether the owner has it. */
  const integrations: QuarterPlan["integrations"] = [
    {
      key: "whatsapp_link",
      name_he: "קישור וואטסאפ עם סימון",
      why_he: "כל הודעה מפוסט מגיעה עם שם הפוסט, אז יודעים מה הביא אותה.",
      status: "have",
      effort_he: "בלי התקנה. עובד מהיום הראשון.",
    },
  ];
  if (nets.length || d.has_none) {
    integrations.push({
      key: "meta_business",
      name_he: "החשבון העסקי באינסטגרם",
      why_he: "כדי לראות מה כל פוסט הביא: שמירות, שיתופים והודעות.",
      status: "connect",
      effort_he: "בערך 2 דקות, מתוך אינסטגרם.",
    });
  }
  if (hasSite) {
    integrations.push({
      key: "ga4",
      name_he: "נתוני האתר (גוגל אנליטיקס)",
      why_he: "כדי לדעת כמה נכנסו לאתר מהרשתות, ומה עשו שם.",
      status: "connect",
      effort_he: "בערך 5 דקות: מוסיפים אותנו כמשתמש.",
    });
  }
  const metaAds = paid;
  if (hasSite && metaAds && (option.key === "online_orders" || option.key === "form_leads")) {
    integrations.push({
      key: "meta_pixel",
      name_he: "הפיקסל של פייסבוק ואינסטגרם",
      why_he: "כדי שהפרסום ידע מי הזמין, ויחפש עוד אנשים כמוהם.",
      status: "install",
      effort_he: "התקנה אחת באתר, בערך 15 דקות. אפשר לבקש ממי שבנה את האתר.",
    });
    integrations.push({
      key: "gtm",
      name_he: "תגית גוגל באתר",
      why_he: "מקום אחד באתר שדרכו מתקינים את שאר הכלים, בלי לגעת בקוד כל פעם.",
      status: "install",
      effort_he: "פעם אחת, יחד עם הפיקסל.",
    });
  }
  if (hasSite && (group === "ecommerce" || group === "professional" || group === "design")) {
    integrations.push({
      key: "search_console",
      name_he: "החיפושים בגוגל",
      why_he: "כדי לראות על אילו חיפושים מוצאים אתכם בגוגל, ועל אילו עוד לא.",
      status: "connect",
      effort_he: "בערך 5 דקות, דרך חשבון הגוגל של האתר.",
    });
  }
  if (local) {
    integrations.push({
      key: "gbp",
      name_he: "הכרטיס של העסק בגוגל",
      why_he: `כאן מחפשים ״${offer} ליד הבית״. נראה כמה התקשרו וכמה ביקשו הוראות הגעה.`,
      status: "unknown",
      effort_he: "נבדוק אם יש לכם כרטיס. אם לא, פותחים יחד בשעה.",
    });
  }

  const has = (key: IntegrationKey) => integrations.some((i) => i.key === key);
  const kpiNeeds: IntegrationKey[] =
    option.key === "online_orders"
      ? ["ga4", ...(has("meta_pixel") ? (["meta_pixel"] as IntegrationKey[]) : [])]
      : option.key === "form_leads"
        ? ["ga4"]
        : option.key === "local_awareness"
          ? ["meta_business"]
          : option.key === "store_visits"
            ? local
              ? ["gbp", "whatsapp_link"]
              : ["whatsapp_link"]
            : ["whatsapp_link"];
  const measures: QuarterPlan["measures"] = [
    {
      name_he: option.name_he,
      how_he: kpiHow[option.key] ?? "סופרים כל שבוע, מול השבוע הראשון.",
      needs: kpiNeeds.filter(has),
      available_now: kpiNeeds.every((k) => k === "whatsapp_link"),
    },
  ];
  if (option.key !== "whatsapp_inquiries") {
    measures.push({
      name_he: "הודעות וואטסאפ מפוסטים",
      how_he: "סופרים הודעות שהגיעו עם הסימון של פוסט.",
      needs: ["whatsapp_link"],
      available_now: true,
    });
  }
  if (has("meta_business") && option.key !== "local_awareness") {
    measures.push({
      name_he: "שמירות ושיתופים",
      how_he: "שמירה ושיתוף אומרים שהפוסט היה שווה משהו, יותר מלייק.",
      needs: ["meta_business"],
      available_now: false,
    });
  }

  /* Channels: what already exists, and what we open. */
  const channels: Channel[] = [];
  const netName = { instagram: "אינסטגרם", facebook: "פייסבוק", tiktok: "טיקטוק" } as const;
  for (const n of nets) {
    channels.push({
      key: n,
      name_he: netName[n],
      kind: "existing",
      why_he:
        d.activity?.[n] === "regular"
          ? "כבר יש לכם קהל כאן. מחזקים את מה שכבר עובד לפני שפותחים משהו חדש."
          : n === "facebook"
            ? "קבוצות באזור ומי שכבר מכיר אתכם. אותם פוסטים, בלי עבודה נוספת."
            : "יש לכם חשבון, צריך רק קצב קבוע.",
      starts_month: 1,
      effort_he: n === "instagram" ? "הפוסטים שנכין לכם, ואישור שלכם" : "שיתוף של מה שכבר מוכן",
      cadence_he: n === nets[0] ? CADENCE_HE[cadence] : "1 בשבוע",
    });
  }
  if (hasSite) {
    channels.push({
      key: "website",
      name_he: "האתר",
      kind: "existing",
      why_he: model === "services" ? "כאן מחליטים אם לפנות. כל פוסט מוביל אליו או לוואטסאפ." : "כאן קונים. כל פוסט מוביל לעמוד המוצר עצמו.",
      starts_month: 1,
      effort_he: "בלי עבודה חדשה",
    });
  }
  if (!nets.length) {
    channels.push({
      key: "instagram",
      name_he: "אינסטגרם",
      kind: "new",
      why_he: "המקום הכי קל להראות בו את העסק, ושם מחפשים המלצות.",
      starts_month: 1,
      effort_he: "פותחים יחד בחצי שעה, ואז אישור פוסטים",
      cadence_he: CADENCE_HE[cadence],
    });
  }
  if (local) {
    channels.push({
      key: "gbp",
      name_he: "הכרטיס של העסק בגוגל",
      kind: "new",
      why_he: "מי שמחפש בגוגל ליד הבית רואה קודם את הכרטיס. תמונות ושעות עדכניות מביאות שיחות.",
      starts_month: 1,
      effort_he: "שעה אחת להתחלה, ואז 10 דקות בשבוע",
    });
  }
  if (paid) {
    channels.push({
      key: "meta_ads",
      name_he: "פרסום ממומן באינסטגרם ובפייסבוק",
      kind: "new",
      why_he:
        (monthly ?? 0) < 1500
          ? "סכום קטן, למי שכבר מכיר אתכם ולאנשים באזור. מקדמים רק פוסט שכבר הצליח."
          : "מקדמים את מה שהצליח בפוסטים הרגילים, קודם למי שכבר מכיר אתכם ואז לקהל חדש.",
      starts_month: (monthly ?? 0) >= 1000 ? 1 : 2,
      effort_he: "אנחנו מכינים, אתם מאשרים",
    });
  }
  if ((monthly ?? 0) >= 2000 && (group === "ecommerce" || group === "professional" || group === "design" || group === "clinic")) {
    channels.push({
      key: "google_search",
      name_he: "מודעות בחיפוש בגוגל",
      kind: "new",
      why_he: `אנשים כבר מחפשים ${offer}. מופיעים בדיוק ברגע שהם מחפשים.`,
      starts_month: 2,
      effort_he: "הקמה אחת, ואז בדיקה פעם בשבוע",
    });
  }
  if (["food", "retail", "clinic", "fitness", "tourism"].includes(group)) {
    channels.push({
      key: "whatsapp_list",
      name_he: "רשימת תפוצה בוואטסאפ",
      kind: "new",
      why_he: "לקוחות קבועים שמקבלים הודעה אחת בשבוע חוזרים יותר. בלי עלות.",
      starts_month: 2,
      effort_he: "הודעה אחת בשבוע",
    });
  }
  if (group === "ecommerce") {
    channels.push({
      key: "email",
      name_he: "ניוזלטר במייל",
      kind: "new",
      why_he: "מי שכבר הזמין מקבל תזכורת עם מה חדש. הזמנה שנייה עולה פחות מלקוח חדש.",
      starts_month: 3,
      effort_he: "מייל אחד בשבועיים",
    });
  } else if (group === "design" || group === "food" || group === "retail" || group === "professional") {
    channels.push({
      key: "partners",
      name_he: group === "design" ? "שיתופי פעולה עם קבלנים ונגרים" : "שיתופי פעולה עם עסקים באזור",
      kind: "new",
      why_he:
        group === "design"
          ? "הם פוגשים את הלקוחות שלכם לפני שהם מחפשים מעצב. המלצה מהם שווה הרבה."
          : "עסק שכן ממליץ עליכם ללקוחות שלו, ואתם עליו. בלי עלות.",
      starts_month: 3,
      effort_he: "2-3 שיחות בחודש",
    });
  }

  /* Budget: per month, per paid channel, as ranges. */
  const budgetMonths: QuarterPlan["budget"]["months"] = months.map((m, index) => {
    const monthNo = (index + 1) as 1 | 2 | 3;
    const live = channels.filter((c) => (c.key === "meta_ads" || c.key === "google_search") && c.starts_month <= monthNo);
    if (!paid || !live.length) return { month_label: m.label, lines: [] };
    const total = monthly ?? 0;
    const shares: Record<string, number> = live.length === 2 ? { meta_ads: 0.6, google_search: 0.4 } : { [live[0].key]: 1 };
    // Month 1 spends a little less: it is for learning what works before spending more.
    const scale = monthNo === 1 && live.length && channels.some((c) => c.key === "google_search") ? 0.85 : 1;
    return {
      month_label: m.label,
      lines: live.map((c) => {
        const mid = total * shares[c.key] * scale;
        return {
          channel_key: c.key,
          ils_range: [roundTo(mid * 0.85), roundTo(mid * 1.1)] as [number, number],
          note_he:
            c.key === "meta_ads"
              ? monthNo === 1
                ? "קודם למי שכבר מכיר אתכם"
                : "מה שהצליח, לקהל חדש"
              : monthNo === 2
                ? "מתחילים בקטן, על החיפושים הכי קרובים"
                : undefined,
        };
      }),
    };
  });
  const budget: QuarterPlan["budget"] = {
    monthly_ils: monthly,
    months: budgetMonths,
    organic_only: !paid,
    sources_he: paid
      ? [
          "מחירי פרסום באינסטגרם ובפייסבוק בישראל שפורסמו, לפי תחום",
          "מחירי קליק ממוצעים בחיפוש בגוגל בישראל, לתחום שלכם",
          "אלה טווחים לתכנון. לא הבטחה לתוצאה.",
        ]
      : [],
  };
  if (!paid) {
    budget.unlock_he = unknownBudget
      ? "כשתחליטו על סכום, נחלק אותו בין הערוצים. אפשר להוסיף בכל רגע."
      : local
        ? "עם 1,000-1,500 ₪ בחודש אפשר להציג את הפוסטים שהצליחו לאנשים שגרים קרוב אליכם."
        : "עם 1,000-1,500 ₪ בחודש אפשר להציג את הפוסטים שהצליחו גם למי שעוד לא מכיר אתכם.";
  }

  /* Calendar: three months, key dates, when each stream starts, a checkpoint at the end. */
  const newIn = (monthNo: number) =>
    channels.filter((c) => c.kind === "new" && c.starts_month === monthNo).map((c) => c.name_he);
  const calendar: QuarterPlan["calendar"] = months.map((m, index) => {
    const monthNo = index + 1;
    const opened = newIn(monthNo);
    return {
      month_label: m.label,
      ...(index === 0
        ? {
            weeks: [
              { week: 1 as const, focus_he: `פותחים ${lamed(primary)}: ${offer} מקרוב` },
              { week: 2 as const, focus_he: "איך מזמינים ואיך פונים, בלי מחסומים" },
              { week: 3 as const, focus_he: "מה הלקוחות אומרים, במילים שלהם" },
              { week: 4 as const, focus_he: "חוזרים על מה שהצליח, ובודקים מול היעד" },
            ],
          }
        : {}),
      dates: datesFor(group, m.year, m.month),
      checkpoint_he:
        index === 0
          ? `בסוף ${m.label} בודקים: מאיזה פוסט הגיעו הכי הרבה ${unit}, וממשיכים עם זה.`
          : index === 1
            ? opened.length
              ? `בסוף ${m.label} בודקים אם ${opened[0]} מביא ${unit}, ומחליטים אם להגדיל.`
              : `בסוף ${m.label} משווים לחודש הראשון, ומוותרים על מה שלא הביא כלום.`
            : `בודקים מה הביא ${unit}, ומעדכנים את הצעדים הבאים לפי מה שלמדנו.`,
    };
  });

  /* Content: themes, cadence and example titles, per month. */
  const mainNet = nets[0] ?? "instagram";
  const pillarSet = [
    [
      { key: "product", title: model === "services" ? "העבודה מקרוב" : "המוצר מקרוב", description_he: `${offer}, כמו שהוא באמת, בלי סטודיו.` },
      { key: "how", title: "איך זה עובד אצלנו", description_he: "מה קורה מהרגע שפונים ועד שמקבלים." },
      { key: "people", title: "מי אנחנו", description_he: d.differentiator?.trim() ? `${d.differentiator.trim()}, ולמה זה חשוב.` : "האנשים מאחורי העסק." },
    ],
    [
      { key: "customers", title: "מה הלקוחות אומרים", description_he: "מילים של לקוחות אמיתיים, באישור שלהם." },
      { key: "product", title: model === "services" ? "עבודות שעשינו" : "מה חדש אצלנו", description_he: "משהו אחד בכל שבוע, מקרוב." },
      { key: "season", title: "לקראת התאריכים", description_he: "מתכוננים מוקדם לתאריך הבא בלוח." },
    ],
    [
      { key: "tips", title: "טיפ מהניסיון", description_he: `משהו שימושי על ${offer}, שאפשר לשמור.` },
      { key: "customers", title: "סיפורי לקוחות", description_he: "לקוח אחד: מה היה, מה עשינו, מה השתנה." },
      { key: "season", title: "סוף השנה", description_he: "סיכום, תודה, ומה מחכה בשנה הבאה." },
    ],
  ];
  // The content mix: structure, never products (which products to feature is the owner's call).
  const lever: LeverKey = d.lever?.primary ?? "new_customers";
  const MIX_NAMES: Record<ContentType, string> = {
    product: model === "services" ? "השירותים" : "המוצרים",
    value: "תוכן שמלמד ועוזר",
    behind_scenes: "מאחורי הקלעים",
    social_proof: "לקוחות מספרים",
    offer: "מבצע או הזמנה לפעולה",
    community: "קהילה ואירועים מקומיים",
    seasonal: "לוח שנה וחגים",
  };
  const MIX_BY_LEVER: Record<LeverKey, [ContentType, string, string][]> = {
    new_customers: [["product", "2", "להראות למי שלא מכיר מה אתם עושים הכי טוב."], ["social_proof", "1-2", "מה לקוחות אומרים, כדי להוריד חשש."], ["value", "1-2", "תשובה לשאלה שמחפשים לפני שקונים."], ["seasonal", "1", "סיבה לבוא דווקא עכשיו."]],
    bigger_basket: [["product", "2-3", "שילובים ומארזים: מה הולך טוב ביחד."], ["offer", "1", "סף למשלוח חינם או מארז, בלי לציין מוצר מסוים."], ["social_proof", "1", "לקוחות שלקחו יותר ונהנו."], ["behind_scenes", "1", "איך מרכיבים הזמנה."]],
    returning: [["social_proof", "2", "לקוחות קבועים מספרים, כדי שאחרים יחזרו."], ["community", "1-2", "מה קורה אצלכם ובאזור, למי שכבר מכיר."], ["product", "1-2", "מה חדש מאז הפעם הקודמת."], ["offer", "1", "משהו רק ללקוחות שחוזרים."]],
    close_more: [["social_proof", "2", "סיפורי לקוחות שמראים את התוצאה."], ["behind_scenes", "1-2", "תהליך העבודה, שלב אחרי שלב."], ["value", "1-2", "תשובות לשאלות שלפני פנייה."], ["product", "1", "מה בדיוק מקבלים."]],
    fill_quiet: [["seasonal", "2", "להתכונן לחודש השקט שלושה שבועות לפני."], ["offer", "1-2", "סיבה לבוא דווקא בחודש שקט."], ["community", "1", "מה קורה אצלכם כשרגוע."], ["product", "1-2", "מה אפשר להזמין עכשיו."]],
  };
  const content: QuarterPlan["content"] = months.map((m, index) => {
    const cad: QuarterPlan["content"][number]["cadence"] = [{ channel_key: mainNet, per_week: CADENCE_HE[cadence] }];
    if (nets.includes("facebook") && mainNet !== "facebook") cad.push({ channel_key: "facebook", per_week: "1 בשבוע" });
    if (index >= 1 && channels.some((c) => c.key === "whatsapp_list")) cad.push({ channel_key: "whatsapp_list", per_week: "1 בשבוע" });
    if (index === 2 && channels.some((c) => c.key === "email")) cad.push({ channel_key: "email", per_week: "1 בשבועיים" });
    return {
      month_label: m.label,
      pillars: pillarSet[index],
      cadence: cad,
      mix: MIX_BY_LEVER[lever].map(([type_key, per_month, purpose_he]) => ({ type_key, name_he: MIX_NAMES[type_key], per_month, purpose_he })),
      products_note_he: "אילו מוצרים להבליט בכל פוסט — אתם מחליטים כאן, לפי מלאי ורווחיות.",
    };
  });

  /* Bets. */
  const firstNew = channels.find((c) => c.kind === "new");
  const assumptions: QuarterPlan["assumptions"] = [
    {
      bet_he: `אנחנו מניחים ש${primary} יגיבו יותר ל${model === "services" ? "עבודה אמיתית" : "מוצר"} מקרוב מאשר לפוסט מבצע, ונראה את זה בתגובות.`,
      if_wrong_he: "אם אחרי שבועיים אין תגובות, עוברים לסיפורי לקוחות ובודקים שוב.",
    },
    {
      bet_he: `אנחנו מניחים ש-${CADENCE_HE[cadence]} מספיק כדי שיזכרו אתכם, בלי שזה יכביד עליכם.`,
      if_wrong_he: "אם זה יותר מדי, יורדים לקצב נמוך יותר. קבוע עדיף על הרבה ואז שקט.",
    },
  ];
  if (firstNew) {
    assumptions.push({
      bet_he: `אנחנו מניחים ש${firstNew.name_he} יביא ${unit} שלא הגיעו מהרשתות, ונראה את זה בקישור המסומן.`,
      if_wrong_he: paid && firstNew.key === "meta_ads"
        ? "אם אחרי חודש זה לא מביא כלום, מעבירים את הכסף לערוץ שכן הביא."
        : "אם אחרי חודש אין שום דבר משם, מוותרים ומשקיעים במה שכן הביא.",
    });
  }

  const plan: QuarterPlan = {
    strategy: {
      one_liner_he: `${direction.title}: ${direction.approach_he.replace(/\.$/, "")}, קודם כול ${lamed(primary)}.`,
      angle_he: d.differentiator?.trim()
        ? `${d.differentiator.trim()}. זה מה שיחזור בכל פוסט, במילים ובתמונות.`
        : `${kit.differentiators[0]}. נתחיל מזה, ונלמד מהתגובות אם זה מה שמושך.`,
      why_he: direction.why_he,
      from_insight: refOf("answers") ?? refOf("category"),
    },
    kpi: {
      key: option.key,
      name_he: option.name_he,
      how_he: kpiHow[option.key] ?? "סופרים כל שבוע.",
      ...(inputs.target ? { target: inputs.target } : {}),
      baseline_he: "עוד לא יודעים כמה יש היום. נמדוד מהשבוע הראשון, ואז יהיה מול מה להשוות.",
    },
    measures,
    integrations,
    channels,
    budget,
    calendar,
    content,
    assumptions,
    inside: MOCK_INSIDE,
    cached: false,
  };
  const numbers = mockNumbers(d, model);
  if (numbers) {
    plan.numbers = numbers;
    if (numbers.target?.text_he && numbers.target.kind !== "qualitative") plan.kpi.target = inputs.target || numbers.target.text_he;
    if (numbers.baseline_known) plan.kpi.baseline_he = numbers.baseline_he;
  }

  const changed = inputs.changed ?? [];
  const notes: string[] = [];
  if (changed.includes("cadence")) notes.push(`הקצב עכשיו ${CADENCE_HE[cadence]}, והתוכן בתוכנית התעדכן.`);
  if (changed.includes("target")) notes.push(inputs.target ? `נמדוד מול היעד שלכם: ${inputs.target}.` : "הורדנו את היעד. נמדוד בלי מספר קבוע.");
  if (changed.includes("primary_audience")) notes.push(`מתחילים ${lamed(primary)}. השבוע הראשון והפוסטים התעדכנו.`);
  if (changed.includes("feedback")) {
    notes.push("קראנו מה כתבתם. התאמנו את הניסוח והדוגמאות, והמבנה נשאר.");
  }
  if (notes.length) plan.changed_he = notes.join(" ");
  return plan;
}

/** Mirrors quarter_plan.INSIDE: only what the app has. */
const MOCK_INSIDE: NonNullable<QuarterPlan["inside"]> = [
  { key: "plan", title_he: "התוכנית הזו, לעריכה", what_he: "כל חודש נפתח ממנה. אפשר לשנות ערוצים, קצב ויעד בכל רגע." },
  { key: "posts", title_he: "פוסטים לכל שבוע", what_he: "אחרי שתבחרו אילו מוצרים להבליט ותעלו תמונות, נכתוב לפי התמהיל. אתם מאשרים." },
  { key: "design", title_he: "עיצוב בצבעים שלכם", what_he: "כל פוסט מקבל כרטיס מעוצב בצבעים ובלוגו של העסק." },
  { key: "assets", title_he: "התמונות שלי", what_he: "מקום אחד לתמונות ולסרטונים של העסק, שמהם בונים את הפוסטים." },
  { key: "calendar", title_he: "לוח שנה", what_he: "מתי יוצא כל פוסט, והחגים והמועדים שכדאי להתכונן אליהם." },
  { key: "results", title_he: "התוצאות", what_he: "מה הביא כל ערוץ, לפי הנתונים שחיברתם, מול היעד." },
  { key: "guides", title_he: "מדריכי חיבור", what_he: "צעד אחר צעד לחבר את נתוני האתר, אינסטגרם והכרטיס בגוגל." },
  { key: "whatsapp_link", title_he: "קישור וואטסאפ מסומן", what_he: "בכל פוסט ובביו, וסופרים כמה לחצו מכל מקום. אנחנו מכינים אותו." },
];

/** "המספרים" in mock mode: the same fixture the target step shows, plus the owner's target. */
function mockNumbers(d: OnboardingDraft, model: BusinessModel): PlanNumbers | null {
  if (!d.baseline && !d.lever && !d.target) return null;
  const result = mockTargetSuggestion({
    model,
    grow: d.grow_where,
    baseline: d.baseline,
    lever: d.lever,
    budgetIls: budgetIls(d.budget),
    hasSite: Boolean(d.links.website),
    slowMonths: d.seasons?.slow ?? [],
  });
  const owner = d.target && (d.target.accepted || d.target.edited_by_owner) ? d.target : null;
  const s = result.suggestion;
  const target: PlanNumbers["target"] = owner
    ? { ...owner, text_he: targetText(owner), from: owner.edited_by_owner ? "owner" : "suggestion", ...(owner.edited_by_owner && s ? { suggested_he: s.headline_he } : {}) }
    : s
      ? { kind: s.kind, value_min: s.min, value_max: s.max, unit_he: s.unit_he, text_he: s.headline_he, accepted: false, edited_by_owner: false, from: "suggestion", ...(s.level_he ? { level_he: s.level_he } : {}) }
      : result.qualitative_he
        ? { kind: "qualitative", text_he: result.qualitative_he, accepted: false, edited_by_owner: false, from: "suggestion" }
        : undefined;
  return {
    baseline_he: result.baseline_summary_he,
    baseline_known: result.baseline_known,
    lever: {
      key: result.lever,
      name_he: result.lever_name_he,
      recommended_key: result.recommended_lever,
      recommended_he: result.lever_hint_he,
      recommended_name_he: result.levers.find((l) => l.key === result.recommended_lever)?.name_he ?? "",
    },
    ...(target ? { target } : {}),
    math_he: result.math_he,
    ...(result.unit_economics_he ? { unit_economics_he: result.unit_economics_he } : {}),
    payback: result.payback ?? null,
    assumptions_he: result.assumptions_he,
    sources: result.sources,
    organic_only: result.organic_only,
    first_checkpoint_he: result.first_checkpoint_he,
    caveat_he: result.caveat_he,
  };
}
