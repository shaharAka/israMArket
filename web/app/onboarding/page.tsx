"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell, Button, ErrorNote } from "@/components/AppShell";
import {
  endpoints,
  isDemo,
  type Business,
  type BusinessModel,
  type Competitor,
  type OnboardingPayload,
  type PrimaryGoal,
} from "@/lib/api";
import {
  BUSINESS_MODEL_OPTIONS,
  DEFAULT_BUSINESS_MODEL,
  defaultGoalFor,
  isGoalValidFor,
} from "@/lib/businessModel";
import { BUDGET_STAGES, formatNis, stageFor } from "@/lib/budget";
import { toast } from "@/lib/ui";
import { useMonthBuild } from "@/lib/useMonthBuild";
import { BUSINESS_FIELDS, MODEL_SHORT, PRESENCE_MODELS } from "@/components/onboarding/constants";
import { coerceField, resolveField } from "@/lib/businessFields";
import { GenerationProgress } from "@/components/onboarding/GenerationProgress";
import {
  fetchSitePreview,
  loadPreview,
  looksLikeWebsite,
  normalizeWebsite,
  saveInstagramHandles,
  savePreview,
  siteFromLocation,
  type PresenceType,
  type SitePreview,
} from "@/components/onboarding/preview";

/**
 * First run: three short questions, then the month is built.
 *
 * The old wizard had seven steps (intro, business, diagnostics, budget, targets, quarter,
 * direction). Diagnostics, ranked targets, the quarterly plan and the month's direction
 * are decisions an owner can make later — the planner proposes its own when they are
 * missing, and they stay editable from /decisions and /plan. The goal defaults from the
 * business model (a shop is planned for sales, a service business for inquiries).
 */
const STEPS = ["העסק", "התקציב", "המתחרים"] as const;

const MAX_COMPETITORS = 3;
const MAX_HANDLES = 5;

type ScanState = "idle" | "reading" | "done" | "failed";

function splitHandles(text: string): string[] {
  return text
    .split(/[\s,،;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The month is built on the server (lib/useMonthBuild.ts): this page starts it and shows
  // its progress, and a reload mid-build comes back to the progress, not to the form.
  const monthBuild = useMonthBuild({
    kind: "first_month",
    onDone: () => {
      toast("החודש מוכן");
      router.replace("/dashboard");
    },
  });
  const generating = monthBuild.running || monthBuild.starting;
  const generateStage = monthBuild.status?.running ? monthBuild.status.stage : "usp";
  const buildError = generating ? "" : monthBuild.error;

  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_FIELDS[0].key);
  const [offerings, setOfferings] = useState("");
  const [businessModel, setBusinessModel] = useState<BusinessModel>(DEFAULT_BUSINESS_MODEL);
  const [presenceType, setPresenceType] = useState<PresenceType>("brick_and_mortar");
  const [location, setLocation] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [goal, setGoal] = useState<PrimaryGoal>(() => defaultGoalFor(DEFAULT_BUSINESS_MODEL));
  const [budget, setBudget] = useState(4500);
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", website_url: "" }]);
  const [handlesText, setHandlesText] = useState("");
  const [savedHandles, setSavedHandles] = useState<string[]>([]);

  const [hasBrand, setHasBrand] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [previewNote, setPreviewNote] = useState("");
  const scanRef = useRef<{ url: string; promise: Promise<boolean> } | null>(null);
  const previewFor = useRef("");
  /** The site the stored brand was read from, so a changed URL is read again. */
  const brandSite = useRef("");

  /** Fill only what the owner has not typed: a guess never overwrites their answer. */
  function applyPreview(preview: SitePreview) {
    setName((current) => current || preview.business_name || "");
    setLocation((current) => current || preview.location || "");
    // The one-line summary reads like an answer; the raw list is often product names.
    setOfferings((current) => current || preview.offerings_summary || preview.offerings.slice(0, 4).join(", ") || "");
    // A preview stored before the field list changed may still hold an old label.
    const field = resolveField(preview.business_type, preview.offerings_summary);
    if (field) setBusinessType(field.key);
    if (preview.business_model) setBusinessModel(preview.business_model);
    if (preview.presence_type) setPresenceType(preview.presence_type);
  }

  /**
   * Prefill from the public preview when the owner did not come through the landing
   * page (or the stored one expired). It writes nothing, so it cannot race the profile
   * save — and it warms the API's cache, so the real scan after step 1 is quick.
   */
  function prefillFromSite(url: string) {
    const normalized = normalizeWebsite(url);
    if (!looksLikeWebsite(normalized) || previewFor.current === normalized) return;
    previewFor.current = normalized;
    const stored = loadPreview(normalized);
    if (stored) {
      applyPreview(stored);
      return;
    }
    setPreviewNote("קוראים את האתר וממלאים את הפרטים…");
    fetchSitePreview(normalized)
      .then((preview) => {
        savePreview(preview, normalized);
        applyPreview(preview);
        setPreviewNote("");
      })
      // Prefill is a convenience: on any failure the owner simply types the details.
      .catch(() => setPreviewNote(""));
  }

  /** The authenticated scan that stores the brand and the site's photos on the business.
   *  Started only once the business row exists (after step 1), and awaited before the
   *  month is built. */
  function startScan(url: string): Promise<boolean> {
    const normalized = normalizeWebsite(url);
    if (scanRef.current?.url === normalized) return scanRef.current.promise;
    setScanState("reading");
    const promise = endpoints
      .scanWebsite(normalized)
      .then(() => {
        brandSite.current = normalized;
        setHasBrand(true);
        setScanState("done");
        return true;
      })
      .catch(() => {
        setScanState("failed");
        return false;
      });
    scanRef.current = { url: normalized, promise };
    return promise;
  }

  useEffect(() => {
    if (isDemo()) {
      router.replace("/dashboard");
      return;
    }
    const site = siteFromLocation();
    const stored = loadPreview(site || undefined);
    endpoints
      .business()
      .then((res) => {
        const business: Business | null = res.business;
        if (business?.onboarding_complete) {
          router.replace("/dashboard");
          return;
        }
        // First run with no business yet: the conversation at /start builds it.
        if (!business) {
          router.replace(site ? `/start?site=${encodeURIComponent(site)}` : "/start");
          return;
        }
        // Built by /start (from-draft): the budget was asked there too (Revision 5), so
        // nothing is left to ask here. The plan page shows the stored plan and builds the
        // first month from it.
        const builtFromDraft = Boolean(business.owner_context || business.first_month_seed || business.quarter_plan);
        if ((builtFromDraft || new URLSearchParams(window.location.search).get("from") === "start") && business.name) {
          router.replace("/strategy");
          return;
        }
        // What the owner already saved wins over any guess from the site.
        if (stored) applyPreview(stored);
        const model = business?.business_model ?? stored?.business_model ?? DEFAULT_BUSINESS_MODEL;
        if (business?.name) setName(business.name);
        if (business?.business_type) setBusinessType(coerceField(business.business_type, business.offerings).key);
        if (business?.offerings) setOfferings(business.offerings);
        if (business?.location) setLocation(business.location);
        if (business?.business_model) setBusinessModel(business.business_model);
        if (business?.presence_type) setPresenceType(business.presence_type);
        if (business?.social_links) setSocialLinks(business.social_links);
        if (business?.monthly_budget_ils) setBudget(business.monthly_budget_ils);
        if (business?.primary_goal && isGoalValidFor(model, business.primary_goal)) {
          setGoal(business.primary_goal);
        } else {
          setGoal(defaultGoalFor(model));
        }
        if (business?.competitors?.length) {
          const rows = business.competitors.slice(0, MAX_COMPETITORS);
          setCompetitors(rows.length < MAX_COMPETITORS ? [...rows, { name: "", website_url: "" }] : rows);
        }
        const handles = business?.instagram_handles ?? [];
        if (handles.length) {
          setSavedHandles(handles);
          setHandlesText(handles.map((item) => `@${item}`).join(" "));
        }
        setHasBrand(Boolean(business?.brand_language));
        if (business?.brand_language) {
          setScanState("done");
          brandSite.current = normalizeWebsite(business.website_url || "");
        }

        const url = business?.website_url || site || stored?.url || "";
        if (url) setWebsite(url);
        if (url && !stored && !business?.name) prefillFromSite(url);
        if (stored) previewFor.current = normalizeWebsite(url);
      })
      .catch(() => {
        if (stored) applyPreview(stored);
        const url = site || stored?.url || "";
        if (url) setWebsite(url);
      });
    // Runs once on mount; the helpers only touch state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function changeBusinessModel(next: BusinessModel) {
    setBusinessModel(next);
    // A goal the model does not offer is a 422 from the API; repair it with the model.
    setGoal((current) => (isGoalValidFor(next, current) ? current : defaultGoalFor(next)));
  }

  function profilePayload(): OnboardingPayload {
    return {
      name: name.trim(),
      website_url: normalizeWebsite(website),
      business_type: businessType,
      offerings: offerings.trim(),
      location: location.trim(),
      business_model: businessModel,
      presence_type: presenceType,
      social_links: socialLinks,
      monthly_budget_ils: Math.max(0, Math.round(budget || 0)),
      competitors: competitors
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          website_url: item.website_url.trim() ? normalizeWebsite(item.website_url) : "",
        })),
      primary_goal: isGoalValidFor(businessModel, goal) ? goal : defaultGoalFor(businessModel),
    };
  }

  function goTo(next: number) {
    setError("");
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  async function saveBusiness() {
    setError("");
    if (!looksLikeWebsite(website)) {
      setError("מהאתר נלמד את הצבעים והסגנון. הזינו את הכתובת, למשל myshop.co.il");
      return;
    }
    if (name.trim().length < 2) {
      setError("מה שם העסק?");
      return;
    }
    if (offerings.trim().length < 2) {
      setError("כתבו במשפט קצר מה אתם מוכרים או מציעים.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload());
      const url = normalizeWebsite(website);
      // A changed site means the stored brand belongs to the old one: read the new one.
      if (!hasBrand || brandSite.current !== url) {
        setHasBrand(false);
        void startScan(url);
      }
      goTo(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הפרטים. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBudget() {
    setError("");
    if (!Number.isFinite(budget) || budget < 0) {
      setError("הזינו סכום בשקלים, במספרים.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload());
      goTo(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את התקציב. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function buildMonth() {
    setError("");
    const handles = splitHandles(handlesText);
    if (handles.length > MAX_HANDLES) {
      setError(`אפשר להוסיף עד ${MAX_HANDLES} חשבונות אינסטגרם.`);
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload());
      if (handles.length || savedHandles.length) {
        const saved = await saveInstagramHandles(handles);
        setSavedHandles(saved.handles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור. נסו שוב.");
      setBusy(false);
      return;
    }

    // The month is written from the brand, so the site has to have been read first.
    // (A business from /start never reaches this: it is sent to /strategy on load.)
    if (!hasBrand && looksLikeWebsite(website)) {
      const url = normalizeWebsite(website);
      let ok = await startScan(url);
      if (!ok) {
        // One retry: a slow site often answers the second time.
        scanRef.current = null;
        ok = await startScan(url);
      }
      if (!ok) {
        setBusy(false);
        setError("לא הצלחנו לקרוא את האתר. בדקו את הכתובת בשלב הראשון ונסו שוב.");
        return;
      }
    }

    try {
      // Returns at once; the hook polls the server until the month is built (or stops).
      await monthBuild.start();
    } finally {
      setBusy(false);
    }
  }

  function updateCompetitor(index: number, patch: Partial<Competitor>) {
    setCompetitors((current) => {
      const next = current.map((item, i) => (i === index ? { ...item, ...patch } : item));
      const last = next[next.length - 1];
      if (last && last.name.trim() && next.length < MAX_COMPETITORS) next.push({ name: "", website_url: "" });
      return next;
    });
  }

  if (generating) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl space-y-4">
          <GenerationProgress stage={generateStage} businessName={name} />
          {error ? <ErrorNote message={error} /> : null}
        </div>
      </AppShell>
    );
  }

  const stage = stageFor(budget);

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-4">
        <StepHeader
          step={step}
          onBack={step > 0 ? () => goTo(step - 1) : undefined}
        />

        {step === 0 ? (
          <section className="space-y-4">
            <div>
              <h1 className="text-2xl font-black leading-tight text-[var(--ink)]">זה העסק שלכם?</h1>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">מילאנו ממה שראינו באתר. תקנו מה שצריך.</p>
            </div>

            <TextField
              label="כתובת האתר"
              value={website}
              onChange={setWebsite}
              onBlur={() => prefillFromSite(website)}
              placeholder="myshop.co.il"
              dir="ltr"
              inputMode="url"
              note={
                previewNote ||
                (scanState === "failed" ? "לא הצלחנו לקרוא את האתר. בדקו שהכתובת נכונה." : "")
              }
            />
            <TextField label="שם העסק" value={name} onChange={setName} autoComplete="organization" />
            <div>
              <label htmlFor="business-type" className="mb-1 block text-sm font-bold text-[var(--ink)]">
                התחום
              </label>
              <select
                id="business-type"
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--rule-dark)] bg-white px-3 text-base sm:text-sm"
              >
                {BUSINESS_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <TextField label="מה אתם מוכרים או מציעים" value={offerings} onChange={setOfferings} />

            <fieldset>
              <legend className="mb-1 text-sm font-bold text-[var(--ink)]">מוצרים או שירותים?</legend>
              <div className="grid grid-cols-3 gap-2">
                {BUSINESS_MODEL_OPTIONS.map((option) => (
                  <Chip
                    key={option.key}
                    label={MODEL_SHORT[option.key]}
                    title={option.desc}
                    selected={businessModel === option.key}
                    onClick={() => changeBusinessModel(option.key)}
                  />
                ))}
              </div>
            </fieldset>

            <details className="group">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-[var(--ink-soft)] underline underline-offset-4">
                עיר ואיך מגיעים אליכם
              </summary>
              <div className="mt-2 space-y-3">
                <TextField label="עיר או שכונה" value={location} onChange={setLocation} />
                <div className="grid grid-cols-3 gap-2">
                  {PRESENCE_MODELS.map((model) => (
                    <Chip
                      key={model.key}
                      label={model.title}
                      selected={presenceType === model.key}
                      onClick={() => setPresenceType(model.key)}
                    />
                  ))}
                </div>
              </div>
            </details>

            {error ? <ErrorNote message={error} /> : null}
            <Button onClick={() => void saveBusiness()} disabled={busy} className="min-h-12 w-full justify-center">
              {busy ? "שומרים…" : "להמשיך לתקציב"}
            </Button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4">
            <div>
              <h1 className="text-2xl font-black leading-tight text-[var(--ink)]">כמה תשקיעו בשיווק בחודש?</h1>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">הסכום קובע כמה פוסטים ואם שווה לשלם על פרסום.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {BUDGET_STAGES.map((option) => {
                const active = stage.key === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBudget(option.suggestion)}
                    className={`min-h-16 rounded-md border p-3 text-right text-[var(--ink)] ${
                      active ? "border-[var(--ink)] bg-[var(--primary-soft)] ring-1 ring-[var(--ink)]" : "border-[var(--rule)] bg-white"
                    }`}
                  >
                    <span className="block text-sm font-black">{option.title}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{option.range}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="budget" className="mb-1 block text-sm font-bold text-[var(--ink)]">
                או סכום מדויק
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="budget"
                  type="number"
                  inputMode="numeric"
                  value={Number.isFinite(budget) ? budget : ""}
                  min={0}
                  step={100}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  className="min-h-11 w-40 rounded-md border border-[var(--rule-dark)] bg-white px-3 text-base font-bold sm:text-sm"
                />
                <span className="text-sm font-bold text-[var(--ink-soft)]">₪ לחודש</span>
              </div>
            </div>

            <p className="text-sm leading-6 text-[var(--ink-soft)]">
              <span className="font-bold text-[var(--ink)]">{formatNis(budget)}: </span>
              {stage.buys}
            </p>

            {error ? <ErrorNote message={error} /> : null}
            <Button onClick={() => void saveBudget()} disabled={busy} className="min-h-12 w-full justify-center">
              {busy ? "שומרים…" : "להמשיך למתחרים"}
            </Button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div>
              <h1 className="text-2xl font-black leading-tight text-[var(--ink)]">מי המתחרים שלכם?</h1>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">לא חובה. נלמד מה עובד אצלם, בלי להעתיק.</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-bold text-[var(--ink)]">עסקים מתחרים</legend>
              {competitors.map((item, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <input
                    aria-label={`מתחרה ${index + 1}: שם`}
                    value={item.name}
                    onChange={(event) => updateCompetitor(index, { name: event.target.value })}
                    placeholder="שם"
                    className="min-h-11 rounded-md border border-[var(--rule-dark)] bg-white px-3 text-base sm:text-sm"
                  />
                  <input
                    aria-label={`מתחרה ${index + 1}: אתר`}
                    value={item.website_url}
                    onChange={(event) => updateCompetitor(index, { website_url: event.target.value })}
                    placeholder="אתר (לא חובה)"
                    dir="ltr"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-11 rounded-md border border-[var(--rule-dark)] bg-white px-3 text-base placeholder:text-right sm:text-sm"
                  />
                </div>
              ))}
            </fieldset>

            <TextField
              label="חשבונות אינסטגרם שכדאי ללמוד מהם"
              value={handlesText}
              onChange={setHandlesText}
              placeholder="@bakery_one @cafe_two"
              dir="ltr"
              note={`עד ${MAX_HANDLES}, עם רווח ביניהם. אפשר גם להדביק קישור לפרופיל.`}
            />

            {error || buildError ? <ErrorNote message={error || buildError} /> : null}
            <Button onClick={() => void buildMonth()} disabled={busy} className="min-h-12 w-full justify-center">
              {busy ? (scanState === "reading" ? "מסיימים לקרוא את האתר…" : "שומרים…") : "לבנות את החודש שלי"}
            </Button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function StepHeader({ step, onBack, lastStep }: { step: number; onBack?: () => void; lastStep?: boolean }) {
  // From /start only the budget is left, so "step 2 of 3" would be wrong.
  const label = lastStep ? `צעד אחרון · ${STEPS[step]}` : `שלב ${step + 1} מתוך ${STEPS.length} · ${STEPS[step]}`;
  const progress = lastStep ? 100 : ((step + 1) / STEPS.length) * 100;
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between">
        <p className="text-xs font-bold text-[var(--ink-soft)]">
          {label}
        </p>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center px-1 text-sm text-[var(--ink-soft)] underline underline-offset-4"
          >
            חזרה
          </button>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--rule)]">
        <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function Chip({
  label,
  title,
  selected,
  onClick,
}: {
  label: string;
  title?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      // Selected is an outline, not a dark fill: the page's one dark button is the ask.
      className={`min-h-11 rounded-md border px-2 text-sm font-bold text-[var(--ink)] ${
        selected ? "border-[var(--ink)] bg-[var(--primary-soft)] ring-1 ring-[var(--ink)]" : "border-[var(--rule-dark)] bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  dir,
  inputMode,
  autoComplete,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  inputMode?: "url" | "text";
  autoComplete?: string;
  note?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[var(--ink)]">{label}</span>
      {/* 16px on phones: iOS zooms into any field smaller than that. */}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        dir={dir}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={dir === "ltr" ? "none" : undefined}
        spellCheck={dir === "ltr" ? false : undefined}
        className="min-h-11 w-full rounded-md border border-[var(--rule-dark)] bg-white px-3 text-base sm:text-sm"
      />
      {note ? <span className="mt-1 block text-xs text-[var(--ink-soft)]">{note}</span> : null}
    </label>
  );
}
