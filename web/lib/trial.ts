"use client";

/**
 * The free first month (docs/onboarding-v2.md, Revision 7 B in the order of Revision 8):
 * `GET /trial` and the pieces around it — the foundations the owner gives us before any
 * post is written (baseline, featured items, voice check), the research runs, and the
 * demo's fixtures.
 *
 * Kept out of `lib/api.ts` on purpose: it is one feature with one owner, and the shared
 * cache below (every tab reads the same journey) has no business in the generic client.
 */
import { useEffect, useSyncExternalStore } from "react";
import { ApiError, api, endpoints, isDemo } from "./api";
import { whatsappEndpoints } from "./whatsapp";

/* --------------------------------- Types --------------------------------- */

export type TrialStepStatus = "todo" | "done" | "locked" | "soon";

export type TrialStepKey =
  | "instagram"
  | "site_data"
  | "whatsapp"
  | "gbp"
  | "baseline"
  | "photos"
  | "featured"
  | "voice"
  | "start_posts"
  | "approve_first"
  | "publish_first"
  | "results"
  | "month_two"
  | "month_review";

export type TrialStep = {
  key: TrialStepKey | string;
  week: 1 | 2 | 3 | 4;
  title_he: string;
  /** One line, tied to the plan's measure where there is one. */
  why_he: string;
  minutes: number;
  /** Where the step is done. */
  href: string;
  /** The button's label: an infinitive. */
  action_he: string;
  status: TrialStepStatus;
  done_at?: string;
  /** Why a `locked` step waits, or why a `soon` step is not here yet. */
  note_he?: string;
};

export type HypothesisStatus = "measuring" | "confirmed" | "not_confirmed";

export type TrialHypothesis = { text_he: string; if_wrong_he: string; status: HypothesisStatus; status_he: string };

export type TrialPayload = {
  day: number;
  days_total: number;
  ended: boolean;
  week: 1 | 2 | 3 | 4;
  started_at: string;
  ends_at: string;
  welcomed_at: string | null;
  /** Steps done, of the steps that exist on this server (`soon` is not counted). */
  done: number;
  total: number;
  next_key: string | null;
  weeks: { week: number; title_he: string }[];
  steps: TrialStep[];
  /** Week 1's aha, "המדידה עובדת": what is connected and whether real numbers came in. */
  measurement: { connected: ("instagram" | "site" | "whatsapp")[]; has_numbers: boolean; first_numbers_at: string | null; baseline: boolean };
  hypotheses: TrialHypothesis[];
};

export type ResearchInsight = {
  title: string;
  text: string;
  plan_change: string;
  confidence: "strong" | "weak";
  confidence_reason?: string;
  source_labels_he?: string[];
};

export type ResearchRun = {
  id: number;
  created_at: string;
  period: string;
  trigger: "manual" | "scheduled" | string;
  status: string;
  headline: string;
  insights: ResearchInsight[];
  insights_error_he: string;
};

export type ResearchPayload = {
  available: boolean;
  empty_state_he: string;
  run: ResearchRun | null;
  rate_limit: { limit_per_day: number; runs_left_today: number; next_run_at: string };
};

/** The one job of each week (Revision 8). The API sends the same in `weeks`. */
export const WEEK_THEME: Record<number, string> = {
  1: "מדידה",
  2: "חומרי גלם",
  3: "תוכן ראשון",
  4: "מודדים ומתאימים",
};

export function weekLabel(week: number): string {
  return `שבוע ${week} · ${WEEK_THEME[week] ?? ""}`;
}

/* ------------------------------ Derivations ------------------------------ */

/** The same rule as the API's `next_step`: the first step that can be done now. */
export function nextStep(payload: TrialPayload): TrialStep | null {
  // Never past a week that is still waiting (a locked step): the same rule as the API's
  // next_step, so "לבנות את החודש השני" is not the ask while the first posts are written.
  const waiting = payload.steps.filter((step) => step.status === "locked").map((step) => step.week);
  const horizon = waiting.length ? Math.min(...waiting) : Infinity;
  return payload.steps.find((step) => step.status === "todo" && step.week <= horizon) ?? null;
}

function recount(payload: TrialPayload): TrialPayload {
  const counted = payload.steps.filter((step) => step.status !== "soon");
  const next = nextStep(payload);
  return {
    ...payload,
    done: counted.filter((step) => step.status === "done").length,
    total: counted.length,
    next_key: next?.key ?? null,
  };
}

/**
 * Whether week 2's foundations are in (photos, featured items, voice), so posts are the
 * natural next thing to show. Not "start_posts": a month written before Revision 8 has
 * posts already, and they still wait for the foundations on the home page.
 */
export function foundationsDone(payload: TrialPayload): boolean {
  return ["photos", "featured", "voice"].every(
    (key) => payload.steps.find((step) => step.key === key)?.status !== "todo"
  );
}

/* ------------------------------ Shared store ----------------------------- */

/**
 * One journey for the whole app. Today, the welcome and every empty state's "this is a
 * step of your month" line read the same payload, so a step ticked on one screen is
 * ticked everywhere without each of them calling the API.
 */
type TrialState = { payload: TrialPayload | null; failed: boolean; loading: boolean };

let state: TrialState = { payload: null, failed: false, loading: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: TrialState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_STATE: TrialState = { payload: null, failed: false, loading: true };

function fetchTrial(): Promise<TrialPayload> {
  return isDemo() ? demoTrial() : api<TrialPayload>("/trial");
}

/** Load (or reload) the journey. Never rejects: a failure is `failed`, not an error. */
export function loadTrial(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  if (state.payload && !force) return Promise.resolve();
  set({ ...state, loading: true });
  inflight = fetchTrial()
    .then((payload) => set({ payload, failed: false, loading: false }))
    .catch(() => set({ payload: state.payload, failed: true, loading: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The journey, loaded once per app session and shared. */
export function useTrial(): TrialState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    void loadTrial();
  }, []);
  return snapshot;
}

function adopt(request: Promise<TrialPayload>) {
  return request
    .then((payload) => set({ payload, failed: false, loading: false }))
    .catch(() => {
      // Guidance only: an unrecorded event just means the step stays open a little longer.
    });
}

/** A page the journey sends the owner to was opened. Fire and forget. */
export function markSeen(what: "plan" | "results"): void {
  void adopt(
    isDemo()
      ? demoMarkSeen(what)
      : api<TrialPayload>("/trial/seen", { method: "POST", body: JSON.stringify({ what }) })
  );
}

/** Something only the owner can tell us: the Google card is checked, posts were started. */
export function confirmStep(what: "gbp" | "posts_started"): Promise<void> {
  if (isDemo()) {
    DEMO_EVENTS[what] ||= new Date().toISOString();
    return adopt(demoTrial());
  }
  return adopt(api<TrialPayload>("/trial/confirm", { method: "POST", body: JSON.stringify({ what }) }));
}

/** The welcome was seen or skipped: once, on the server, so no other device shows it. */
export function markWelcomed(): void {
  if (state.payload) set({ ...state, payload: { ...state.payload, welcomed_at: new Date().toISOString() } });
  if (isDemo()) {
    DEMO_WELCOMED ||= new Date().toISOString();
    return;
  }
  void adopt(api<TrialPayload>("/trial/welcomed", { method: "POST" }));
}

/**
 * "להתחיל לכתוב את הפוסטים": the generation work's `POST /onboarding/posts/start`
 * (Revision 8). A 404 means that endpoint is not on this server yet.
 */
export async function startPosts(): Promise<void> {
  if (isDemo()) throw new ApiError("בדמו הפוסטים כבר כתובים.", 400);
  await endpoints.startPosts();
  await confirmStep("posts_started");
}

/* ------------------------------ Foundations ------------------------------ */

export type BaselineKey = "orders_month" | "avg_order_ils" | "inquiries_month" | "close_rate" | "deal_value_ils";

export type BaselinePayload = {
  baseline: Partial<Record<BaselineKey, number | string | null>>;
  saved_at: string | null;
  fields: { key: BaselineKey; label_he: string; unit_he: string }[];
  from_integrations: boolean;
};

export type FeaturedReason = "in_stock" | "profitable" | "seasonal" | "new" | "best_seller";

export type FeaturedItem = { name: string; priority?: number; reason: FeaturedReason | null; note?: string };

export type FeaturedPayload = {
  items: FeaturedItem[];
  saved_at: string | null;
  reasons: { key: FeaturedReason; label_he: string }[];
  min: number;
  max: number;
  kind_he: string;
  suggestions: string[];
};

export type VoicePayload = {
  voice_he: string;
  examples_he: string[];
  do_say: string[];
  dont_say: string[];
  check: { ok: boolean; note: string; at: string } | null;
};

const REASONS: FeaturedPayload["reasons"] = [
  { key: "in_stock", label_he: "במלאי" },
  { key: "profitable", label_he: "רווחי" },
  { key: "seasonal", label_he: "עונתי" },
  { key: "new", label_he: "חדש" },
  { key: "best_seller", label_he: "הכי נמכר" },
];

function refreshAfter<T>(request: Promise<T>): Promise<T> {
  return request.then((value) => {
    void loadTrial(true);
    return value;
  });
}

export const foundations = {
  baseline: (): Promise<BaselinePayload> =>
    isDemo() ? Promise.resolve(demoBaseline()) : api<BaselinePayload>("/business/baseline"),
  saveBaseline: (values: Partial<Record<BaselineKey, number | null>>): Promise<BaselinePayload> => {
    if (isDemo()) {
      DEMO_BASELINE = { ...DEMO_BASELINE, ...values };
      DEMO_BASELINE_SAVED = new Date().toISOString();
      return refreshAfter(Promise.resolve(demoBaseline()));
    }
    return refreshAfter(api<BaselinePayload>("/business/baseline", { method: "PUT", body: JSON.stringify(values) }));
  },
  featured: (): Promise<FeaturedPayload> =>
    isDemo() ? Promise.resolve(demoFeatured()) : api<FeaturedPayload>("/business/featured-items"),
  saveFeatured: (items: FeaturedItem[]): Promise<FeaturedPayload> => {
    const body = { items: items.map(({ name, reason, note }) => ({ name, reason, note: note || "" })) };
    if (isDemo()) {
      DEMO_FEATURED = body.items;
      return refreshAfter(Promise.resolve(demoFeatured()));
    }
    return refreshAfter(api<FeaturedPayload>("/business/featured-items", { method: "PUT", body: JSON.stringify(body) }));
  },
  voice: (): Promise<VoicePayload> =>
    isDemo() ? Promise.resolve(demoVoice()) : api<VoicePayload>("/business/voice-check"),
  saveVoice: (ok: boolean, note = ""): Promise<VoicePayload> => {
    if (isDemo()) {
      DEMO_VOICE = { ok, note, at: new Date().toISOString() };
      return refreshAfter(Promise.resolve(demoVoice()));
    }
    return refreshAfter(api<VoicePayload>("/business/voice-check", { method: "PUT", body: JSON.stringify({ ok, note }) }));
  },
};

/* -------------------------------- Research ------------------------------- */

export function researchLatest(): Promise<ResearchPayload> {
  if (isDemo()) return Promise.resolve(demoResearch());
  return api<ResearchPayload>("/research/latest");
}

export async function researchRun(): Promise<ResearchPayload> {
  if (isDemo()) {
    DEMO_RESEARCH_RUN = true;
    return demoResearch();
  }
  return api<ResearchPayload>("/research/run", { method: "POST" });
}

/* ---------------------------------- Demo --------------------------------- */

/**
 * The demo is day 4 of the bakery's free month, in week 1 (measurement): Instagram follows
 * the demo's own Instagram switch, the WhatsApp link its own fixture; the site data, the
 * Google card and the baseline are still open. Its posts already exist (the demo month was
 * written before Revision 8), so "start writing" reads as done. Statuses are derived from
 * the demo's own state the way the API derives them from rows; copy mirrors
 * `api/app/routers/trial.py`.
 */
const DEMO_DAY = 4;
const DEMO_KPI = "יותר הזמנות באתר";
let DEMO_WELCOMED: string | null = null;
let DEMO_RESEARCH_RUN = false;
const DEMO_EVENTS: Record<string, string> = {};
let DEMO_BASELINE: Partial<Record<BaselineKey, number | null>> = {};
let DEMO_BASELINE_SAVED: string | null = null;
let DEMO_FEATURED: FeaturedItem[] = [
  { name: "חלות לשבת", reason: "best_seller" },
  { name: "עוגת דבש", reason: "seasonal" },
];
let DEMO_VOICE: VoicePayload["check"] = null;

function demoMarkSeen(what: "plan" | "results"): Promise<TrialPayload> {
  DEMO_EVENTS[`${what}_seen_at`] ||= new Date().toISOString();
  return demoTrial();
}

function demoBaseline(): BaselinePayload {
  return {
    baseline: { ...DEMO_BASELINE },
    saved_at: DEMO_BASELINE_SAVED,
    fields: [
      { key: "orders_month", label_he: "הזמנות או קניות בחודש", unit_he: "בחודש" },
      { key: "avg_order_ils", label_he: "סכום ממוצע לקנייה", unit_he: "₪" },
    ],
    from_integrations: false,
  };
}

function demoFeatured(): FeaturedPayload {
  const taken = new Set(DEMO_FEATURED.map((item) => item.name));
  return {
    items: DEMO_FEATURED.map((item, index) => ({ ...item, priority: index + 1 })),
    saved_at: null,
    reasons: REASONS,
    min: 3,
    max: 10,
    kind_he: "מוצרים",
    suggestions: ["לחם מחמצת", "פוקצ׳ה", "עוגיות חמאה", "בורקס"].filter((name) => !taken.has(name)),
  };
}

function demoVoice(): VoicePayload {
  return {
    voice_he: "חם, קצר ושכונתי. מדברים כמו מהדלפק: ״בוקר טוב״, ״יצא עכשיו מהתנור״.",
    examples_he: ["בוקר טוב! החלות של שישי יצאו עכשיו מהתנור.", "שמרנו לכם עוגת דבש לחג. תגידו כמה."],
    do_say: ["מהתנור", "שכונה", "של שישי"],
    dont_say: ["מבצע בלעדי", "איכות ללא פשרות"],
    check: DEMO_VOICE,
  };
}

function demoResearch(): ResearchPayload {
  const rate = { limit_per_day: 3, runs_left_today: DEMO_RESEARCH_RUN ? 2 : 3, next_run_at: "" };
  if (!DEMO_RESEARCH_RUN) return { available: false, empty_state_he: "", run: null, rate_limit: rate };
  return {
    available: true,
    empty_state_he: "",
    rate_limit: rate,
    run: {
      id: 1,
      created_at: new Date().toISOString(),
      period: "2026-W40",
      trigger: "manual",
      status: "done",
      headline: "לפני החגים מחפשים עוגות בהזמנה מראש, ואף מאפייה באזור לא מציעה את זה בבירור.",
      insights_error_he: "",
      insights: [
        {
          title: "מחפשים הזמנה מראש לחג",
          text: "בהשלמה של גוגל עולים ״עוגת דבש להזמנה״ ו״מאפייה הזמנה מראש יפו״.",
          plan_change: "פוסט הזמנה מראש ביום ראשון של שבוע 2, עם קישור לוואטסאפ.",
          confidence: "strong",
          source_labels_he: ["חיפושים בגוגל"],
        },
        {
          title: "המתחרים מפרסמים רק מוצר מוכן",
          text: "שני החשבונות שבחרתם פרסמו החודש רק תמונות של מדף מלא.",
          plan_change: "להוסיף ריל אחד מהתנור בבוקר, זה הסוג שהכי נשמר אצלכם.",
          confidence: "weak",
          source_labels_he: ["מתחרים"],
        },
      ],
    },
  };
}

async function demoTrial(): Promise<TrialPayload> {
  const [assets, strategy, instagram, whatsapp] = await Promise.all([
    endpoints.assets().catch(() => ({ assets: [] })),
    endpoints.strategy().catch(() => null),
    endpoints.instagramBrief().catch(() => null),
    whatsappEndpoints.get().catch(() => null),
  ]);
  const posts = strategy?.roadmap?.posts ?? [];
  const first = posts.filter((post) => post.week === 1);
  const waiting = first.filter((post) => post.approval_status !== "approved");
  const approved = posts.filter((post) => post.approval_status === "approved");
  const published = posts.filter((post) => (post.published_url || "").trim());
  const toPublish = posts.findIndex((post) => post.approval_status === "approved" && !(post.published_url || "").trim());
  const photos = assets.assets.length;
  const baseline = Object.values(DEMO_BASELINE).some((value) => value !== null && value !== undefined);
  const featured = DEMO_FEATURED.length;
  const instagramOn = Boolean(instagram?.meta_connected);
  const whatsappOn = Boolean(whatsapp?.number_e164);
  const started = new Date(Date.now() - (DEMO_DAY - 1) * 86_400_000);
  const ends = new Date(started.getTime() + 30 * 86_400_000);
  const lock = (note: string) => ({ status: "locked" as const, note_he: note });

  const steps: TrialStep[] = [
    { key: "instagram", week: 1, title_he: "לחבר את האינסטגרם", why_he: "כך נמדוד כל פוסט מהיום הראשון, ונכתוב לפי מה שכבר הצליח לכם.", minutes: 3, href: "/integrations", action_he: "לחבר את האינסטגרם", status: instagramOn ? "done" : "todo" },
    { key: "site_data", week: 1, title_he: "לחבר את נתוני האתר", why_he: `בלי זה לא נדע כמה הגיעו לאתר מכל פוסט, ולא נוכל למדוד את היעד: ${DEMO_KPI}.`, minutes: 10, href: "/integrations", action_he: "לחבר את נתוני האתר", status: "todo" },
    { key: "whatsapp", week: 1, title_he: "להכין את קישור הוואטסאפ", why_he: "קישור עם הודעה מוכנה. כך נספור כמה פניות הגיעו מכל פוסט.", minutes: 2, href: "/integrations#whatsapp", action_he: "להכין את הקישור", status: whatsappOn ? "done" : "todo" },
    { key: "gbp", week: 1, title_he: "לבדוק את הכרטיס של העסק בגוגל", why_he: "שם מוצאים אתכם במפות ובחיפוש. נוודא שהוא קיים, מעודכן ושאפשר למדוד אותו.", minutes: 5, href: "/promotion#profile", action_he: "לבדוק את הכרטיס", status: DEMO_EVENTS.gbp ? "done" : "todo" },
    { key: "baseline", week: 1, title_he: "לרשום איפה העסק היום", why_he: `נקודת הפתיחה. בלעדיה לא נדע אם ${DEMO_KPI} באמת השתנה.`, minutes: 2, href: "/baseline", action_he: "לרשום את המספרים", status: baseline ? "done" : "todo" },
    { key: "photos", week: 2, title_he: "להעלות תמונות וסרטונים של העסק", why_he: `לפחות 3, כדי שהפוסטים ייראו כמו העסק שלכם.${photos > 0 && photos < 3 ? ` כבר העליתם ${photos}.` : ""}`, minutes: 5, href: "/assets", action_he: "להעלות תמונות", status: photos >= 3 ? "done" : "todo" },
    { key: "featured", week: 2, title_he: "לבחור אילו מוצרים לקדם", why_he: `מה במלאי, מה רווחי ומה עונתי. אתם מחליטים את הסדר, והפוסטים הולכים לפיו.${featured > 0 && featured < 3 ? ` בחרתם ${featured} עד עכשיו.` : ""}`, minutes: 5, href: "/featured", action_he: "לבחור", status: featured >= 3 ? "done" : "todo" },
    { key: "voice", week: 2, title_he: "לבדוק שהסגנון נשמע כמוכם", why_he: "שני משפטים לדוגמה בסגנון שקראנו באתר. אם זה לא אתם, נתקן לפני שכותבים.", minutes: 2, href: "/voice", action_he: "לבדוק את הסגנון", status: DEMO_VOICE ? "done" : "todo" },
    { key: "start_posts", week: 2, title_he: "להתחיל לכתוב את הפוסטים", why_he: "לפי התוכנית, המוצרים שבחרתם והתמונות שלכם. הפוסטים יחכו לאישור שלכם.", minutes: 1, href: "/posts", action_he: "להתחיל לכתוב", ...(posts.length ? { status: "done" as const } : lock("אחרי התמונות, המוצרים והסגנון.")) },
    { key: "approve_first", week: 3, title_he: "לאשר את הפוסטים הראשונים", why_he: waiting.length > 1 ? `רק פוסט מאושר יוצא לפרסום. ${waiting.length} מחכים לכם.` : "רק פוסט מאושר יוצא לפרסום.", minutes: 10, href: "/posts", action_he: "לבדוק ולאשר", ...(first.length ? { status: waiting.length ? ("todo" as const) : ("done" as const) } : lock("אחרי שנכתוב את הפוסטים.")) },
    { key: "publish_first", week: 3, title_he: "לפרסם את הפוסט הראשון", why_he: "ערכת הפרסום מוכנה: כיתוב, תמונה וקישור מסומן, כדי שנדע מה הפוסט הביא.", minutes: 5, href: toPublish >= 0 ? `/posts?post=${toPublish}` : "/posts", action_he: "לפתוח את ערכת הפרסום", ...(published.length ? { status: "done" as const } : approved.length ? { status: "todo" as const } : lock("אחרי שתאשרו את הפוסט הראשון.")) },
    { key: "results", week: 4, title_he: "לבדוק את התוצאות מול נקודת הפתיחה", why_he: `האם ${DEMO_KPI} זז, ואילו השערות מתאשרות.`, minutes: 5, href: "/performance", action_he: "לראות את התוצאות", ...(published.length ? { status: DEMO_EVENTS.results_seen_at ? ("done" as const) : ("todo" as const) } : lock("אחרי שתפרסמו את הפוסט הראשון.")) },
    { key: "month_two", week: 4, title_he: "לבנות את החודש השני", why_he: "לפי מה שלמדנו החודש. הפוסטים יחכו לאישור שלכם, כמו עכשיו.", minutes: 5, href: "/strategy", action_he: "לבנות את החודש", ...(posts.length ? { status: "todo" as const } : lock("אחרי שהחודש הראשון יהיה מוכן.")) },
    { key: "month_review", week: 4, title_he: "לסכם את החודש ולהחליט אם להמשיך", why_he: `החודש מול נקודת הפתיחה ביעד שבחרתם: ${DEMO_KPI}. בלי התחייבות.`, minutes: 10, href: "/performance", action_he: "לראות את הסיכום", ...lock("נפתח ביום 22.") },
  ];

  return recount({
    day: DEMO_DAY,
    days_total: 30,
    ended: false,
    week: 1,
    started_at: started.toISOString(),
    ends_at: ends.toISOString(),
    welcomed_at: DEMO_WELCOMED,
    done: 0,
    total: 0,
    next_key: null,
    weeks: [1, 2, 3, 4].map((week) => ({ week, title_he: WEEK_THEME[week] })),
    steps,
    measurement: {
      connected: [...(instagramOn ? (["instagram"] as const) : []), ...(whatsappOn ? (["whatsapp"] as const) : [])],
      has_numbers: instagramOn,
      first_numbers_at: null,
      baseline,
    },
    hypotheses: [
      { text_he: "אנחנו מניחים שהזמנות מראש לחגים יביאו יותר הזמנות באתר מפוסטים של מוצר מוכן.", if_wrong_he: "נעבור למבצע בחנות.", status: "measuring", status_he: "נמדדת" },
      { text_he: "רילס מהתנור בבוקר יביא יותר שמירות ושיתופים מתמונות מדף.", if_wrong_he: "נחזור לתמונות מוצר.", status: "measuring", status_he: "נמדדת" },
    ],
  });
}

/** One step of the journey, or null before it loads (or when this account has none). */
export function useTrialStep(key: string): { step: TrialStep | null; payload: TrialPayload | null } {
  const { payload } = useTrial();
  return { step: payload?.steps.find((item) => item.key === key) ?? null, payload };
}
