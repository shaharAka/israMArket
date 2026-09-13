"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { SystemNote } from "@/components/SystemNote";
import {
  endpoints,
  isDemo,
  type GooglePromotionPayload,
  type KeywordIntent,
  type KeywordsPayload,
  type PromotionKeyword,
  type PromotionQuickWin,
} from "@/lib/api";
import { formatNis } from "@/lib/budget";
import {
  IconBell,
  IconChart,
  IconCheck,
  IconEye,
  IconLightbulb,
  IconLink,
  IconStore,
} from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";

const identity = SECTIONS.promotion;

const whole = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });

function messageOf(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function isRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

/**
 * Every figure on this screen arrives as a range, and stays one.
 *
 * A range the backend sent as `null` renders as a sentence instead of a number: the
 * published source does not have that figure, and filling the gap with something
 * confident is exactly the failure this screen exists to avoid. The formatters below
 * only ever read the two ends the API sent.
 */
function nisRange(value: unknown): string | null {
  if (!isRange(value)) return null;
  return `${whole.format(Math.round(value[0]))}–${formatNis(value[1])}`;
}

/** For prices where the decimals are the point: ₪3.5 a click must not render as ₪4. */
function nisRangePrecise(value: unknown): string | null {
  if (!isRange(value)) return null;
  const part = (amount: number) =>
    Number.isInteger(amount) ? whole.format(amount) : oneDecimal.format(amount);
  return `${part(value[0])}–${part(value[1])} ₪`;
}

function countRange(value: unknown): string | null {
  if (!isRange(value)) return null;
  return `${whole.format(Math.round(value[0]))}–${whole.format(Math.round(value[1]))}`;
}

function percentRange(value: unknown): string | null {
  if (!isRange(value)) return null;
  const asPercent = (part: number) => `${oneDecimal.format(Math.round(part * 1000) / 10)}%`;
  return `${asPercent(value[0])}–${asPercent(value[1])}`;
}

function singlePercent(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1000) / 10
    : undefined;
}

/**
 * Ranges are left-to-right inside a right-to-left sentence. Without isolating them the
 * dash and the שקל sign jump to the wrong side of the digits.
 */
function Figure({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums">
      {children}
    </span>
  );
}

/** The Hebrew labels come from the backend; only the colour and the why are ours. */
const INTENT_META: Record<KeywordIntent, { label: string; why: string; className: string }> = {
  transactional: {
    label: "כוונת קנייה",
    why: "מחפשים לקנות או להזמין עכשיו. אלה המילים ששוות כסף בפרסום.",
    className: "border-[#c7d6c2] bg-[#eaf0e6] text-[#374b3d]",
  },
  local: {
    label: "מקומי",
    why: "מחפשים מקום בסביבה. על אלה עונים הכרטיס בגוגל ותוצאות המפות — בחינם.",
    className: "border-[#c7dad7] bg-[#f0f6f5] text-[#2f5d57]",
  },
  commercial: {
    label: "בחינה והשוואה",
    why: "משווים אפשרויות לפני החלטה. מתאים לתוכן שמסביר למה דווקא אתם.",
    className: "border-[#e2d7c3] bg-[#fcf9f2] text-[#685f47]",
  },
  branded: {
    label: "מיתוג",
    why: "מחפשים אתכם בשם. את אלה כמעט אין צורך לקנות — הכרטיס והאתר כבר עונים.",
    className: "border-[#dedcd4] bg-[#f4f3ee] text-[#3c3e3a]",
  },
  informational: {
    label: "מידע",
    why: "לומדים נושא, לא קונים. בדרך כלל לא שווה לקנות את הקליקים האלה.",
    className: "border-[#e6e4dc] bg-[#f8f7f4] text-[#63665e]",
  },
  general: {
    label: "כללי",
    why: "לא זוהתה כוונה מובהקת מהמילים. אפשר לבנות מהן תוכן, אבל לא קמפיין.",
    className: "border-[#e6e4dc] bg-[#f8f7f4] text-[#63665e]",
  },
};

const INTENT_ORDER: KeywordIntent[] = [
  "transactional",
  "local",
  "commercial",
  "branded",
  "informational",
  "general",
];

const FALLBACK_INTENT = {
  label: "כללי",
  why: "לא זוהתה כוונה מובהקת מהמילים.",
  className: "border-[#e6e4dc] bg-[#f8f7f4] text-[#63665e]",
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  critical: { label: "קריטי", className: "border-[#eed1c9] bg-[#fbf2ef] text-[#9f4330]" },
  high: { label: "חשוב", className: "border-[#e2d7c3] bg-[#fcf9f2] text-[#685f47]" },
  medium: { label: "כדאי", className: "border-[#e6e4dc] bg-[#f8f7f4] text-[#63665e]" },
};

function IntentChip({ intent, label }: { intent: KeywordIntent; label?: string }) {
  const meta = INTENT_META[intent] ?? FALLBACK_INTENT;
  return (
    <span className={`label-mark ${meta.className}`} title={meta.why}>
      {label || meta.label}
    </span>
  );
}

/** One range, with the reasoning that produced it underneath. */
function RangeCard({
  label,
  value,
  basis,
  children,
}: {
  label: string;
  value: string | null;
  basis: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-[#e6e4dc] bg-white p-4">
      <span className="text-[11px] font-bold text-[#8b8e84]">{label}</span>
      {value ? (
        <p className="mt-1 text-2xl font-black tracking-tight text-[#20211f]">
          <Figure>{value}</Figure>
        </p>
      ) : (
        <p className="mt-1 text-sm font-bold text-[#8b8e84]">המקור לא מפרסם את הנתון הזה</p>
      )}
      <p className="mt-2 text-xs leading-5 text-[#63665e]">{basis}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function Metrics({ children }: { children: ReactNode }) {
  return <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">{children}</dl>;
}

function Metric({ label, value, suffix }: { label: string; value: number | undefined; suffix?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-[#8b8e84]">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-[#20211f]">
        {typeof value === "number" && Number.isFinite(value) ? (
          <Figure>
            {oneDecimal.format(value)}
            {suffix || ""}
          </Figure>
        ) : (
          <span className="text-[#8b8e84]">לא נמסר</span>
        )}
      </dd>
    </div>
  );
}

function FeeRow({
  label,
  amount,
  children,
  emphasis,
}: {
  label: string;
  amount: string | null;
  children?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 max-w-md">
        <span className={`text-sm ${emphasis ? "font-black" : "font-bold"} text-[#20211f]`}>{label}</span>
        {children ? <span className="mt-1 block text-xs leading-5 text-[#63665e]">{children}</span> : null}
      </div>
      <div className="text-left">
        {amount ? (
          <span className={`block ${emphasis ? "text-base" : "text-sm"} font-black text-[#20211f]`}>
            <Figure>{amount}</Figure>
          </span>
        ) : (
          <span className="text-xs font-bold text-[#8b8e84]">לא נמסר</span>
        )}
      </div>
    </li>
  );
}

function RetryButton({ onClick, label = "לנסות שוב" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex min-h-9 items-center rounded-md border border-[#dedcd4] bg-white px-3 text-xs font-bold text-[#20211f] transition-colors hover:bg-[#f8f7f4]"
    >
      {label}
    </button>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3">
      <p className="text-sm text-[#9f4330]">{message}</p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}

function SourceCard({
  title,
  active,
  statusLabel,
  note,
  detail,
  tone = "accent",
}: {
  title: string;
  active: boolean;
  statusLabel: string;
  note: string;
  detail?: ReactNode;
  tone?: "accent" | "warning";
}) {
  const activeColor = tone === "warning" ? "#685f47" : identity.accent;
  const style = active
    ? tone === "warning"
      ? { borderColor: "#e2d7c3", background: "#fcf9f2" }
      : { borderColor: identity.border, background: identity.surface }
    : { borderColor: "#e6e4dc", background: "#ffffff" };
  return (
    <div className="rounded-lg border p-4" style={style}>
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: active ? activeColor : "#b3b0a5" }}>
          {active ? <IconCheck className="h-4 w-4" /> : <span aria-hidden>·</span>}
        </span>
        <span className="text-sm font-black text-[#20211f]">{title}</span>
        <span className="label-mark border-[#e6e4dc] bg-white text-[#63665e]">{statusLabel}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#63665e]">{note}</p>
      {detail ? <p className="mt-2 text-[11px] text-[#8b8e84]">{detail}</p> : null}
    </div>
  );
}

/**
 * Promotion (קידום) — the Google side of the plan, which the product never had.
 *
 * Two rules shape this screen. First, no invented numbers: Google search volumes are not
 * available to us, every cost is a range, a range the backend sent as `null` stays a
 * sentence, and no column anywhere implies a volume we do not have. Second, the owner
 * must be able to see where each range comes from — every figure carries the reasoning
 * that produced it, and the assumptions and the published source sit at the bottom of
 * the section rather than in a footnote.
 */
export default function PromotionPage() {
  const [promotion, setPromotion] = useState<GooglePromotionPayload | null>(null);
  const [promotionError, setPromotionError] = useState("");
  const [promotionAttempt, setPromotionAttempt] = useState(0);
  const [keywords, setKeywords] = useState<KeywordsPayload | null>(null);
  const [keywordsError, setKeywordsError] = useState("");
  const [keywordsAttempt, setKeywordsAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    endpoints
      .googlePromotion()
      .then((payload) => {
        if (!active) return;
        setPromotion(payload);
        setPromotionError("");
      })
      .catch((err) => {
        if (active) setPromotionError(messageOf(err, "טעינת עלות הקידום בגוגל נכשלה"));
      });
    return () => {
      active = false;
    };
  }, [promotionAttempt]);

  useEffect(() => {
    let active = true;
    endpoints
      .keywords()
      .then((payload) => {
        if (!active) return;
        setKeywords(payload);
        setKeywordsError("");
      })
      .catch((err) => {
        if (active) setKeywordsError(messageOf(err, "טעינת המילים לקידום נכשלה"));
      });
    return () => {
      active = false;
    };
  }, [keywordsAttempt]);

  const plan = promotion?.plan ?? null;
  const profile = promotion?.business_profile ?? null;
  const kwSources = keywords?.sources;
  const searchConsoleConnected = keywords?.search_console_connected === true;
  const rows = keywords?.keywords ?? [];
  const quickWins = keywords?.quick_wins ?? [];
  const thresholds = keywords?.thresholds;
  // The backend names its own quick wins; the screen only marks the rows it named.
  const quickWinTerms = new Set(quickWins.map((win) => win.query));

  const rowsWithNumbers = rows
    .filter((row) => row.source !== "autocomplete")
    .sort((a, b) => {
      const quick = Number(quickWinTerms.has(b.term)) - Number(quickWinTerms.has(a.term));
      if (quick) return quick;
      return (b.impressions ?? 0) - (a.impressions ?? 0);
    });

  // Phrases with no numbers at all. Grouped by how close the searcher is to buying.
  const phraseRows = rows
    .filter((row) => row.source === "autocomplete")
    .sort((a, b) => {
      const byIntent = INTENT_ORDER.indexOf(a.intent) - INTENT_ORDER.indexOf(b.intent);
      if (byIntent) return byIntent;
      return a.term.localeCompare(b.term, "he");
    });

  // Only the intents that actually appear, with the backend's own Hebrew labels.
  const legend = INTENT_ORDER.filter((intent) => rows.some((row) => row.intent === intent)).map((intent) => ({
    intent,
    label: rows.find((row) => row.intent === intent)?.intent_label,
  }));

  const promotionLoading = !promotion && !promotionError;
  const keywordsLoading = !keywords && !keywordsError;
  const demo = isDemo();

  const budget = plan?.monthly_budget_ils;
  const floor = plan?.minimum_viable_budget;
  // Comparing the owner's budget with the floor the backend names is arithmetic on two
  // published figures, not a new figure — and it is the one comparison that decides
  // whether this campaign can run at all.
  const floorStatus =
    typeof budget === "number" && isRange(floor)
      ? budget < floor[0]
        ? {
            label: "מתחת לרצפה",
            text: "התקציב נמוך מהרצפה שפורסמה למגזר. מתחתיה אין מספיק דאטה כדי שגוגל תלמד, והמקור מתאר מעגל שבו התקציב נשרף בלי להשאיר נתונים.",
            className: "border-[#eed1c9] bg-[#fbf2ef] text-[#9f4330]",
          }
        : budget < floor[1]
          ? {
              label: "בחלק התחתון של הרצפה",
              text: "אפשר להתחיל, אבל זו נקודת פתיחה צרה: פחות מקום לטעויות ופחות דאטה ללמידה.",
              className: "border-[#e2d7c3] bg-[#fcf9f2] text-[#685f47]",
            }
          : {
              label: "מעל הרצפה",
              text: "התקציב מעל הרצפה שפורסמה למגזר, ולכן יש מקום גם ללמוד וגם לטעות.",
              className: "border-[#c7dad7] bg-[#f0f6f5] text-[#2f5d57]",
            }
      : null;

  const positionRange = thresholds?.quick_win_position;
  const minImpressions = thresholds?.quick_win_min_impressions;
  const periodDays = kwSources?.search_console?.period?.days;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          section="promotion"
          title="קידום בגוגל"
          subtitle="מה גוגל הייתה עולה לעסק הזה, על אילו מילים כדאי להופיע, ואיך מנצלים את מה שבחינם — הפרופיל העסקי בגוגל ובמפות."
        />

        {demo ? (
          <p
            className="mb-5 rounded-md border px-4 py-2 text-xs"
            style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}
          >
            מצב הדגמה — המחירים והמילים לדוגמה.
          </p>
        ) : null}

        {/* ---------- what Google would cost ---------- */}
        <section aria-labelledby="cost-heading">
          <div className="flex items-center gap-2">
            <span style={{ color: identity.accent }}>
              <IconChart className="h-4 w-4" />
            </span>
            <h2 id="cost-heading" className="text-sm font-black text-[#20211f]">
              כמה גוגל תעלה
            </h2>
          </div>

          {promotionLoading ? <LoadingMark label="מחשבים מה גוגל תעלה לעסק הזה…" /> : null}

          {promotionError ? (
            <div className="mt-4">
              <ErrorPanel
                message={promotionError}
                onRetry={() => {
                  setPromotion(null);
                  setPromotionError("");
                  setPromotionAttempt((attempt) => attempt + 1);
                }}
              />
            </div>
          ) : null}

          {!promotionLoading && !promotionError && !plan ? (
            <p className="mt-4 rounded-lg border border-[#e6e4dc] bg-white p-6 text-sm text-[#5e6159]">
              השרת לא החזיר תוכנית קידום. אין כאן מספרים שנמציא במקומה — אפשר לנסות שוב.
            </p>
          ) : null}

          {plan ? (
            <div className="mt-4 space-y-5">
              <div
                className="flex flex-wrap items-end justify-between gap-4 rounded-lg border p-5"
                style={{ borderColor: identity.border, background: identity.surface }}
              >
                <div className="min-w-0">
                  <span className="text-[11px] font-bold" style={{ color: identity.accent }}>
                    התחום שהותאם לעסק
                  </span>
                  <p className="mt-1 text-xl font-black text-[#20211f]">{plan.industry_label}</p>
                  {plan.matched_keywords?.length ? (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#5e6159]">
                      <span className="font-bold">זוהה לפי:</span>
                      {plan.matched_keywords.map((word) => (
                        <span key={word} className="label-mark border-[#c7dad7] bg-white">
                          {word}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {plan.sector_label ? (
                    <p className="mt-2 text-[11px] text-[#5e6159]">
                      שיעור ההמרה נלקח מהמגזר: <span className="font-bold">{plan.sector_label}</span>
                    </p>
                  ) : null}
                </div>
                <div className="text-left">
                  <span className="text-[11px] font-bold text-[#63665e]">תקציב המדיה החודשי</span>
                  <p className="mt-1 text-xl font-black text-[#20211f]">
                    {typeof budget === "number" ? (
                      <Figure>{formatNis(budget)}</Figure>
                    ) : (
                      <span className="text-sm font-bold text-[#8b8e84]">לא נמסר</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <RangeCard
                  label="מחיר לקליק (CPC)"
                  value={nisRangePrecise(plan.cpc_range)}
                  basis="מה שמשלמים על כל קליק בתום המכרז. המחיר נקבע לכל חיפוש בנפרד, ולכן הוא טווח ולא מספר אחד."
                />
                <RangeCard
                  label="קליקים בחודש"
                  value={countRange(plan.expected_clicks)}
                  basis="הגבול העליון של מה שתקציב המדיה יכול לקנות, חלקי טווח מחירי הקליק. זו לא תחזית של כמה אנשים מחפשים."
                />
                <RangeCard
                  label="שיעור המרה"
                  value={percentRange(plan.conversion_rate_range)}
                  basis="מהקליק לפנייה או להזמנה. הטווח נלקח מהשיעור שפורסם למגזר שלכם — הוא לא נמדד באתר שלכם."
                />
                <RangeCard
                  label={plan.conversion_unit ? `המרות בחודש — ${plan.conversion_unit}` : "המרות בחודש"}
                  value={countRange(plan.expected_conversions)}
                  basis="קליקים כפול שיעור ההמרה. זו תחזית שנבנתה מטווחים, לא הבטחה."
                />
                <RangeCard
                  label="עלות להמרה"
                  value={nisRange(plan.cost_per_conversion)}
                  basis="מחיר הקליק חלקי שיעור ההמרה. אם המספר הזה גבוה מהרווח שלכם על מכירה — גוגל לא משתלמת, וכדאי לדעת את זה מראש."
                />
                <RangeCard
                  label="רצפת תקציב למגזר"
                  value={nisRange(plan.minimum_viable_budget)}
                  basis="תקציב המדיה המינימלי שפורסם למגזר. מתחתיו אין מספיק דאטה כדי שגוגל תלמד ותאפטם."
                >
                  {floorStatus ? (
                    <div className={`rounded-md border px-3 py-2 ${floorStatus.className}`}>
                      <span className="text-[11px] font-black">{floorStatus.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-5">{floorStatus.text}</span>
                    </div>
                  ) : null}
                </RangeCard>
              </div>

              <div className="rounded-lg border border-[#e6e4dc] bg-white p-5">
                <h3 className="text-sm font-black text-[#20211f]">מה עוד נגבה, מעבר לתקציב המדיה</h3>
                <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                  תקציב המדיה הולך לגוגל עצמה. אלה העלויות של העבודה סביבו, מופרדות כדי שתראו את העלות האמיתית של
                  החודש — ולא רק את המספר שנשמע טוב.
                </p>
                <ul className="mt-3 divide-y divide-[#e6e4dc]">
                  <FeeRow label="עמלת ניהול, חודשית" amount={nisRange(plan.management_fee?.percent_amount_ils)}>
                    {plan.management_fee?.percent_label ? (
                      <span className="block">
                        <Figure>{plan.management_fee.percent_label}</Figure>
                        {nisRange(plan.management_fee?.flat_range_ils) ? (
                          <>
                            {" "}
                            או תשלום חודשי קבוע של{" "}
                            <Figure>{nisRange(plan.management_fee?.flat_range_ils)}</Figure>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                    {plan.management_fee?.note ? <span className="mt-1 block">{plan.management_fee.note}</span> : null}
                  </FeeRow>
                  <FeeRow label="הקמה חד־פעמית" amount={nisRange(plan.setup_fee)}>
                    העבודה שלפני שהקמפיין עולה לאוויר. נגבית פעם אחת, ולא חוזרת בכל חודש.
                  </FeeRow>
                  <FeeRow label="עלות חודשית כוללת (מדיה + ניהול)" amount={nisRange(plan.total_monthly_ils)} emphasis>
                    זה מה שיוצא בפועל בכל חודש, ולא רק מה שהולך לגוגל.
                  </FeeRow>
                  <FeeRow label="החודש הראשון (כולל הקמה)" amount={nisRange(plan.first_month_total_ils)} emphasis>
                    החודש הראשון תמיד היקר ביותר. אם הוא לא נכנס לתזרים, עדיף לדחות את ההתחלה.
                  </FeeRow>
                </ul>
              </div>

              {plan.warnings?.length ? (
                <div className="rounded-lg border border-[#eed1c9] bg-[#fbf2ef] p-5">
                  <h3 className="flex items-center gap-2 text-sm font-black text-[#9f4330]">
                    <IconBell className="h-4 w-4" />
                    <span id="warnings-heading">אזהרות שקוראים לפני שמתחילים</span>
                  </h3>
                  <ul aria-labelledby="warnings-heading" className="mt-3 space-y-3">
                    {plan.warnings.map((warning, index) => (
                      <li key={`${warning.slice(0, 24)}-${index}`} className="flex gap-3">
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#9f4330] text-[11px] font-black text-white"
                        >
                          {index + 1}
                        </span>
                        <span className="text-sm leading-6 text-[#7a3a2a]">{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-lg border p-5" style={{ borderColor: identity.border, background: identity.surface }}>
                <h3 className="flex items-center gap-2 text-sm font-black text-[#20211f]">
                  <span style={{ color: identity.accent }}>
                    <IconLightbulb className="h-4 w-4" />
                  </span>
                  מה עומד מאחורי המספרים
                </h3>

                {plan.assumptions?.length ? (
                  <ul className="mt-3 space-y-2">
                    {plan.assumptions.map((assumption, index) => (
                      <li
                        key={`${assumption.slice(0, 24)}-${index}`}
                        className="flex items-start gap-2 text-sm leading-6 text-[#3c3e3a]"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: identity.accent }}
                        />
                        {assumption}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-[#63665e]">
                    השרת לא צירף את ההנחות שמאחורי החישוב. בלי הן, אי אפשר לדעת מה הטווח מכסה.
                  </p>
                )}

                {plan.channel_comparison?.recommendation ? (
                  <p className="mt-4 rounded-md border border-[#e6e4dc] bg-white px-4 py-3 text-xs leading-6 text-[#3c3e3a]">
                    <span className="font-black">ולא רק גוגל: </span>
                    {plan.channel_comparison.recommendation}
                  </p>
                ) : null}

                {plan.source ? (
                  <a
                    href={plan.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4"
                    style={{ color: identity.accent }}
                  >
                    <IconLink className="h-4 w-4" />
                    {plan.source_title || "המקור שממנו נלקחו טווחי המחירים"}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* ---------- the terms worth targeting ---------- */}
        <section aria-labelledby="keywords-heading" className="mt-9">
          <div className="flex items-center gap-2">
            <span style={{ color: identity.accent }}>
              <IconEye className="h-4 w-4" />
            </span>
            <h2 id="keywords-heading" className="text-sm font-black text-[#20211f]">
              על אילו מילים כדאי להופיע
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8b8e84]">
            כל מילה כאן מגיעה ממקור אמיתי, וכתוב לידה מאיזה. מילים שהאתר שלכם כבר מופיע עליהן מגיעות עם חשיפות,
            קליקים ומיקום; מילים מהשלמת החיפוש של גוגל מגיעות בלי שום מספר — כי גוגל לא מפרסמת אותם.
          </p>

          {keywordsLoading ? <LoadingMark label="אוספים את המילים…" /> : null}

          {keywordsError ? (
            <div className="mt-4">
              <ErrorPanel
                message={keywordsError}
                onRetry={() => {
                  setKeywords(null);
                  setKeywordsError("");
                  setKeywordsAttempt((attempt) => attempt + 1);
                }}
              />
            </div>
          ) : null}

          {keywords && !keywordsError ? (
            <div className="mt-4 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <SourceCard
                  title="Search Console"
                  active={searchConsoleConnected}
                  statusLabel={searchConsoleConnected ? "מחובר" : "לא מחובר"}
                  note={kwSources?.search_console?.note || "השאילתות שהאתר שלכם כבר מופיע עליהן, עם מספרים אמיתיים."}
                  detail={
                    searchConsoleConnected && kwSources?.search_console?.site_url ? (
                      <>
                        הנכס בגוגל: <Figure>{kwSources.search_console.site_url}</Figure>
                      </>
                    ) : null
                  }
                />
                <SourceCard
                  title="השלמת החיפוש של גוגל"
                  active={kwSources?.autocomplete?.available === true}
                  statusLabel={kwSources?.autocomplete?.available ? "פעיל" : "לא זמין כרגע"}
                  note={kwSources?.autocomplete?.note || "מה שאנשים מקלידים בפועל. ביטויים, לא נפחים."}
                />
              </div>

              {/* The house rule, in the backend's own words: no volume column, anywhere.
                  This is the software explaining a limitation, so it wears the system
                  tone rather than a business surface. */}
              <SystemNote variant="panel" title="למה אין כאן נפח חיפוש">
                {kwSources?.search_volumes?.note ||
                  "אין לנו גישה לנפחי החיפוש של גוגל, ולכן אין כאן מספר חיפושים לאף מילה."}
              </SystemNote>

              {!searchConsoleConnected ? (
                <div className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] p-5">
                  <h3 className="text-sm font-black text-[#685f47]">מה היה מוסיף החיבור ל-Search Console</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5e5340]">
                    Search Console הוא הכלי החינמי של גוגל שמראה על אילו שאילתות האתר שלכם כבר מופיע — עם חשיפות,
                    קליקים ומיקום ממוצע. אלה הנתונים האמיתיים היחידים שאפשר להשיג על הביקוש בגוגל, ובלעדיהם נשארים
                    רק הביטויים.
                  </p>
                  <Link
                    href="/integrations"
                    className="mt-3 inline-flex min-h-9 items-center rounded-md border border-[#e2d7c3] bg-white px-3 text-xs font-bold text-[#685f47]"
                  >
                    למסך החיבורים
                  </Link>
                </div>
              ) : null}

              {quickWins.length ? (
                <div
                  className="rounded-lg border p-5"
                  style={{ borderColor: identity.border, background: identity.surface }}
                >
                  <h3 className="text-sm font-black text-[#20211f]">הזדמנויות מהירות — לפני שמוציאים שקל</h3>
                  <p className="mt-1 text-xs leading-5 text-[#5e6159]">
                    {isRange(positionRange) && typeof minImpressions === "number" ? (
                      <>
                        שאילתות במיקום <Figure>{`${oneDecimal.format(positionRange[0])}–${oneDecimal.format(positionRange[1])}`}</Figure>{" "}
                        עם לפחות <Figure>{whole.format(minImpressions)}</Figure> חשיפות: האתר כבר קרוב לעמוד הראשון,
                        ושיפור הכותרת או התוכן יכול להזיז אותו בלי לשלם על קליק.
                      </>
                    ) : (
                      "שאילתות שהאתר כבר כמעט מדורג בהן: שיפור הכותרת או התוכן יכול להזיז אותן בלי לשלם על קליק."
                    )}
                  </p>
                  <ul className="mt-3 space-y-3">
                    {quickWins.map((win: PromotionQuickWin, index) => (
                      <li
                        key={`${win.query}-${index}`}
                        className="rounded-lg border border-[#e6e4dc] bg-white px-4 py-3"
                      >
                        <span className="text-sm font-bold text-[#20211f]">{win.query}</span>
                        {win.why ? <p className="mt-1 text-xs leading-5 text-[#5e6159]">{win.why}</p> : null}
                        <Metrics>
                          <Metric label="חשיפות" value={win.impressions} />
                          <Metric label="קליקים" value={win.clicks} />
                          <Metric label="מיקום ממוצע" value={win.position} />
                          <Metric label="אחוז הקלקה" value={singlePercent(win.ctr)} suffix="%" />
                        </Metrics>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {rows.length ? (
                <div className="space-y-6">
                  {rowsWithNumbers.length ? (
                    <div>
                      <h3 className="text-sm font-black text-[#20211f]">
                        מילים עם מספרים אמיתיים — מ-Search Console
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                        אלה שאילתות שהאתר שלכם כבר הופיע עליהן
                        {typeof periodDays === "number" ? ` ב-${periodDays} הימים האחרונים` : ""}. המספרים מגוגל,
                        ולא מהערכה שלנו.
                      </p>
                      <ul className="mt-3 space-y-3">
                        {rowsWithNumbers.map((row: PromotionKeyword, index) => {
                          const quick = quickWinTerms.has(row.term);
                          return (
                            <li
                              key={`${row.term}-${index}`}
                              className="rounded-lg border p-4"
                              style={
                                quick
                                  ? { borderColor: identity.border, background: identity.surface }
                                  : { borderColor: "#e6e4dc", background: "#ffffff" }
                              }
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-[#20211f]">{row.term}</span>
                                <IntentChip intent={row.intent} label={row.intent_label} />
                                {quick ? (
                                  <span
                                    className="label-mark border-[#c7dad7] bg-white"
                                    style={{ color: identity.accent }}
                                  >
                                    הזדמנות מהירה
                                  </span>
                                ) : null}
                                {row.source === "autocomplete+search_console" ? (
                                  <span className="text-[11px] text-[#8b8e84]">נמצאה גם בהשלמות החיפוש</span>
                                ) : null}
                              </div>
                              <Metrics>
                                <Metric label="חשיפות" value={row.impressions} />
                                <Metric label="קליקים" value={row.clicks} />
                                <Metric label="מיקום ממוצע" value={row.position} />
                                <Metric label="אחוז הקלקה" value={singlePercent(row.ctr)} suffix="%" />
                              </Metrics>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {phraseRows.length ? (
                    <div>
                      <h3 className="text-sm font-black text-[#20211f]">
                        ביטויים מהשלמת החיפוש של גוגל — בלי נתוני נפח
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                        מילים שאנשים מקלידים בפועל, לפי מה שגוגל משלימה בזמן הקלדה. אין להן חשיפות, קליקים או מיקום,
                        ואין כאן עמודה שמעמידה פנים שיש.
                      </p>
                      <ul className="mt-3 divide-y divide-[#e6e4dc] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
                        {phraseRows.map((row: PromotionKeyword, index) => (
                          <li
                            key={`${row.term}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                          >
                            <span className="text-sm text-[#20211f]">{row.term}</span>
                            <span className="flex items-center gap-2">
                              <IntentChip intent={row.intent} label={row.intent_label} />
                              <span className="text-[11px] text-[#8b8e84]">אין נתוני נפח</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {legend.length ? (
                    <div className="rounded-lg border border-[#e6e4dc] bg-white p-4">
                      <span className="text-[11px] font-bold text-[#8b8e84]">איך לקרוא את הכוונות</span>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {legend.map((item) => (
                          <li key={item.intent} className="flex items-start gap-2">
                            <IntentChip intent={item.intent} label={item.label} />
                            <span className="text-xs leading-5 text-[#63665e]">
                              {(INTENT_META[item.intent] ?? FALLBACK_INTENT).why}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {keywords.seeds?.length ? (
                    <p className="text-[11px] leading-5 text-[#8b8e84]">
                      השלמות החיפוש נשאלו לפי מה שכתוב בפרופיל העסק:{" "}
                      <span className="text-[#63665e]">{keywords.seeds.slice(0, 4).join(" · ")}</span>
                      {keywords.seeds.length > 4 ? ` ועוד ${keywords.seeds.length - 4}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-[#e6e4dc] bg-white p-8 text-center">
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: identity.surface, color: identity.accent }}
                  >
                    <IconEye className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-black text-[#20211f]">עוד אין מילים לאסוף</h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5e6159]">
                    {searchConsoleConnected
                      ? "Search Console מחובר, אבל האתר עוד לא הופיע על שאילתות שאפשר לבנות עליהן תוכנית. זה משתנה ככל שגוגל סורקת את האתר."
                      : "כשנחבר את Search Console נוכל להראות על אילו שאילתות האתר שלכם כבר מופיע, עם קליקים ומיקום — בלי לנחש נפחים."}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* ---------- what is free ---------- */}
        <section aria-labelledby="profile-heading" className="mt-9">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ color: identity.accent }}>
              <IconStore className="h-4 w-4" />
            </span>
            <h2 id="profile-heading" className="text-sm font-black text-[#20211f]">
              {profile?.title || "הפרופיל העסקי בגוגל"}
            </h2>
            {profile?.free ? (
              <span className="label-mark border-[#c7dad7] bg-[#f0f6f5] text-[#2f5d57]">בחינם</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8b8e84]">
            {profile?.summary ||
              "המשטח היחיד בגוגל שהוא בחינם: הפרופיל שמופיע כשמחפשים את שם העסק, והוא מה שמאפשר לבקש ביקורות."}
          </p>
          {profile?.suggested_category_hint ? (
            <p className="mt-2 text-xs text-[#5e6159]">
              הקטגוריה הראשית שכדאי לבחור: <span className="font-black">{profile.suggested_category_hint}</span>
            </p>
          ) : null}

          {profile?.steps?.length ? (
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {profile.steps.map((step, index) => {
                const priority = PRIORITY_META[step.priority] ?? PRIORITY_META.medium;
                return (
                  <li
                    key={step.id || `${step.title}-${index}`}
                    className="flex flex-col rounded-lg border border-[#e6e4dc] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                        style={{ background: identity.accent }}
                      >
                        {index + 1}
                      </span>
                      <h3 className="text-sm font-black text-[#20211f]">{step.title}</h3>
                      <span className={`label-mark ${priority.className}`}>{priority.label}</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#3c3e3a]">
                      <span className="font-black text-[#20211f]">למה זה חשוב: </span>
                      {step.why}
                    </p>
                    {step.how?.length ? (
                      <div className="mt-2">
                        <span className="text-xs font-black text-[#20211f]">איך עושים:</span>
                        <ul className="mt-1 space-y-1">
                          {step.how.map((line, lineIndex) => (
                            <li
                              key={`${line.slice(0, 20)}-${lineIndex}`}
                              className="flex items-start gap-2 text-xs leading-5 text-[#3c3e3a]"
                            >
                              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#b3b0a5]" />
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 rounded-lg border border-[#e6e4dc] bg-white p-6 text-sm text-[#5e6159]">
              הצ׳קליסט של הפרופיל העסקי לא התקבל מהשרת. אפשר לנסות שוב מאוחר יותר — עד אז, הפרופיל עצמו נמצא בחיפוש
              בגוגל תחת שם העסק.
            </p>
          )}

          {profile?.notes?.length ? (
            <ul className="mt-3 space-y-1.5">
              {profile.notes.map((note, index) => (
                <li key={`${note.slice(0, 24)}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-[#8b8e84]">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c7c4b8]" />
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#deddd8] pt-5">
          <Link href="/integrations" className="text-sm font-bold text-[#20211f] underline underline-offset-4">
            לחיבור Search Console ולערוצים אחרים
          </Link>
          <Link href="/decisions" className="text-sm font-bold text-[#5e6159] underline underline-offset-4">
            לשינוי התקציב שממנו החישוב נבנה
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
