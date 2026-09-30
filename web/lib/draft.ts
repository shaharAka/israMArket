/**
 * The /start conversation's draft: what the owner told us before they have an account.
 *
 * It lives in localStorage["isramarket_draft_v2"] (never on the server) until signup,
 * when `POST /onboarding/from-draft` turns it into the business. Every read and write is
 * wrapped: private mode, blocked storage or a full quota must never break the flow, it
 * only loses the resume-on-refresh.
 *
 * Mock mode. Only with NEXT_PUBLIC_DRAFT_MOCK=1 or ?mock=1 do the public calls answer from
 * the fixtures below, so the conversation can be walked end to end while the API is built
 * in parallel. Never implicitly: a 404 from a public endpoint is shown as a failure.
 * `from-draft` is never faked against a real account: on 404 it falls back to the
 * existing profile + audiences endpoints, which is what it will do on the server anyway.
 */
import {
  ApiError,
  api,
  endpoints,
  type Business,
  type BusinessModel,
  type BrandSwatch,
  type PlanDirection,
  type PlanInsight,
  type PlanPreview,
  type PostIdea,
  type PrimaryGoal,
  type PublicBrand,
  type PublicBrandResult,
  type SuggestedAudience,
} from "./api";
import {
  OTHER_FIELD,
  coerceField,
  fieldFor,
  inferField,
  isFieldKey,
  resolveField,
  type BusinessField,
  type FieldKey,
  type PresenceHint,
} from "./businessFields";
import { defaultGoalFor, goalsFor } from "./businessModel";
import {
  baselineForApi,
  isLeverFor,
  mockTargetSuggestion,
  targetText,
  type DraftBaseline,
  type DraftLever,
  type DraftTarget,
  type TargetSuggestion,
} from "./goals";
import { clearPending } from "./pendingUploads";
import {
  KPI_UNITS,
  budgetIls,
  planForApi,
  type DraftBudget,
  type DraftSuccess,
  type GrowWhere,
  type PlanInputs,
  type QuarterPlan,
  type StoredQuarterPlan,
  type SuccessOption,
} from "./quarterPlan";

/* --------------------------------- Types --------------------------------- */

export type Activity = "none" | "sometimes" | "regular";
export type Network = "instagram" | "facebook" | "tiktok";
export type LinkKey = "website" | Network;

export type TriedChannel =
  | "social_posts"
  | "paid_social"
  | "google"
  | "influencers"
  | "whatsapp"
  | "flyers"
  | "word_of_mouth";

/** What the client sends. Mirrored by the API (`services/onboarding_draft.py`). */
export type OnboardingDraft = {
  business_name: string;
  business_type: string; // a FieldKey (lib/businessFields.ts), "" until answered
  offerings: string; // free text, "what you do / sell"
  differentiator?: string;
  audiences: { name: string; description: string }[]; // 0–3
  seasons?: { busy: number[]; slow: number[] }; // month numbers, 1–12
  links: { website?: string; instagram?: string; facebook?: string; tiktok?: string };
  has_none?: boolean; // "עוד לא": no site and no network yet
  activity?: { instagram?: Activity; facebook?: Activity; tiktok?: Activity };
  style_preset?: string; // a STYLE_PRESETS key, when there is no site (or its scan failed)
  tried?: { channels: TriedChannel[]; what_worked?: string };
  competitors?: { name: string; link?: string }[]; // 0–3
  business_model?: BusinessModel; // inferred from the type and the owner's words, confirmable
  /** Where customers come. Not asked at /start: kept from an old draft whose field was
   *  "חנות פיזית" or "חנות אונליין", which the field list no longer offers. */
  presence_type?: PresenceHint;
  /** Derived from `success.kpi` at /start (the month planner still reads it). */
  goal?: PrimaryGoal;
  city?: string;
  /** Revision 5: the marketing budget, where to grow (products / both) and the main KPI. */
  budget?: DraftBudget;
  grow_where?: GrowWhere;
  /** Revision 5's "מה ייחשב הצלחה". Still read from old drafts; superseded by `lever` + `target`. */
  success?: DraftSuccess;
  /** Revision 6 (lib/goals.ts): where the business is today, what to grow, and the 3-month
   *  target the owner accepted or edited. The main measure follows from the lever. */
  baseline?: DraftBaseline;
  lever?: DraftLever;
  target?: DraftTarget;
};

export type BrandScan = {
  url: string;
  status: "reading" | "ready" | "failed";
  brand: PublicBrand | null;
  reason_he?: string;
};

/** Everything /start needs to resume where the owner left off. */
export type FlowState = {
  v: 2;
  step: string;
  draft: OnboardingDraft;
  /** Which screens were answered or skipped: the card only fills what was asked. */
  seen: string[];
  /** Links the owner explicitly chose to fix later. Keep the raw answers to resume. */
  deferredLinks?: LinkKey[];
  deferredLinkErrors?: LinkErrors;
  brandScan?: BrandScan | null;
  suggestions?: SuggestedAudience[] | null;
  suggestionsFor?: string;
  suggestionsFailed?: boolean;
  plan?: PlanPreview | null;
  planFor?: string;
  chosenDirection?: number | null;
  /** "משהו אחר? ספרו לנו" at the direction step: the owner's own words. They revise the
   *  two directions once, and travel with every strategy request after that. */
  directionFeedback?: string;
  /** The 3-month plan for the chosen direction, and what it was computed from. */
  quarterPlan?: QuarterPlan | null;
  quarterPlanFor?: string;
  /** What the owner shaped on the plan (cadence, who comes first). Never prefilled by us.
   *  The target is `draft.success.target`, one value for the question and the plan. */
  planInputs?: Pick<PlanInputs, "cadence" | "primary_audience">;
  /** "משהו לא מתאים? ספרו לנו" on the plan: the owner's own words. */
  planFeedback?: string;
  /** "מה ייחשב הצלחה?" options, and the answers they were fetched for (revision 5). */
  successOptions?: SuccessOption[] | null;
  successOptionsFor?: string;
  /** `POST /public/target-suggestion` for the current answers (revision 6). */
  targetSuggestion?: TargetSuggestion | null;
  targetSuggestionFor?: string;
  modelConfirmed?: boolean;
  /** "עוד לא ניסינו" at the tried step: an answer, not a skip. */
  triedNone?: boolean;
};

export const DRAFT_KEY = "isramarket_draft_v2";
const MOCK_KEY = "isramarket_draft_mock";

export function emptyDraft(): OnboardingDraft {
  return { business_name: "", business_type: "", offerings: "", audiences: [], links: {} };
}

export function emptyFlow(): FlowState {
  return { v: 2, step: "name", draft: emptyDraft(), seen: [] };
}

export function loadFlow(): FlowState | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FlowState>;
    if (parsed?.v !== 2 || !parsed.draft || typeof parsed.step !== "string") return null;
    const flow = { ...emptyFlow(), ...parsed } as FlowState;
    flow.draft = { ...emptyDraft(), ...parsed.draft, links: { ...(parsed.draft.links ?? {}) } };
    normaliseStoredField(flow);
    // A scan that was running when the page closed will never report back.
    if (flow.brandScan?.status === "reading") flow.brandScan = null;
    return flow;
  } catch {
    return null;
  }
}

export function saveFlow(flow: FlowState) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(flow));
  } catch {
    // Storage blocked or full: the flow still works, it only will not survive a refresh.
  }
}

export function clearFlow() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A draft with enough in it to be worth saving (signup hand-off). */
export function hasSavableDraft(flow: FlowState | null): flow is FlowState {
  return Boolean(flow && flow.draft.business_name.trim().length >= 2 && flow.draft.business_type);
}

/* ------------------------------ Vocabulary ------------------------------ */

export const MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/** What usually happens in an Israeli month, to help the owner remember their seasons. */
export const MONTH_HINTS: Record<number, string> = {
  3: "פורים",
  4: "פסח",
  7: "חופש",
  8: "חופש",
  9: "חגים",
  10: "חגים",
  11: "בלאק פריידי",
  12: "חנוכה",
};

export function seasonsExampleFor(businessType: string): string {
  return kitFor(businessType).seasons;
}

export const NETWORKS: { key: Network; label: string; placeholder: string }[] = [
  { key: "instagram", label: "אינסטגרם", placeholder: "@your_business" },
  { key: "facebook", label: "פייסבוק", placeholder: "facebook.com/your.business" },
  { key: "tiktok", label: "טיקטוק", placeholder: "@your_business" },
];

export const ACTIVITY_OPTIONS: { key: Activity; label: string }[] = [
  { key: "none", label: "לא מפרסמים" },
  { key: "sometimes", label: "מדי פעם" },
  { key: "regular", label: "באופן קבוע" },
];

export const TRIED_OPTIONS: { key: TriedChannel; label: string }[] = [
  { key: "social_posts", label: "פוסטים ברשתות" },
  { key: "paid_social", label: "ממומן בפייסבוק/אינסטגרם" },
  { key: "google", label: "גוגל" },
  { key: "influencers", label: "משפיענים" },
  { key: "whatsapp", label: "וואטסאפ ללקוחות" },
  { key: "flyers", label: "פלאיירים" },
  { key: "word_of_mouth", label: "פה לאוזן" },
];

export type StylePreset = { key: string; name: string; description?: string; palette: BrandSwatch[] };

/** For an owner with no site yet (or a scan that failed): pick a look, not a hex code.
 *  The API owns the list (`GET /public/style-presets`); these are the same keys, used
 *  until it answers and whenever it cannot. */
const LOCAL_PRESETS: StylePreset[] = [
  {
    key: "warm",
    name: "חם ושכונתי",
    palette: [
      { hex: "#7A3E24", role: "primary", name: "טרקוטה" },
      { hex: "#D9824B", role: "accent", name: "כתום שרוף" },
      { hex: "#F6EBDD", role: "background", name: "קרם" },
      { hex: "#2A1D16", role: "ink", name: "קפה" },
    ],
  },
  {
    key: "fresh",
    name: "רענן וטבעי",
    palette: [
      { hex: "#2F5D46", role: "primary", name: "ירוק עלה" },
      { hex: "#9CC5A1", role: "accent", name: "מנטה" },
      { hex: "#F1F5EE", role: "background", name: "פשתן" },
      { hex: "#1B2A22", role: "ink", name: "יער" },
    ],
  },
  {
    key: "clean",
    name: "נקי ומדויק",
    palette: [
      { hex: "#3E5566", role: "primary", name: "כחול צפחה" },
      { hex: "#A7C4D4", role: "accent", name: "תכלת" },
      { hex: "#F4F7F8", role: "background", name: "ערפל" },
      { hex: "#1D2830", role: "ink", name: "גרפיט" },
    ],
  },
  {
    key: "luxe",
    name: "יוקרתי ומאופק",
    palette: [
      { hex: "#1E1E1E", role: "primary", name: "שחור" },
      { hex: "#B89556", role: "accent", name: "זהב עתיק" },
      { hex: "#F5F1EA", role: "background", name: "שנהב" },
      { hex: "#111111", role: "ink", name: "פחם" },
    ],
  },
  {
    key: "playful",
    name: "שמח ומשפחתי",
    palette: [
      { hex: "#D6456B", role: "primary", name: "פטל" },
      { hex: "#FFC845", role: "accent", name: "חמנייה" },
      { hex: "#FFF5F7", role: "background", name: "ורוד חלבי" },
      { hex: "#2B1A22", role: "ink", name: "שזיף" },
    ],
  },
  {
    key: "soft",
    name: "רך ועדין",
    palette: [
      { hex: "#8C6A7E", role: "primary", name: "לילך מעושן" },
      { hex: "#E3B7A0", role: "accent", name: "אפרסק" },
      { hex: "#FAF4F1", role: "background", name: "חלב" },
      { hex: "#3A2D35", role: "ink", name: "שזיף כהה" },
    ],
  },
];

let presets: StylePreset[] = LOCAL_PRESETS;
let presetsRequest: Promise<StylePreset[]> | null = null;

export function stylePresets(): StylePreset[] {
  return presets;
}

/** The API's presets, once per page load. Falls back to the local list on any failure. */
export function loadStylePresets(): Promise<StylePreset[]> {
  if (isMockMode()) return Promise.resolve(presets);
  presetsRequest ??= endpoints
    .publicStylePresets()
    .then((res) => {
      const list = (res.presets ?? []).filter((p) => p.key && p.palette?.length);
      if (list.length) {
        presets = list.map((p) => ({ key: p.key, name: p.name_he, description: p.description_he, palette: p.palette }));
      }
      return presets;
    })
    .catch(() => presets);
  return presetsRequest;
}

export function presetFor(key?: string): StylePreset | null {
  return presets.find((preset) => preset.key === key) ?? LOCAL_PRESETS.find((preset) => preset.key === key) ?? null;
}

/* ---------------------------- Business fields ---------------------------- */

/** What the flow knows about a field: label, chip, default model, examples, audiences.
 *  The list and its copy live in `lib/businessFields.ts`. */
export type TypeKit = BusinessField;

/** The field for a stored value: a key, or an old label (read with the offerings). */
export function kitFor(businessType: string, offerings = ""): BusinessField {
  return fieldFor(coerceField(businessType, offerings).key);
}

const PRODUCT_WORDS = /מוצר|מוכר|חנות|קולקצי|מארז|משלוח|תכשיט|בגד|עוג|מאפ|קפה|יין|גבינ/;
const SERVICE_WORDS = /שירות|טיפול|ייעוץ|יועצ|שיעור|סדנ|קורס|פגיש|אימון|הדרכ|עיצוב|ליווי|צילום אירוע/;

/**
 * The closest field for what the owner wrote in their own words, when they did not tap
 * one. The field only tunes examples and cost tables; what they wrote is what the plan
 * is built from, so a rough match (or "משהו אחר") is fine.
 */
export function inferBusinessType(offerings: string): FieldKey {
  return inferField(offerings) ?? OTHER_FIELD;
}

/** Products, services or both, from the field and the owner's own words. Confirmed at the goal step. */
export function inferBusinessModel(businessType: string, offerings: string): BusinessModel {
  const kit = kitFor(businessType, offerings);
  const base = kit.model;
  const text = offerings || "";
  const products = PRODUCT_WORDS.test(text);
  const services = SERVICE_WORDS.test(text);
  if (base === "products" && services) return "both";
  if (base === "services" && products && !/עיצוב|צילום/.test(text)) return "both";
  if (kit.key === OTHER_FIELD) {
    if (products && services) return "both";
    if (services) return "services";
  }
  return base;
}

/**
 * A flow saved before the field list became industries only holds an old Hebrew label
 * ("חנות פיזית / קמעונאות"). It becomes a key on load; an old channel label keeps what it
 * said about where customers come, and the answers computed for the old value stay valid.
 */
function normaliseStoredField(flow: FlowState) {
  const before = flow.draft.business_type;
  if (!before || isFieldKey(before)) return;
  const resolved = resolveField(before, flow.draft.offerings) ?? coerceField(before, flow.draft.offerings);
  flow.draft.business_type = resolved.key;
  if (resolved.presence_type && !flow.draft.presence_type) flow.draft.presence_type = resolved.presence_type;
  // What was fetched for the old value (audiences, plan…) is keyed by a signature
  // that contains it: carry those over rather than silently asking again.
  const from = JSON.stringify(before);
  const to = JSON.stringify(resolved.key);
  for (const key of ["suggestionsFor", "planFor", "quarterPlanFor", "successOptionsFor"] as const) {
    const value = flow[key];
    if (typeof value === "string") flow[key] = value.split(from).join(to);
  }
}

/* ------------------------------- Cleaning ------------------------------- */

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/[^\s./]+\.[^\s]+/i.test(normalizeUrl(value));
}

/** "@Name", "name" or a pasted profile link → "name". */
export function normalizeHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const fromUrl = trimmed.match(/(?:instagram\.com|tiktok\.com\/@?|facebook\.com|fb\.com)\/@?([^/?#\s]+)/i);
  const handle = fromUrl ? fromUrl[1] : trimmed;
  return handle.replace(/^@+/, "").replace(/\/+$/, "");
}

/** The first thing they sell, short enough for a sentence ("מחמצת"). */
export function firstOffering(offerings: string): string {
  const cleaned = offerings.replace(/^למשל:?\s*/, "").trim();
  const first = cleaned.split(/[,،.;\n]| ו(?=[א-ת])/)[0]?.trim() ?? "";
  return first.length > 40 ? `${first.slice(0, 38).trim()}…` : first;
}

/** The draft as the API receives it: trimmed, no empty links, handles without "@". */
export function draftForApi(flow: FlowState): OnboardingDraft {
  const d = flow.draft;
  const links: OnboardingDraft["links"] = {};
  if (!d.has_none) {
    if (d.links.website?.trim() && !flow.deferredLinks?.includes("website")) links.website = normalizeUrl(d.links.website);
    for (const net of ["instagram", "tiktok"] as const) {
      const handle = normalizeHandle(d.links[net] ?? "");
      if (handle && !flow.deferredLinks?.includes(net)) links[net] = handle;
    }
    if (d.links.facebook?.trim() && !flow.deferredLinks?.includes("facebook")) links.facebook = d.links.facebook.trim();
  }
  const activity: OnboardingDraft["activity"] = {};
  // Activity counts for every selected network, even when the owner did not know the handle.
  for (const net of ["instagram", "facebook", "tiktok"] as const) {
    if (!d.has_none && d.links[net] !== undefined && d.activity?.[net]) activity[net] = d.activity[net];
  }
  const out: OnboardingDraft = {
    business_name: d.business_name.trim(),
    business_type: d.business_type,
    offerings: d.offerings.trim(),
    audiences: d.audiences
      .filter((a) => a.name.trim().length >= 2)
      .slice(0, 3)
      .map((a) => ({ name: a.name.trim().slice(0, 60), description: a.description.trim().slice(0, 240) })),
    links,
  };
  if (d.differentiator?.trim()) out.differentiator = d.differentiator.trim().slice(0, 300);
  if (d.seasons && (d.seasons.busy.length || d.seasons.slow.length)) out.seasons = d.seasons;
  if (d.has_none) out.has_none = true;
  if (Object.keys(activity).length) out.activity = activity;
  // A preset matters only when there is no site to read, or the read failed.
  if (d.style_preset && (!links.website || flow.brandScan?.status === "failed")) out.style_preset = d.style_preset;
  if (d.tried && (d.tried.channels.length || d.tried.what_worked?.trim())) {
    out.tried = { channels: d.tried.channels };
    if (d.tried.what_worked?.trim()) out.tried.what_worked = d.tried.what_worked.trim().slice(0, 400);
  }
  const competitors = (d.competitors ?? [])
    .filter((c) => c.name.trim())
    .slice(0, 3)
    .map((c) => (c.link?.trim() ? { name: c.name.trim(), link: c.link.trim() } : { name: c.name.trim() }));
  if (competitors.length) out.competitors = competitors;
  if (d.business_model) out.business_model = d.business_model;
  if (d.presence_type) out.presence_type = d.presence_type;
  // A goal the model does not offer is a 422: drop it and let the API default it.
  const model = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  if (d.goal && goalsFor(model).some((g) => g.key === d.goal)) out.goal = d.goal;
  if (d.city?.trim()) out.city = d.city.trim();
  if (d.budget?.range) {
    out.budget = { range: d.budget.range };
    if (d.budget.exact_ils != null && Number.isFinite(d.budget.exact_ils) && d.budget.exact_ils >= 0) {
      out.budget.exact_ils = Math.round(d.budget.exact_ils);
    }
  }
  // Where to grow is asked of shops only: a service business has no "online or in store".
  if (d.grow_where && model !== "services") out.grow_where = d.grow_where;
  if (d.success?.kpi && !d.lever) {
    out.success = { kpi: d.success.kpi };
    if (d.success.target?.trim()) out.success.target = d.success.target.trim().slice(0, 120);
  }
  // Revision 6: the numbers. A lever the model does not offer is a 422: drop it.
  const baseline = baselineForApi(d.baseline);
  if (baseline) out.baseline = baseline;
  if (d.lever && isLeverFor(d.lever.primary, model)) {
    out.lever = { primary: d.lever.primary };
    if (d.lever.secondary && d.lever.secondary !== d.lever.primary && isLeverFor(d.lever.secondary, model)) {
      out.lever.secondary = d.lever.secondary;
    }
  }
  if (d.target?.kind && (d.target.accepted || d.target.edited_by_owner)) {
    const t = d.target;
    out.target = { kind: t.kind, unit_he: (t.unit_he ?? "").slice(0, 60), accepted: t.accepted, edited_by_owner: t.edited_by_owner };
    if (t.kind === "qualitative") out.target.text_he = (t.text_he ?? "").slice(0, 300);
    else {
      if (t.value_min != null && Number.isFinite(t.value_min)) out.target.value_min = Math.max(0, t.value_min);
      if (t.value_max != null && Number.isFinite(t.value_max)) out.target.value_max = Math.max(0, t.value_max);
      if (out.target.value_min == null && out.target.value_max == null) delete out.target;
    }
  }
  return out;
}

/** A stable key for "the answers this result was computed from". */
export function signature(value: unknown): string {
  return JSON.stringify(value);
}

/* ------------------------------ Mock mode ------------------------------ */

/**
 * Fixtures instead of the network — only when a developer asks for them (?mock=1 or
 * NEXT_PUBLIC_DRAFT_MOCK=1). Never implicitly: an owner who had opened the demo earlier, or
 * whose request failed, was shown invented colours, audiences and plans as if they were
 * theirs. A failure is shown as a failure.
 */
export function isMockMode(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_DRAFT_MOCK === "1") return true;
  try {
    if (new URLSearchParams(window.location.search).get("mock") === "1") {
      window.sessionStorage.setItem(MOCK_KEY, "1");
    }
    return window.sessionStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

async function withMock<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (isMockMode()) return mock();
  return real();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function scanBrand(url: string, draft: OnboardingDraft): Promise<PublicBrandResult> {
  return withMock(
    () => endpoints.publicBrand(url),
    async () => {
      await wait(2600);
      return mockBrand(url, draft);
    },
  );
}

export async function suggestAudiences(draft: OnboardingDraft): Promise<SuggestedAudience[]> {
  return withMock(
    async () => (await endpoints.publicAudiences(draft)).audiences,
    async () => {
      await wait(1300);
      return kitFor(draft.business_type).audiences.map((a) => ({ ...a }));
    },
  );
}

/**
 * The research takes about 30 seconds. A 504 means the request gave up while the work
 * finished into the cache, so asking again is the right move (twice at most).
 */
export async function fetchPlanPreview(draft: OnboardingDraft, brand: PublicBrand | null): Promise<PlanPreview> {
  return withMock(
    () => retrying(() => endpoints.publicPlanPreview(draft)),
    async () => {
      await wait(4200);
      return mockPlanPreview(draft, brand);
    },
  );
}

export type LinkErrors = Partial<Record<LinkKey, string>>;

/** Hebrew error per link field, from `POST /public/links` (no model call), or locally. */
export async function validateLinks(links: OnboardingDraft["links"]): Promise<LinkErrors> {
  const filled = Object.fromEntries(Object.entries(links).filter(([, v]) => v && v.trim())) as OnboardingDraft["links"];
  if (!Object.keys(filled).length) return {};
  return withMock(
    async () => (await endpoints.publicLinks(filled)).errors ?? {},
    () => {
      const errors: LinkErrors = {};
      if (filled.website && !looksLikeUrl(filled.website)) errors.website = "הכתובת לא נראית שלמה. למשל: myshop.co.il";
      for (const net of ["instagram", "tiktok"] as const) {
        const handle = normalizeHandle(filled[net] ?? "");
        if (filled[net] && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) errors[net] = "שם משתמש באנגלית, ספרות, נקודה או קו תחתון.";
      }
      return errors;
    },
  );
}

/** The long model calls: a 504 means the work finished into the cache, so ask again (twice at most). */
async function retrying<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 504) || attempt >= 2) throw err;
      await wait(1500);
    }
  }
}

/**
 * "משהו אחר? ספרו לנו": the two directions again, with the owner's words.
 * Not in the Revision 4 contract yet: sent as `feedback` next to the draft (the API
 * ignores unknown keys today, so an unchanged answer is possible and handled by the
 * screen). The same words always travel to `/public/strategy` as `inputs.feedback`.
 */
export async function revisePlan(draft: OnboardingDraft, feedback: string, brand: PublicBrand | null): Promise<PlanPreview> {
  return withMock(
    () =>
      retrying(() =>
        api<PlanPreview>("/public/plan-preview", { method: "POST", body: JSON.stringify({ draft, feedback }) }),
      ),
    async () => {
      await wait(2600);
      return mockRevisedPlan(draft, brand, feedback);
    },
  );
}

/** The chosen direction in the shape the API takes. */
export function chosenDirectionOf(flow: FlowState): PlanDirection | null {
  // There is no separate "pick a direction" step: the plan starts from the first
  // direction, and the plan screen offers the other one.
  const index = flow.chosenDirection ?? 0;
  return flow.plan ? (flow.plan.directions[index] ?? flow.plan.directions[0] ?? null) : null;
}

/* --------------------------- The 3-month plan --------------------------- */

/**
 * What a plan was computed from, apart from what the owner shapes on the plan itself.
 * The target lives in the draft (`success.target`) but travels as `inputs.target`, so a
 * changed target is an update ("מה השתנה"), not a new plan.
 */
export function planBase(flow: FlowState): string {
  const draft = draftForApi(flow);
  if (draft.success) draft.success = { kpi: draft.success.kpi };
  // The revision 6 target travels as `inputs.target` too: a new target updates the plan.
  delete draft.target;
  return signature([draft, chosenDirectionOf(flow), flow.directionFeedback?.trim() || ""]);
}

/** The owner's shaping as sent: the target from the draft, the feedback from both screens. */
export function planInputsForApi(flow: FlowState): PlanInputs {
  const raw = flow.planInputs ?? {};
  const out: PlanInputs = {};
  const target = (targetText(flow.draft.target) || flow.draft.success?.target || "").trim();
  if (target) out.target = target.slice(0, 120);
  if (raw.cadence) out.cadence = raw.cadence;
  if (raw.primary_audience?.trim()) out.primary_audience = raw.primary_audience.trim();
  const feedback = [flow.directionFeedback?.trim(), flow.planFeedback?.trim()].filter(Boolean).join("\n");
  if (feedback) out.feedback = feedback.slice(0, 600);
  return out;
}

/**
 * `POST /public/quarter-plan` (Revision 5). `inputs.changed` names what this request
 * changes, so the API can say "מה השתנה" about exactly that.
 */
export async function fetchQuarterPlan(
  draft: OnboardingDraft,
  direction: PlanDirection,
  inputs: PlanInputs,
  context: { insights?: PlanInsight[]; previous?: QuarterPlan | null } = {},
): Promise<QuarterPlan> {
  return withMock(
    () =>
      retrying(() =>
        api<QuarterPlan>("/public/quarter-plan", {
          method: "POST",
          body: JSON.stringify({ draft, direction, inputs, ...(context.insights?.length ? { insights: context.insights } : {}) }),
        }),
      ),
    async () => {
      await wait(inputs.changed?.length ? 1400 : 4200);
      const { mockQuarterPlan } = await import("./quarterPlanMock");
      return mockQuarterPlan(draft, direction, inputs, context.insights ?? []);
    },
  );
}

/**
 * "היעד ל-3 חודשים" (revision 6): `POST /public/target-suggestion`. Deterministic on the
 * server (no model), so it is asked again whenever a number changes.
 */
export async function fetchTargetSuggestion(draft: OnboardingDraft): Promise<TargetSuggestion> {
  return withMock(
    () => api<TargetSuggestion>("/public/target-suggestion", { method: "POST", body: JSON.stringify({ draft }) }),
    async () => {
      await wait(300);
      const model = draft.business_model ?? inferBusinessModel(draft.business_type, draft.offerings);
      return mockTargetSuggestion({
        model,
        grow: draft.grow_where,
        baseline: draft.baseline,
        lever: draft.lever,
        budgetIls: budgetIls(draft.budget),
        hasSite: Boolean(draft.links.website),
        slowMonths: draft.seasons?.slow ?? [],
      });
    },
  );
}

/**
 * "מה ייחשב הצלחה?": `GET /public/success-options`. The query says who is asking; when the
 * API answers with one list for everyone, the `models` / `grow_where` fields filter it.
 */
export async function fetchSuccessOptions(draft: OnboardingDraft): Promise<SuccessOption[]> {
  const model = draft.business_model ?? inferBusinessModel(draft.business_type, draft.offerings);
  const grow = model === "services" ? undefined : draft.grow_where;
  return withMock(
    async () => {
      const query = new URLSearchParams({ model });
      if (grow) query.set("grow_where", grow);
      const res = await api<{ options: (SuccessOption & { description_he?: string })[] }>(
        `/public/success-options?${query.toString()}`,
      );
      return (res.options ?? [])
        .filter(
          (o) =>
            o.key &&
            o.name_he &&
            (!o.models?.length || o.models.includes(model)) &&
            (!grow || !o.grow_where?.length || o.grow_where.includes(grow)),
        )
        .map((o) => ({ ...KPI_UNITS[o.key], ...o, hint_he: o.hint_he ?? o.description_he }));
    },
    async () => {
      await wait(500);
      const { mockSuccessOptions } = await import("./quarterPlanMock");
      return mockSuccessOptions(model, grow, Boolean(draft.links.website));
    },
  );
}

/**
 * The PrimaryGoal a KPI stands for (the month planner and the old endpoints still read
 * `goal`). The option's own `goal` wins; otherwise a plain reading of the key.
 */
export function goalForKpi(kpi: string, model: BusinessModel, option?: SuccessOption | null): PrimaryGoal {
  const valid = (goal: PrimaryGoal) => goalsFor(model).some((g) => g.key === goal);
  if (option?.goal && valid(option.goal)) return option.goal;
  const guess: PrimaryGoal = /aware|know|local/.test(kpi)
    ? model === "services"
      ? "personal_brand"
      : "brand_awareness"
    : /order|sale|visit|store|shop/.test(kpi)
      ? "sales"
      : "leads";
  return valid(guess) ? guess : defaultGoalFor(model);
}

/** In mock mode only: the plan the owner saved, for /strategy to show after signup. */
const MOCK_PLAN_KEY = "isramarket_plan_mock";

export function stashMockPlan(plan: QuarterPlan | null) {
  if (!isMockMode() || !plan) return;
  try {
    window.sessionStorage.setItem(MOCK_PLAN_KEY, JSON.stringify(planForApi(plan)));
  } catch {
    // Nothing to keep.
  }
}

export function mockStoredPlan(): StoredQuarterPlan | null {
  if (!isMockMode()) return null;
  try {
    const raw = window.sessionStorage.getItem(MOCK_PLAN_KEY);
    return raw ? (JSON.parse(raw) as StoredQuarterPlan) : null;
  } catch {
    return null;
  }
}

/** Where the owner lands after the plan is saved: the plan itself. */
export const AFTER_SAVE = "/strategy?welcome=1";

/**
 * Turn the flow into the business: `from-draft` with the direction and the 3-month plan.
 * On 404 (the endpoint is not deployed yet) the same result is reached through the
 * existing endpoints: the profile (with the budget from /start), then the audiences.
 */
export async function saveFlowToAccount(flow: FlowState): Promise<Business | null> {
  const business = await saveDraft(flow);
  stashMockPlan(currentPlan(flow));
  return business;
}

/** The plan for the current answers and direction, not a stale one. */
export function currentPlan(flow: FlowState): QuarterPlan | null {
  return flow.quarterPlan && flow.quarterPlanFor === planBase(flow) ? flow.quarterPlan : null;
}

/**
 * After a finished save, or "להתחיל מחדש": nothing of the onboarding stays in this browser.
 * Photos are no longer picked before signup, but a browser that went through the earlier
 * flow may still hold some in IndexedDB: they go too.
 */
export async function clearSavedFlow() {
  clearFlow();
  await clearPending();
}

async function saveDraft(flow: FlowState): Promise<Business | null> {
  const draft = draftForApi(flow);
  const plan = currentPlan(flow);
  try {
    const res = await api<{ business: Business | null }>("/onboarding/from-draft", {
      method: "POST",
      body: JSON.stringify({
        draft,
        deferred_links: Object.fromEntries((flow.deferredLinks ?? []).map((key) => [key, flow.draft.links[key] ?? ""])),
        chosen_direction: chosenDirectionOf(flow),
        quarter_plan: plan ? planForApi(plan) : null,
      }),
    });
    return res.business;
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) throw err;
  }
  const model = draft.business_model ?? inferBusinessModel(draft.business_type, draft.offerings);
  const goal = draft.goal && goalsFor(model).some((g) => g.key === draft.goal) ? draft.goal : defaultGoalFor(model);
  const social: Record<string, string> = {};
  if (draft.links.instagram) social.instagram = `https://instagram.com/${draft.links.instagram}`;
  if (draft.links.tiktok) social.tiktok = `https://tiktok.com/@${draft.links.tiktok}`;
  if (draft.links.facebook) social.facebook = normalizeUrl(draft.links.facebook);
  const offerings = [draft.offerings, draft.differentiator ? `מה שמייחד אותנו: ${draft.differentiator}` : ""]
    .filter(Boolean)
    .join("\n");
  const { business } = await endpoints.saveProfile({
    name: draft.business_name,
    website_url: draft.links.website ?? "",
    business_type: draft.business_type,
    offerings,
    location: draft.city ?? "",
    business_model: model,
    social_links: social,
    monthly_budget_ils: budgetIls(draft.budget),
    competitors: (draft.competitors ?? []).map((c) => ({
      name: c.name,
      website_url: c.link && looksLikeUrl(c.link) ? normalizeUrl(c.link) : "",
    })),
    primary_goal: goal,
  });
  for (const [index, audience] of draft.audiences.entries()) {
    try {
      await endpoints.createAudience({
        name: audience.name,
        summary: audience.description,
        description: audience.description,
        needs: [],
        where: [],
        targeting: { interests: [], keywords: [], age_range: "", gender: "", geo: "" },
        priority: index === 0 ? "primary" : "secondary",
      });
    } catch {
      // Audiences are editable later from the business screen; the save must not fail on one.
    }
  }
  return business;
}

/* ------------------------------- Fixtures ------------------------------- */

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function mockBrand(url: string, draft: OnboardingDraft): PublicBrandResult {
  const host = hostOf(url);
  if (/fail|invalid|example\.org/.test(host)) {
    return { status: "failed", brand: null, reason_he: "האתר לא ענה בזמן." };
  }
  const preset = LOCAL_PRESETS[hash(host) % LOCAL_PRESETS.length];
  const offerings = draft.offerings
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    status: "ready",
    brand: {
      business_name: draft.business_name || host.split(".")[0],
      palette: preset.palette.map((swatch) => ({ ...swatch })),
      voice: "ישיר וחם, בגובה העיניים",
      logo_url: null,
      offerings,
    },
  };
}

export type IlDate = { date: string; name: string };

/** Enough of the Israeli calendar for the fixtures. The real API uses services/calendar_il.py. */
export const IL_DATES: IlDate[] = [
  { date: "2026-10-03", name: "שמחת תורה" },
  { date: "2026-11-11", name: "יום הרווקים" },
  { date: "2026-11-27", name: "בלאק פריידי" },
  { date: "2026-11-30", name: "סייבר מאנדיי" },
  { date: "2026-12-04", name: "חנוכה" },
  { date: "2026-12-31", name: "סוף השנה האזרחית" },
  { date: "2027-01-23", name: "ט״ו בשבט" },
  { date: "2027-03-23", name: "פורים" },
  { date: "2027-04-21", name: "פסח" },
  { date: "2027-06-11", name: "שבועות" },
  { date: "2027-07-01", name: "החופש הגדול" },
  { date: "2027-10-02", name: "ראש השנה" },
];

function nextIlDate(now = new Date()): { name: string; days: number } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const item of IL_DATES) {
    const days = Math.round((new Date(`${item.date}T00:00:00`).getTime() - today) / 86_400_000);
    if (days >= 3) return { name: item.name, days };
  }
  return null;
}

function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

export function monthsLabel(months: number[]): string {
  return joinHe([...months].sort((a, b) => a - b).map((m) => MONTHS_HE[m - 1]));
}

const NETWORK_HE: Record<Network, string> = { instagram: "אינסטגרם", facebook: "פייסבוק", tiktok: "טיקטוק" };

type Theme = {
  title: string;
  approach: string;
  why: string;
  steps: string[];
  ideas: Omit<PostIdea, "why" | "direction_index">[];
  reasons: string[];
};

function themesFor(goal: PrimaryGoal, d: OnboardingDraft, event: string): [Theme, Theme] {
  const name = d.business_name || "העסק";
  const offer = firstOffering(d.offerings) || "מה שאתם עושים";
  const diff = d.differentiator?.trim();
  const when = event || "סוף החודש";
  const sales: [Theme, Theme] = [
    {
      title: "להראות את המוצר מקרוב",
      approach: "כל שבוע מוצר אחד בפוקוס, עם דרך ברורה להזמין.",
      why: diff ? `את מה שמייחד אתכם (${diff}) רואים הכי טוב במוצר עצמו.` : "אנשים קונים את מה שהם רואים מקרוב.",
      steps: ["לבחור 4 מוצרים לחודש", "לצלם כל אחד מקרוב, באור טבעי", "לסיים כל פוסט בדרך להזמין"],
      ideas: [
        {
          title: `${offer} מקרוב`,
          format: "reel",
          hook: `ככה נראה ${offer} שלנו מקרוב`,
          caption: `בלי פילטרים ובלי סטודיו. ${offer}, כמו שהוא יוצא אצלנו ב${name}.`,
          cta: "להזמין בהודעה",
          overlay_headline: `${offer}, מקרוב`,
        },
        {
          title: "איך מזמינים",
          format: "carousel",
          hook: "3 צעדים וזה אצלכם",
          caption: "בוחרים, שולחים הודעה, ואנחנו מתאמים איסוף או משלוח. פשוט.",
          cta: "לשלוח הודעה",
          overlay_headline: "3 צעדים וזה אצלכם",
        },
        {
          title: "מה לוקחים השבוע",
          format: "image",
          hook: `ההמלצה שלנו לקראת ${when}`,
          caption: `אם צריך משהו אחד לקראת ${when}, זה ${offer}. שווה להזמין מוקדם.`,
          cta: "לשריין עכשיו",
          overlay_headline: `לקראת ${when}`,
        },
      ],
      reasons: [
        "פוסט שמראה את המוצר מקרוב עונה על השאלה הראשונה: איך זה נראה.",
        "אנשים מוותרים כשלא ברור איך מזמינים. הפוסט הזה מוריד את המחסום.",
        `${when} היא סיבה טבעית לקנות, בלי להמציא מבצע.`,
      ],
    },
    {
      title: "סיבה לחזור",
      approach: `לפנות קודם למי שכבר קנה, עם הצעה אחת ברורה לקראת ${when}.`,
      why: "למכור שוב ללקוח קיים קל יותר מלהביא לקוח חדש.",
      steps: ["להכין הצעה אחת פשוטה", "לספר עליה בוואטסאפ וברשתות", "להזכיר שבוע לפני שהיא נגמרת"],
      ideas: [
        {
          title: "תודה ללקוחות",
          format: "image",
          hook: "לקוחות קבועים, זה בשבילכם",
          caption: `מי שכבר מכיר את ${name} יודע. לקראת ${when} שמרנו לכם משהו קטן.`,
          cta: "לשאול בהודעה",
          overlay_headline: "זה בשבילכם",
        },
        {
          title: "מה אמרו עלינו",
          format: "carousel",
          hook: "מה לקוחות כותבים לנו",
          caption: "צילומי מסך אמיתיים, באישור. בלי לערוך מילה.",
          cta: "לספר לנו גם",
          overlay_headline: "מה כותבים לנו",
        },
        {
          title: "תזכורת אחרונה",
          format: "story",
          hook: "נשארו עוד כמה ימים",
          caption: `ההצעה לקראת ${when} נגמרת בקרוב. מי שרצה, זה הזמן.`,
          cta: "לשריין עכשיו",
          overlay_headline: "עוד כמה ימים",
        },
      ],
      reasons: [
        "מי שכבר קנה מכם צריך רק תזכורת וסיבה.",
        "מילים של לקוחות אמיתיים משכנעות יותר מכל מה שנכתוב.",
        "תזכורת קרובה לסוף ההצעה מביאה את מי שדחה.",
      ],
    },
  ];
  const awareness: [Theme, Theme] = [
    {
      title: `הסיפור של ${name}`,
      approach: "מי אתם, איך זה נעשה ולמה. פוסטים שעושים היכרות.",
      why: "אנשים זוכרים סיפור יותר ממבצע.",
      steps: ["לספר איך הכול התחיל", "להראות יום עבודה רגיל", "להציג את האנשים בעסק"],
      ideas: [
        {
          title: "איך זה התחיל",
          format: "reel",
          hook: `ככה התחיל ${name}`,
          caption: "הרגע שבו החלטנו לפתוח, ומה למדנו מאז.",
          cta: "לעקוב אחרינו",
          overlay_headline: "ככה זה התחיל",
        },
        {
          title: "יום רגיל אצלנו",
          format: "story",
          hook: "בוקר רגיל, מאחורי הדלפק",
          caption: `מה קורה ב${name} לפני שהלקוחות מגיעים.`,
          cta: "לשלוח לנו שאלה",
          overlay_headline: "יום רגיל אצלנו",
        },
        {
          title: "מי אנחנו",
          format: "image",
          hook: "הפנים מאחורי העסק",
          caption: diff ? `${diff}. זה לא סלוגן, ככה אנחנו עובדים.` : "נעים להכיר. אלה האנשים שעושים את זה כל יום.",
          cta: "להגיד שלום",
          overlay_headline: "נעים להכיר",
        },
      ],
      reasons: [
        "סיפור ההתחלה הוא הפוסט שהכי קל לזכור.",
        "מאחורי הקלעים בונה אמון בלי לבקש כלום.",
        "אנשים קונים מאנשים. כאן רואים את מי.",
      ],
    },
    {
      title: "הכתובת בתחום",
      approach: `לענות על שאלות שאנשים שואלים על ${offer}, בפוסטים קצרים.`,
      why: "מי שעונה לשאלות נזכר ברגע שצריך.",
      steps: ["לאסוף 5 שאלות שלקוחות שואלים", "לענות על אחת בכל שבוע", "לבקש מהעוקבים לשאול עוד"],
      ideas: [
        {
          title: "השאלה ששואלים הכי הרבה",
          format: "reel",
          hook: "השאלה שכולם שואלים אותנו",
          caption: `ועל זה התשובה הקצרה. יש עוד שאלה על ${offer}? כתבו לנו.`,
          cta: "לשאול בתגובות",
          overlay_headline: "כולם שואלים",
        },
        {
          title: "טעות נפוצה",
          format: "carousel",
          hook: "3 טעויות שכדאי להכיר",
          caption: "דברים שאנחנו רואים כל שבוע, ואיך נמנעים מהם.",
          cta: "לשמור לפעם הבאה",
          overlay_headline: "3 טעויות נפוצות",
        },
        {
          title: "טיפ לשבוע",
          format: "image",
          hook: "טיפ אחד שיחסוך לכם זמן",
          caption: "קצר ושימושי. ככה עושים את זה נכון.",
          cta: "לשתף עם חבר",
          overlay_headline: "טיפ לשבוע",
        },
      ],
      reasons: [
        "שאלה אמיתית של לקוחות מבטיחה שהפוסט רלוונטי.",
        "תוכן ששומרים לפעם הבאה ממשיך להגיע לאנשים חדשים.",
        "טיפ שימושי הוא הדבר שהכי משתפים.",
      ],
    },
  ];
  const leads: [Theme, Theme] = [
    {
      title: "לענות לפני שפונים",
      approach: "פוסטים שמסבירים מה אתם עושים, איך זה עובד ואיך מתחילים.",
      why: "אנשים פונים כשהם מבינים מה יקרה אחרי הפנייה.",
      steps: ["לכתוב את 3 השאלות שהכי שואלים אתכם", "להסביר איך נראה התהליך", "לסיים בהזמנה לשלוח הודעה"],
      ideas: [
        {
          title: "איך זה עובד",
          format: "carousel",
          hook: "מה קורה אחרי שפונים אלינו",
          caption: "שיחה קצרה, הצעה ברורה, ומתחילים. בלי אותיות קטנות.",
          cta: "לשלוח הודעה",
          overlay_headline: "איך זה עובד",
        },
        {
          title: "שאלה ותשובה",
          format: "reel",
          hook: "הכי שואלים אותנו את זה",
          caption: `תשובה קצרה על ${offer}. לשאלה שלכם, שלחו הודעה.`,
          cta: "לשאול בהודעה",
          overlay_headline: "הכי שואלים",
        },
        {
          title: "למי זה מתאים",
          format: "image",
          hook: "זה בשבילכם אם…",
          caption: diff ? `${diff}. אם זה מה שחיפשתם, דברו איתנו.` : "3 סימנים שאנחנו מתאימים לכם.",
          cta: "לקבוע שיחה",
          overlay_headline: "זה בשבילכם אם…",
        },
      ],
      reasons: [
        "מי שמבין את התהליך פונה בלי לחשוש.",
        "תשובה לשאלה נפוצה חוסכת לכם שיחות ומביאה פניות רציניות.",
        "כשהלקוח מזהה את עצמו, הוא פונה.",
      ],
    },
    {
      title: "סיפורי לקוחות",
      approach: "לקוח אחד בכל שבוע: מה היה, מה עשיתם, מה השתנה.",
      why: "סיפור של לקוח אמיתי משכנע יותר מכל הבטחה.",
      steps: ["לבחור 3 לקוחות מרוצים", "לבקש מהם רשות ומשפט אחד", "להראות לפני ואחרי, כשאפשר"],
      ideas: [
        {
          title: "לפני ואחרי",
          format: "carousel",
          hook: "ככה זה היה, וככה זה נראה היום",
          caption: "לקוח אמיתי, באישור שלו. מה עשינו בדרך.",
          cta: "לשלוח הודעה",
          overlay_headline: "לפני ואחרי",
        },
        {
          title: "במילים של הלקוח",
          format: "image",
          hook: "מה שהלקוח כתב לנו",
          caption: "משפט אחד מלקוח מרוצה, בלי לערוך.",
          cta: "לקבוע שיחה",
          overlay_headline: "במילים שלהם",
        },
        {
          title: "הבעיה שפתרנו",
          format: "reel",
          hook: "הגיעו אלינו עם בעיה אחת",
          caption: "מה הייתה הבעיה, מה עשינו, ומה יצא מזה.",
          cta: "לספר לנו על שלכם",
          overlay_headline: "הבעיה שפתרנו",
        },
      ],
      reasons: [
        "תוצאה אמיתית היא ההוכחה שאנשים מחפשים לפני שהם פונים.",
        "מילים של לקוח משכנעות יותר משלכם.",
        "אנשים מזהים את הבעיה שלהם ומבינים שיש פתרון.",
      ],
    },
  ];
  const personal: [Theme, Theme] = [
    {
      title: "הידע שלכם, בקטן",
      approach: "טיפ אחד בכל שבוע מהניסיון שלכם, במילים פשוטות.",
      why: "מומחה הוא מי שנותן ערך לפני שמבקשים ממנו משהו.",
      steps: ["לרשום 5 טיפים שאתם נותנים ללקוחות", "להקליט אחד בסרטון קצר", "לפרסם באותו יום בכל שבוע"],
      ideas: [
        {
          title: "טיפ מהניסיון",
          format: "reel",
          hook: "משהו שלמדנו אחרי שנים בתחום",
          caption: "טיפ אחד, קצר, שאפשר להשתמש בו כבר היום.",
          cta: "לשמור לפעם הבאה",
          overlay_headline: "למדנו את זה בדרך הקשה",
        },
        {
          title: "מיתוס ואמת",
          format: "carousel",
          hook: "3 דברים שכולם בטוחים בהם, ולא נכונים",
          caption: `על ${offer}, בלי מילים גבוהות.`,
          cta: "לשתף עם חבר",
          overlay_headline: "מיתוס ואמת",
        },
        {
          title: "שאלו אותנו",
          format: "story",
          hook: "שאלו אותנו השבוע",
          caption: "תשובה קצרה לשאלה של עוקב. יש לכם שאלה? שלחו.",
          cta: "לשאול בהודעה",
          overlay_headline: "שאלו אותנו",
        },
      ],
      reasons: [
        "טיפ שימושי בונה מוניטין של מומחה.",
        "לשבור מיתוס מראה שאתם יודעים יותר מהממוצע.",
        "לענות לשאלה אמיתית מראה שאתם זמינים.",
      ],
    },
    {
      title: "מאחורי הקלעים",
      approach: "להראות איך אתם עובדים באמת: ההחלטות, הטעויות וההצלחות.",
      why: "אנשים בוחרים באדם שהם מרגישים שהם מכירים.",
      steps: ["לצלם רגע אחד מכל יום עבודה", "לספר על החלטה אחת שקיבלתם", "לשתף הצלחה של לקוח"],
      ideas: [
        {
          title: "יום עבודה",
          format: "reel",
          hook: "ככה נראה יום עבודה אצלנו",
          caption: "מהבוקר עד הלקוח האחרון, בלי עריכה מבריקה.",
          cta: "לעקוב אחרינו",
          overlay_headline: "יום עבודה",
        },
        {
          title: "החלטה קשה",
          format: "image",
          hook: "למה אמרנו לא ללקוח",
          caption: "לא כל עבודה מתאימה. ככה אנחנו בוחרים איפה להשקיע.",
          cta: "לספר מה אתם חושבים",
          overlay_headline: "למה אמרנו לא",
        },
        {
          title: "הצלחה קטנה",
          format: "story",
          hook: "רגע טוב מהשבוע",
          caption: "משהו קטן שהצליח, ולמה זה חשוב לנו.",
          cta: "לשלוח הודעה",
          overlay_headline: "רגע טוב",
        },
      ],
      reasons: [
        "סרטון אמיתי מיום עבודה עושה היכרות בלי מילים.",
        "להגיד לא מראה שיש לכם עקרונות, ואנשים מעריכים את זה.",
        "הצלחה קטנה ואמיתית משכנעת יותר מהבטחה גדולה.",
      ],
    },
  ];
  if (goal === "brand_awareness") return awareness;
  if (goal === "leads") return leads;
  if (goal === "personal_brand") return personal;
  return sales;
}

const GOAL_HE: Record<PrimaryGoal, string> = {
  sales: "מכירות",
  brand_awareness: "חשיפה",
  leads: "פניות",
  personal_brand: "מיתוג אישי",
};

function mockPlanPreview(d: OnboardingDraft, brand: PublicBrand | null): PlanPreview {
  const model = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  const goal: PrimaryGoal = d.goal ?? defaultGoalFor(model);
  const kit = kitFor(d.business_type);
  const next = nextIlDate();
  const event = next && next.days <= 75 ? next.name : "";
  const audienceNames = d.audiences.map((a) => a.name).filter(Boolean);
  const aud = (i: number) => audienceNames[i] ?? audienceNames[0] ?? kit.audiences[i]?.name ?? "לקוחות מהאזור";

  const insights: PlanInsight[] = [];
  if (brand && brand.offerings.length) {
    insights.push({
      text_he: `באתר ראינו ${joinHe(brand.offerings.slice(0, 2))}. נשתמש בצבעים ובסגנון שכבר יש לכם.`,
      source: "site",
    });
  }
  if (d.differentiator?.trim()) {
    insights.push({
      text_he: `מה שמבדיל אתכם: ${d.differentiator.trim()}. זה יופיע בכל פוסט, לא רק באחד.`,
      source: "answers",
    });
  }
  if (next) {
    const nextMonth = new Date(Date.now() + next.days * 86_400_000).getMonth() + 1;
    const busy = d.seasons?.busy.includes(nextMonth);
    insights.push({
      text_he: `${next.name} בעוד ${next.days} ימים. ${busy ? "זו העונה החזקה שלכם, אז מתחילים להתכונן עכשיו." : "זו סיבה טובה להזכיר את עצמכם."}`,
      source: "calendar",
    });
  }
  const regular = (Object.entries(d.activity ?? {}) as [Network, Activity][]).find(([, a]) => a === "regular");
  if (regular) {
    insights.push({
      text_he: `אתם כבר מפרסמים ב${NETWORK_HE[regular[0]]} באופן קבוע. נבנה על זה, לא נתחיל מאפס.`,
      source: "social",
    });
  } else if (d.tried?.what_worked?.trim()) {
    insights.push({ text_he: `סיפרתם שהצליח: ${d.tried.what_worked.trim()}. נעשה מזה עוד.`, source: "answers" });
  }
  insights.push({ text_he: kit.industry, source: "category" });

  const themes = themesFor(goal, d, event);
  const directions: PlanDirection[] = themes.map((theme, index) => ({
    title: theme.title,
    approach_he: theme.approach,
    audience: aud(index === 0 ? 0 : 2),
    goal_he: GOAL_HE[goal],
    why_he: theme.why,
    first_steps: theme.steps,
  }));
  const timings = [
    "בשבוע הראשון, לפתוח את החודש",
    event ? `לפני ${event}` : "לקראת סוף השבוע",
    "באמצע החודש, כשיש שקט",
  ];
  const ideas: PostIdea[] = themes.flatMap((theme, dirIndex) =>
    theme.ideas.map((idea, i) => ({
      ...idea,
      direction_index: dirIndex,
      why: {
        audience: aud(dirIndex === 0 ? i % Math.max(1, audienceNames.length) : 2),
        goal_he: GOAL_HE[goal],
        timing_he: timings[i],
        reason_he: theme.reasons[i],
      },
    })),
  );
  return { insights: insights.slice(0, 4), directions, ideas, brand };
}

/* ------------------------ Fixtures: revised directions ------------------------ */

function quoteShort(text: string, max = 70): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function mockRevisedPlan(d: OnboardingDraft, brand: PublicBrand | null, feedback: string): PlanPreview {
  const base = mockPlanPreview(d, brand);
  const words = quoteShort(feedback);
  const first = base.directions[0];
  const own: PlanDirection = {
    title: "הכיוון שלכם",
    approach_he: `לבנות את החודש סביב מה שביקשתם: "${words}".`,
    audience: first.audience,
    goal_he: first.goal_he,
    why_he: "אתם מכירים את העסק הכי טוב. נבנה את זה על מה שגילינו, ונמדוד אם זה עובד.",
    first_steps: ["לחדד יחד את הרעיון במשפט אחד", "לבחור 3 נושאים שמשרתים אותו", "לבדוק אחרי שבועיים מה הביא תגובות"],
  };
  // The owner's idea first, next to the stronger of the two we had.
  const directions = [own, first];
  const ideas = [
    ...base.ideas.filter((i) => (i.direction_index ?? 0) === 0).map((i) => ({ ...i, direction_index: 0 })),
    ...base.ideas.filter((i) => (i.direction_index ?? 0) === 0).map((i) => ({ ...i, direction_index: 1 })),
  ];
  return { ...base, directions, ideas };
}
