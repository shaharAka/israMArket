"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, Badge, Button, ErrorNote } from "@/components/AppShell";
import { TargetRanker, MAX_TARGETS } from "@/components/TargetRanker";
import {
  endpoints,
  generateUntilDone,
  isDemo,
  type BrandLanguage,
  type BusinessModel,
  type Competitor,
  type Diagnostics,
  type GrowthHypothesis,
  type GrowthTargetCandidate,
  type LongHorizonPlan,
  type OnboardingPayload,
  type PrimaryGoal,
} from "@/lib/api";
import {
  BUSINESS_MODEL_OPTIONS,
  DEFAULT_BUSINESS_MODEL,
  capacityCopy,
  defaultGoalFor,
  diagnosticQuestionsFor,
  goalsFor,
  isGoalValidFor,
  pruneDiagnostics,
} from "@/lib/businessModel";
import { IconCheck, IconCompass, IconFlag, IconStore } from "@/lib/icons";
import { AGENT_NAME } from "@/lib/agent";
import { BUDGET_STAGES, formatNis, stageFor } from "@/lib/budget";
import { toast } from "@/lib/ui";

const BUSINESS_TYPES = [
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

/** How customers reach the business. Worded so it reads sensibly for a shop and for a
 *  service provider who works from a studio or remotely. */
const PRESENCE_MODELS: {
  key: "brick_and_mortar" | "online_only" | "hybrid";
  title: string;
  desc: string;
}[] = [
  { key: "brick_and_mortar", title: "מקום פיזי / סניף", desc: "אנשים מגיעים אליכם או פוגשים אתכם פנים אל פנים" },
  { key: "online_only", title: "אונליין בלבד", desc: "הכל קורה מרחוק — באתר, בשיחת וידאו או בטלפון" },
  { key: "hybrid", title: "משולב", desc: "גם פגישה או ביקור, וגם פנייה מהאתר" },
];

/** The seven steps, in order. The label doubles as the promise each screen makes. */
const STEPS = [
  { key: "intro", label: "מה נעשה יחד", hint: "איך זה עובד ומה יקרה בכל שלב" },
  { key: "business", label: "העסק והאתר", hint: "נקרא את האתר וממלאים את הפרטים" },
  { key: "diagnostics", label: "אבחון מהיר", hint: "כמה שאלות קצרות שקובעות סדרי עדיפויות" },
  { key: "budget", label: "התקציב", hint: "כמה אתם משקיעים, ומה זה קונה" },
  { key: "targets", label: "היעדים שלכם", hint: "עד שלוש עדיפויות לרבעון, לפי סדר חשיבות" },
  { key: "quarter", label: "התוכנית הרבעונית", hint: "לאן הולכים ומה קורה בכל חודש" },
  { key: "direction", label: "הכיוון לחודש", hint: "בוחרים מאיפה מתחילים החודש" },
] as const;

const STAGE_LABELS: Record<string, string> = {
  scan: "קוראים את האתר ואת שפת המותג…",
  usp: "מנסחים את הכיוון והבידול…",
  plan: "בונים את תוכנית החודש…",
  posts: "כותבים את הפוסטים לשבועות 1–2…",
  posts_late: "כותבים את הפוסטים לשבועות 3–4…",
  done: "התוכנית מוכנה",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "צבע ראשי",
  accent: "צבע הדגשה",
  background: "רקע",
  ink: "טקסט",
  secondary: "משני",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [generateStage, setGenerateStage] = useState("");

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [offerings, setOfferings] = useState("");
  const [businessModel, setBusinessModel] = useState<BusinessModel>(DEFAULT_BUSINESS_MODEL);
  const [presenceType, setPresenceType] =
    useState<"brick_and_mortar" | "online_only" | "hybrid">("brick_and_mortar");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [instagramLink, setInstagramLink] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [brand, setBrand] = useState<BrandLanguage | null>(null);
  const [paletteNote, setPaletteNote] = useState("");

  // One object instead of a hook per answer: the questions themselves now come from
  // `lib/businessModel`, so the answers have to move as a set when the model changes.
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [capacity, setCapacity] = useState("");

  const [targetCandidates, setTargetCandidates] = useState<GrowthTargetCandidate[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [rankedTargets, setRankedTargets] = useState<string[]>([]);
  const [plan, setPlan] = useState<LongHorizonPlan | null>(null);

  const [budget, setBudget] = useState(4500);
  const [goal, setGoal] = useState<PrimaryGoal>(() => defaultGoalFor(DEFAULT_BUSINESS_MODEL));
  const [hypotheses, setHypotheses] = useState<GrowthHypothesis[]>([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", website_url: "" }]);

  useEffect(() => {
    if (isDemo()) {
      router.replace("/dashboard");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fromLanding = params.get("website") || "";
    endpoints
      .business()
      .then((res) => {
        const business = res.business;
        if (business?.onboarding_complete) {
          router.replace("/dashboard");
          return;
        }
        const loadedModel = business?.business_model ?? DEFAULT_BUSINESS_MODEL;
        if (business?.name) setName(business.name);
        if (business?.business_type) setBusinessType(business.business_type);
        if (business?.offerings) setOfferings(business.offerings);
        if (business?.location) setLocation(business.location);
        if (business?.business_model) setBusinessModel(loadedModel);
        if (business?.presence_type) setPresenceType(business.presence_type);
        if (business?.website_url) setWebsite(business.website_url);
        if (business?.social_links?.instagram) setInstagramLink(business.social_links.instagram);
        if (business?.social_links?.whatsapp) setWhatsappLink(business.social_links.whatsapp);
        if (business?.brand_language) setBrand(business.brand_language);
        if (business?.monthly_budget_ils) setBudget(business.monthly_budget_ils);
        // The goal the API already stored is kept when it still fits the model, so a
        // resumed wizard does not silently overwrite the owner's earlier choice.
        if (business?.primary_goal && isGoalValidFor(loadedModel, business.primary_goal)) {
          setGoal(business.primary_goal);
        }
        // Resume a partly finished wizard instead of asking again.
        const saved = business?.diagnostics;
        if (saved) {
          // Pruned on the way in too: a saved answer from another model must not reappear
          // as if it had been answered for this one.
          setDiagnostics(pruneDiagnostics(loadedModel, saved));
          if (saved.capacity_constraint) setCapacity(saved.capacity_constraint);
        }
        // Sliced because rows saved before the three-priority cap could hold more, and
        // the profile endpoint rejects a longer list outright.
        if (business?.growth_targets?.length) {
          setRankedTargets(business.growth_targets.slice(0, MAX_TARGETS));
        }
        if (business?.long_horizon_plan) setPlan(business.long_horizon_plan);
        if (!business?.website_url && fromLanding) setWebsite(fromLanding);
      })
      .catch(() => {
        if (fromLanding) setWebsite(fromLanding);
      });
  }, [router]);

  function diagnosticsPayload(): Diagnostics {
    return { ...diagnostics, capacity_constraint: capacity };
  }

  /** Every step re-sends the whole profile, so the payload is built in one place. */
  function profilePayload(extra: Partial<OnboardingPayload> = {}): OnboardingPayload {
    return {
      name,
      website_url: website,
      business_type: businessType,
      offerings,
      location,
      business_model: businessModel,
      presence_type: presenceType,
      social_links: { instagram: instagramLink, whatsapp: whatsappLink },
      monthly_budget_ils: budget,
      competitors: competitors.filter((item) => item.name.trim()),
      primary_goal: goal,
      ...extra,
    };
  }

  /**
   * Switching the model invalidates three things at once, and all of them have to go in
   * the same commit: the diagnostic answers only that model asks for, a goal that no
   * longer exists for it (the API answers a mismatched goal with a 422), and the target
   * candidates / ranking that were generated for the previous model.
   */
  function changeBusinessModel(nextModel: BusinessModel) {
    if (nextModel === businessModel) return;
    setBusinessModel(nextModel);
    setDiagnostics((current) => pruneDiagnostics(nextModel, current));
    setGoal((current) => (isGoalValidFor(nextModel, current) ? current : defaultGoalFor(nextModel)));
    // `loadTargets` skips the fetch while this list is non-empty, so the next visit to the
    // targets step asks the API again — for the model the owner just picked.
    setTargetCandidates([]);
    setRankedTargets([]);
  }

  function goTo(next: number) {
    setError("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateSwatch(index: number, hex: string) {
    if (!brand) return;
    const next = brand.palette.map((s, i) => (i === index ? { ...s, hex } : s));
    setBrand({ ...brand, palette: next });
    try {
      await endpoints.savePalette(next);
      setPaletteNote("הצבעים נשמרו ✓");
      window.setTimeout(() => setPaletteNote(""), 2500);
    } catch {
      setPaletteNote("שמירת הצבע נכשלה");
    }
  }

  async function handleScanWebsite() {
    if (!/^https?:\/\/.+/i.test(website.trim())) {
      setError("הזינו כתובת אתר מלאה שמתחילה ב-http:// או https://");
      return;
    }
    setError("");
    setBusy(true);
    setScanNote("קוראים את האתר ומחלצים צבעים, טון ומוצרים…");
    try {
      const result = await endpoints.scanWebsite(website.trim());
      const nextBrand = result.scan.brand_language;
      setBrand(nextBrand);
      if (nextBrand.business_name) setName(nextBrand.business_name);
      if (nextBrand.offers_seen?.length) setOfferings(nextBrand.offers_seen.join(", "));
      // City / neighbourhood is extracted from the site too, so the user does not have
      // to retype something we already read.
      const extracted = result.scan.extracted as { location?: string } | undefined;
      if (extracted?.location) setLocation(extracted.location);
      toast("שפת המותג נלמדה מהאתר");
    } catch (err) {
      setError(err instanceof Error ? err.message : "קריאת האתר נכשלה");
    } finally {
      setBusy(false);
      setScanNote("");
    }
  }

  async function saveBusinessStep() {
    setError("");
    if (name.trim().length < 2) {
      setError("נא להזין שם עסק.");
      return;
    }
    if (offerings.trim().length < 3) {
      setError("נא לפרט מה העסק מוכר או מציע.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload());
      goTo(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function saveDiagnosticsStep() {
    setError("");
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload({ diagnostics: diagnosticsPayload() }));
      goTo(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת האבחון נכשלה");
    } finally {
      setBusy(false);
    }
    // Prefetch the candidates while the owner reads the budget screen. Deliberately not
    // awaited by the transition and deliberately not tied to `busy`: generation takes
    // tens of seconds, and blocking "next" on it left the button dead with no reason.
    void loadTargets();
  }

  async function loadTargets() {
    if (targetCandidates.length) return;
    setLoadingTargets(true);
    try {
      const result = await endpoints.targets();
      setTargetCandidates(result.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת היעדים נכשלה");
    } finally {
      setLoadingTargets(false);
    }
  }

  async function buildQuarterPlan() {
    setError("");
    if (!rankedTargets.length) {
      setError("בחרו לפחות יעד אחד כדי שנבנה תוכנית רבעונית.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.saveProfile(profilePayload({ growth_targets: rankedTargets }));
      const result = await endpoints.longHorizonPlan();
      setPlan(result.long_horizon_plan);
      goTo(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "בניית התוכנית הרבעונית נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPlanAndLoadDirections() {
    setError("");
    setBusy(true);
    try {
      // The plan must be saved *before* asking for directions: the backend feeds the
      // approved quarter into the hypothesis prompt so the three options sit inside it.
      await endpoints.saveProfile(
        profilePayload({
          growth_targets: rankedTargets,
          diagnostics: diagnosticsPayload(),
          long_horizon_plan: plan ?? undefined,
        }),
      );
      const result = await endpoints.hypotheses();
      setHypotheses(result.hypotheses);
      setSelectedHypothesis((current) => current || result.hypotheses[0]?.hypothesis || "");
      goTo(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הכיוונים נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function generateMonth() {
    setError("");
    if (!Number.isFinite(budget) || budget < 0) {
      setError("התקציב החודשי חייב להיות מספר תקין בש״ח.");
      return;
    }
    if (!selectedHypothesis && hypotheses.length) {
      setError("בחרו כיוון צמיחה אחד.");
      return;
    }
    setBusy(true);
    setGenerateStage("usp");
    const poll = window.setInterval(() => {
      endpoints
        .business()
        .then((res) => {
          const stage = res.business?.generate_state?.stage;
          if (stage) setGenerateStage(stage);
        })
        .catch(() => {});
    }, 2500);
    try {
      await endpoints.saveProfile(
        profilePayload({
          growth_targets: rankedTargets,
          diagnostics: diagnosticsPayload(),
          long_horizon_plan: plan ?? undefined,
          growth_hypothesis: selectedHypothesis,
        }),
      );
      await generateUntilDone(endpoints.generate, setGenerateStage);
      toast("התוכנית החודשית מוכנה");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "בניית התוכנית נכשלה");
    } finally {
      window.clearInterval(poll);
      setBusy(false);
      setGenerateStage("");
    }
  }

  const current = STEPS[step];
  const capacityQuestion = capacityCopy(businessModel);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="py-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold text-[#5e6159]">
              שלב {step + 1} מתוך {STEPS.length}: {current.label}
            </p>
            <p className="text-[11px] text-[#8b8e84]">{current.hint}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6e4dc]">
            <div
              className="h-full bg-[#191b18] transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <ol className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-[11px] sm:flex">
            {STEPS.map((item, index) => (
              <li
                key={item.key}
                className={
                  index === step
                    ? "font-bold text-[#191b18]"
                    : index < step
                      ? "text-[#5e6159]"
                      : "text-[#b3b0a5]"
                }
              >
                {index < step ? "✓ " : `${index + 1}. `}
                {item.label}
              </li>
            ))}
          </ol>
        </div>

        {error ? <ErrorNote message={error} /> : null}

        {step === 0 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">ככה זה עובד</h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                רוב העסקים קופצים ישר ל״מה מפרסמים החודש״. אנחנו מתחילים מלאן הולכים,
                ורק אז יורדים לחודש ולפוסטים. זה מה שנעשה יחד בארבעה שלבים:
              </p>
            </div>

            <ol className="space-y-3">
              {[
                {
                  title: "התוכנית הרבעונית",
                  desc: "לאן הולכים בשלושת החודשים הקרובים, איזה יעד מוביל, ומה אבן הדרך בכל חודש.",
                },
                {
                  title: "התוכנית החודשית",
                  desc: "מה עושים החודש — כתוצאה ישירה של הרבעון, לא בחירה מנותקת.",
                },
                {
                  title: "הפוסטים",
                  desc: "מה מתפרסם בכל שבוע, באיזה ערוץ ובאיזה נוסח, בכרטיסים מוכנים.",
                },
                {
                  title: "מדידה ותיקון",
                  desc: "מה עבד ומה משנים בחודש הבא. בלי להמציא מספרים — רק ממה שנמדד.",
                },
              ].map((item, index) => (
                <li key={item.title} className="flex gap-3 rounded-md border border-[#e6e4dc] bg-[#f8f7f4] p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#191b18] text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-black text-[#191b18]">{item.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#5e6159]">{item.desc}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="rounded-md border border-[#c7d6c2] bg-[#f3f7f1] px-4 py-3 text-sm leading-6 text-[#374b3d]">
              <span className="font-bold">אתם מאשרים כל שלב.</span> שום דבר לא מתפרסם
              בלי אישור שלכם, ואפשר לשנות הכל בהמשך.
            </p>

            <div className="flex justify-end border-t border-[#e6e4dc] pt-4">
              <Button onClick={() => goTo(1)}>בואו נתחיל</Button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">קודם האתר. אחר כך נדייק יחד.</h2>
              <p className="mt-1 text-sm text-[#5e6159]">
                נקרא את האתר, נמלא את הפרטים, ואתם רק מאשרים שזה נכון.
              </p>
            </div>

            <div className="border-t border-[#e6e4dc] pt-4">
              <label className="mb-1.5 block text-xs font-bold text-[#191b18]">כתובת האתר</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://myshop.co.il"
                  className="flex-1 rounded-md border border-[#dedcd4] bg-[#faf8f5] px-3 py-2 text-sm"
                />
                <Button onClick={() => void handleScanWebsite()} disabled={busy}>
                  {busy && scanNote ? "קוראים אתר…" : "קראו את האתר"}
                </Button>
              </div>
              {scanNote ? <p className="mt-2 text-xs font-bold text-[#2d3f32]">{scanNote}</p> : null}
              <p className="mt-2 text-xs text-[#8b8e84]">
                אין אתר עדיין? דלגו על הסריקה ומלאו שם ומה אתם מוכרים.
              </p>
            </div>

            {brand ? (
              <div className="space-y-3 rounded-md border border-[#c8d6c4] bg-[#e8eee5] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2d3f32]">שפת המותג מהאתר</span>
                  <Badge tone="emerald">נלמד מהאתר</Badge>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-[#4a5b4c]">
                    אפשר לתקן את הצבעים — הם קובעים איך ייראו כל הכרטיסים והפוסטים.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {brand.palette.map((swatch, i) => (
                      <label key={`${swatch.role}-${i}`} className="flex items-center gap-1.5" title={swatch.role}>
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(swatch.hex) ? swatch.hex : "#000000"}
                          onChange={(e) => void updateSwatch(i, e.target.value)}
                          className="h-7 w-7 cursor-pointer rounded-full border border-[#c7c4b8] bg-transparent p-0"
                        />
                        <span className="text-[10px] font-bold text-[#4a5b4c]">
                          {ROLE_LABELS[swatch.role] || swatch.role}
                        </span>
                      </label>
                    ))}
                  </div>
                  {paletteNote ? (
                    <p className="mt-1.5 text-[11px] font-bold text-[#2d3f32]">{paletteNote}</p>
                  ) : null}
                </div>
                <p className="text-xs text-[#2d3f32]">
                  <span className="font-bold">טון: </span>
                  {brand.voice}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 border-t border-[#e6e4dc] pt-4 sm:grid-cols-2">
              <Field label="שם העסק" value={name} onChange={setName} />
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">סוג העסק</label>
                <select
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
                >
                  {BUSINESS_TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Field label="מה אתם מוכרים או מציעים" value={offerings} onChange={setOfferings} />
              </div>
              <Field label="עיר / שכונה" value={location} onChange={setLocation} />
            </div>

            <section className="border-t border-[#e6e4dc] pt-4">
              <h3 className="text-sm font-black text-[#191b18]">מה אתם מוכרים?</h3>
              <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                זה משנה את כל התוכנית: חנות מתוכננת סביב רכישות, ועסק שירותים סביב פניות
                ומיתוג אישי. התשובה קובעת אילו שאלות נשאל ואיך תיראה התוכנית.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {BUSINESS_MODEL_OPTIONS.map((option) => (
                  <ChoiceButton
                    key={option.key}
                    title={option.title}
                    desc={option.desc}
                    selected={businessModel === option.key}
                    onClick={() => changeBusinessModel(option.key)}
                  />
                ))}
              </div>
            </section>

            <section className="border-t border-[#e6e4dc] pt-4">
              <h3 className="text-sm font-bold text-[#191b18]">איך הלקוחות מגיעים אליכם?</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {PRESENCE_MODELS.map((model) => (
                  <button
                    key={model.key}
                    type="button"
                    onClick={() => setPresenceType(model.key)}
                    className={`rounded-md border p-3 text-right ${
                      presenceType === model.key
                        ? "border-[#191b18] bg-[#191b18] text-white"
                        : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18]"
                    }`}
                  >
                    <span className="block text-xs font-bold">{model.title}</span>
                    <span className="mt-1 block text-[11px] opacity-80">{model.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <details className="border-t border-[#e6e4dc] pt-3">
              <summary className="cursor-pointer text-xs font-bold text-[#5e6159]">
                אינסטגרם או וואטסאפ (לא חובה)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="אינסטגרם" value={instagramLink} onChange={setInstagramLink} />
                <Field label="קישור וואטסאפ" value={whatsappLink} onChange={setWhatsappLink} />
              </div>
            </details>

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(0)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => void saveBusinessStep()} disabled={busy}>
                {busy ? "שומרים…" : "המשך לאבחון"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">כמה שאלות קצרות, וזהו.</h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                התשובות קובעות מה נציע לחזק קודם — לא מה ״נכון״ באופן כללי, אלא מה נכון לעסק שלכם.
                את השאלות בחרנו לפי מה שאמרתם שאתם מוכרים.
              </p>
            </div>

            {diagnosticQuestionsFor(businessModel).map((question) => (
              <QuestionBlock key={question.field} title={question.title} note={question.note}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {question.options.map((option) => (
                    <ChoiceButton
                      key={option.key}
                      title={option.title}
                      desc={option.desc}
                      selected={diagnostics[question.field] === option.key}
                      onClick={() =>
                        setDiagnostics((current) => ({
                          ...current,
                          [question.field]: option.key,
                        }))
                      }
                    />
                  ))}
                </div>
              </QuestionBlock>
            ))}

            <QuestionBlock title={capacityQuestion.title} note={capacityQuestion.note}>
              <textarea
                rows={2}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder={capacityQuestion.placeholder}
                className="w-full rounded-md border border-[#dedcd4] p-3 text-sm"
              />
            </QuestionBlock>

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(1)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => void saveDiagnosticsStep()} disabled={busy}>
                {busy ? "שומרים…" : "המשך לתקציב"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">כמה אתם משקיעים בשיווק בחודש?</h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                זה הסכום הכולל לחודש, וזו ההחלטה שקובעת הכי הרבה: כמה פוסטים בשבוע,
                איזה פורמטים, והאם בכלל שווה לשלם כדי לגייס לקוחות חדשים — או שעדיף
                להשקיע במי שכבר מכיר אתכם.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {BUDGET_STAGES.map((option) => {
                const active = stageFor(budget).key === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setBudget(option.suggestion)}
                    className={`rounded-md border p-4 text-right ${
                      active ? "border-[#191b18] bg-[#191b18] text-white" : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18]"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-black">{option.title}</span>
                      <span className="text-[11px] opacity-80">{option.range}</span>
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-5 opacity-80">{option.buys}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-md border border-[#e6e4dc] bg-white p-4">
              <label className="mb-1.5 block text-xs font-bold text-[#191b18]">או סכום מדויק לחודש</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={budget}
                  min={0}
                  step={100}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  className="w-40 rounded-md border border-[#dedcd4] px-3 py-2 text-sm font-bold"
                />
                <span className="text-sm font-bold text-[#5e6159]">₪</span>
              </div>
              <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-3 py-2 text-xs leading-5 text-[#685f47]">
                <span className="font-bold">
                  {formatNis(budget)} → {stageFor(budget).title}.
                </span>{" "}
                {stageFor(budget).buys}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(2)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => goTo(4)} disabled={busy}>
                המשך ליעדים
              </Button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">מה חשוב לכם קודם?</h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                רבעון מכיל <span className="font-bold text-[#191b18]">שלוש עדיפויות בלבד</span> —
                יותר מזה וזה כבר לא מיקוד. בחרו עד שלושה יעדים, ואז סדרו אותם לפי סדר
                החשיבות: הראשון הוא היעד המוביל שהתוכנית הרבעונית תיבנה סביבו.
              </p>
            </div>

            {loadingTargets && !targetCandidates.length ? (
              <p className="flex items-center gap-2 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3 text-sm font-bold text-[#191b18]">
                <IconFlag className="h-4 w-4" />
                {AGENT_NAME} בונה הצעה של יעדים מהעסק, מהאתר ומהאבחון…
              </p>
            ) : null}

            {targetCandidates.length ? (
              <TargetRanker
                candidates={targetCandidates}
                value={rankedTargets}
                onChange={setRankedTargets}
              />
            ) : null}

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(3)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => void buildQuarterPlan()} disabled={busy || !targetCandidates.length}>
                {busy ? "בונים תוכנית רבעונית…" : "בנו את התוכנית הרבעונית"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 5 && plan ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold text-[#5e6159]">
                <IconCompass className="h-4 w-4" />
                {plan.horizon || "הרבעון הקרוב"}
              </span>
              <h2 className="mt-2 text-2xl font-black leading-8 text-[#191b18]">{plan.hypothesis}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5e6159]">
                זו התוכנית שממנה נגזר כל השאר. כל חודש הוא אבן דרך אחת בדרך ליעד הזה.
              </p>
            </div>

            <section className="border-t border-[#e6e4dc] pt-4">
              <h3 className="text-sm font-black text-[#191b18]">היעדים שלכם, לפי החשיבות שקבעתם</h3>
              <ol className="mt-3 space-y-2">
                {plan.targets.map((target, index) => (
                  <li key={`${target}-${index}`} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#191b18] text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-[#191b18]">{target}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="border-t border-[#e6e4dc] pt-4">
              <h3 className="text-sm font-black text-[#191b18]">מה יקרה בכל חודש</h3>
              <p className="mt-1 text-xs text-[#8b8e84]">כל חודש נסגר בנקודת בקרה, כדי שנדע אם לתקן.</p>
              <ol className="mt-3 space-y-3">
                {plan.milestones.map((milestone, index) => (
                  <li key={`${milestone.month_label}-${index}`} className="rounded-md border border-[#e6e4dc] bg-[#f8f7f4] p-4">
                    <span className="text-[11px] font-bold text-[#8b8e84]">{milestone.month_label}</span>
                    <span className="mt-1 block text-sm font-bold leading-6 text-[#191b18]">
                      {milestone.milestone}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#5e6159]">
                      <span className="font-bold">נקודת בקרה: </span>
                      {milestone.checkpoint}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(4)} className="text-sm text-[#5e6159] underline">
                שנה יעדים
              </button>
              <Button onClick={() => void confirmPlanAndLoadDirections()} disabled={busy}>
                {busy ? "טוענים כיוונים…" : "מאשר — נבחר כיוון לחודש"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 5 && !plan ? (
          <div className="space-y-4 rounded-lg border border-[#e6e4dc] bg-white p-6 text-center sm:p-8">
            <p className="text-sm text-[#5e6159]">עוד אין תוכנית רבעונית.</p>
            <Button onClick={() => goTo(4)}>חזרה ליעדים</Button>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-6 rounded-lg border border-[#e6e4dc] bg-white p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-black text-[#191b18]">מאיפה מתחילים החודש?</h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6159]">
                שלוש דרכים לפתוח את הרבעון. כולן צעד ראשון בתוך התוכנית שאישרתם —
                לא תוכנית חדשה.
              </p>
            </div>

            {plan ? (
              <div className="rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3">
                <span className="flex items-center gap-2 text-[11px] font-bold text-[#685f47]">
                  <IconCompass className="h-3.5 w-3.5" />
                  היעד המוביל שלכם
                </span>
                <p className="mt-1 text-sm font-bold leading-6 text-[#191b18]">{plan.targets[0]}</p>
              </div>
            ) : null}

            {hypotheses.length ? (
              <div className="space-y-2">
                {hypotheses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedHypothesis(item.hypothesis)}
                    className={`w-full rounded-md border p-4 text-right ${
                      selectedHypothesis === item.hypothesis
                        ? "border-[#191b18] bg-[#f4f3ee]"
                        : "border-[#e6e4dc] bg-white"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold text-[#191b18]">{item.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-[#5e6159]">{item.hypothesis}</span>
                        <span className="mt-2 block text-xs text-[#8b8e84]">{item.why_this}</span>
                      </span>
                      {selectedHypothesis === item.hypothesis ? (
                        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#191b18]" />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-[#e6e4dc] bg-[#faf8f5] p-4 text-sm text-[#5e6159]">
                לא הצלחנו להציע כיוונים אוטומטית. אפשר לכתוב כיוון אחד בעצמכם.
              </p>
            )}

            {!hypotheses.length ? (
              <textarea
                rows={3}
                value={selectedHypothesis}
                onChange={(event) => setSelectedHypothesis(event.target.value)}
                placeholder="אם נחזור לכל מי שפנה אלינו בעבר ונסביר מה אנחנו עושים עכשיו, נסגור עוד בלי להוציא יותר על פרסום."
                className="w-full rounded-md border border-[#dedcd4] p-3 text-sm"
              />
            ) : null}

            <div className="grid gap-4 border-t border-[#e6e4dc] pt-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">התקציב החודשי</label>
                <p className="rounded-md border border-[#e6e4dc] bg-[#f8f7f4] px-3 py-2 text-sm font-bold text-[#191b18]">
                  {formatNis(budget)}
                </p>
                <Link
                  href="/decisions"
                  className="mt-1 block text-[11px] text-[#5e6159] underline underline-offset-4"
                >
                  {stageFor(budget).title} · לשינוי התקציב
                </Link>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#191b18]">המטרה החודש</label>
                <div className="grid grid-cols-2 gap-2">
                  {goalsFor(businessModel).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setGoal(option.key)}
                      title={option.desc}
                      className={`rounded-md border p-3 text-right text-xs font-bold ${
                        goal === option.key ? "border-[#191b18] bg-[#191b18] text-white" : "border-[#e6e4dc]"
                      }`}
                    >
                      {option.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <details className="border-t border-[#e6e4dc] pt-3">
              <summary className="cursor-pointer text-xs font-bold text-[#5e6159]">מתחרים (לא חובה, מספיק שם)</summary>
              <div className="mt-3 space-y-2">
                {competitors.map((item, index) => (
                  <input
                    key={index}
                    value={item.name}
                    onChange={(event) => {
                      const next = [...competitors];
                      next[index] = { ...next[index], name: event.target.value };
                      if (index === competitors.length - 1 && event.target.value && competitors.length < 3) {
                        next.push({ name: "", website_url: "" });
                      }
                      setCompetitors(next);
                    }}
                    placeholder="שם מתחרה"
                    className="w-full rounded-md border border-[#dedcd4] px-3 py-2 text-sm"
                  />
                ))}
              </div>
            </details>

            {generateStage ? (
              <div className="flex items-center gap-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3 text-sm font-bold text-[#191b18]">
                <IconStore className="h-4 w-4" />
                {STAGE_LABELS[generateStage] || "בונים את החודש…"}
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-[#e6e4dc] pt-4">
              <button type="button" onClick={() => goTo(5)} className="text-sm text-[#5e6159] underline">
                חזרה
              </button>
              <Button onClick={() => void generateMonth()} disabled={busy}>
                {busy ? STAGE_LABELS[generateStage] || "בונים…" : "בנו את החודש"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function QuestionBlock({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#e6e4dc] pt-4">
      <h3 className="text-sm font-bold text-[#191b18]">{title}</h3>
      {note ? <p className="mt-1 text-xs leading-5 text-[#8b8e84]">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChoiceButton({
  title,
  desc,
  selected,
  onClick,
}: {
  title: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-right ${
        selected ? "border-[#191b18] bg-[#191b18] text-white" : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18]"
      }`}
    >
      <span className="block text-xs font-bold">{title}</span>
      {desc ? <span className="mt-1 block text-[11px] opacity-80">{desc}</span> : null}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-[#191b18]">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}
