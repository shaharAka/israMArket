"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell, Button, ErrorNote } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { TargetRanker, MAX_TARGETS } from "@/components/TargetRanker";
import { AGENT_NAME } from "@/lib/agent";
import {
  endpoints,
  isDemo,
  type Audience,
  type AudiencePayload,
  type Business,
  type BusinessModel,
  type Diagnostics,
  type GrowthTargetCandidate,
  type OnboardingPayload,
  type PrimaryGoal,
} from "@/lib/api";
import {
  BUSINESS_MODEL_OPTIONS,
  DEFAULT_BUSINESS_MODEL,
  capacityCopy,
  defaultGoalFor,
  diagnosticQuestionsFor,
  isGoalValidFor,
  pruneDiagnostics,
  type DiagnosticQuestion,
} from "@/lib/businessModel";
import { BUDGET_STAGES, formatNis, stageFor } from "@/lib/budget";
import {
  IconArrowLeft,
  IconChart,
  IconCompass,
  IconFlag,
  IconRoute,
  IconSparkles,
  IconStore,
  IconUsers,
} from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";
import { toast } from "@/lib/ui";

/** The three-priority cap is shared with the ranker so the rule has one source. */

/**
 * The `Diagnostics` field each question writes to. The questions themselves come from
 * `lib/businessModel`, so this screen asks exactly what the wizard asks — for the model
 * the business is actually on.
 */
type DiagnosticField = DiagnosticQuestion["field"];

/**
 * The editable half of an audience, as the form holds it.
 *
 * `needs` and `where` are typed as one comma-separated line each: the owner writes
 * "חלה טרייה, מארז חג" the way they would say it, and `parseList` turns that into the
 * array the API stores. Parsing on save (not on every keystroke) keeps a half-typed
 * comma from deleting a chip under the cursor.
 */
type AudienceForm = {
  name: string;
  summary: string;
  description: string;
  needs: string;
  where: string;
};

const EMPTY_AUDIENCE_FORM: AudienceForm = {
  name: "",
  summary: "",
  description: "",
  needs: "",
  where: "",
};

/** "חלה, מארז חג, " → ["חלה", "מארז חג"]. Split on commas in either script. */
function parseList(value: string): string[] {
  return value
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formFromAudience(audience: Audience): AudienceForm {
  return {
    name: audience.name,
    summary: audience.summary,
    description: audience.description,
    needs: (audience.needs ?? []).join(", "),
    where: (audience.where ?? []).join(", "),
  };
}

function payloadFromForm(form: AudienceForm): AudiencePayload {
  return {
    name: form.name.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    needs: parseList(form.needs),
    where: parseList(form.where),
  };
}

/** The rail's groups — same ids the anchors and the scroll-spy use. */
const GROUPS = [
  { id: "model", label: "מודל העסק", hint: "מה העסק מוכר — מוצרים, שירותים או שניהם" },
  { id: "budget", label: "תקציב", hint: "כמה כסף עומד לרשות החודש" },
  { id: "diagnostics", label: "אבחון", hint: "מה שחוזר מהלקוחות שלכם" },
  { id: "audiences", label: "קהלי היעד", hint: "למי התוכנית והפוסטים מיועדים" },
  { id: "targets", label: "עדיפויות", hint: "מה שהתוכנית נבנית סביבו" },
] as const;

/**
 * The section accent ("settings" grey-blue) drives the rail, the labels and the rules.
 * Pulled from the shared identity so this screen cannot drift from the rest of the set.
 */
const ACCENT = SECTIONS.decisions.accent;
const SURFACE = SECTIONS.decisions.surface;
const ACCENT_BORDER = SECTIONS.decisions.border;

/**
 * All the decisions in one place.
 *
 * The wizard ends by navigating away, and until now there was no screen that showed what
 * was decided: the business model, the budget, the diagnostics and the ranked targets were
 * effectively write-once. This is their home — the same decisions, editable, saved back
 * through the whole-profile endpoint the wizard uses.
 *
 * The diagnostics are not written out here: they come from the products / services fork
 * (`lib/businessModel`), so a shop is still asked about its customer club and a service
 * business about where its inquiries come from — and a change of model resets what it
 * invalidates rather than leaving answers that no longer mean anything.
 *
 * Laid out as a settings screen rather than a column of cards: a sticky rail holds the
 * four groups and the save action, the groups themselves are labelled rows with their own
 * control, and the current values stay visible in the rail the whole way down.
 */
export default function DecisionsPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [candidatesError, setCandidatesError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [demo, setDemo] = useState(false);

  // The budget lives as text so the field can be cleared while typing; the number is derived.
  const [budgetText, setBudgetText] = useState("");

  // The fork's own inputs. The model decides which questions exist, which goal is legal
  // and what the plan is trying to produce, so the answers live in one object that can be
  // pruned as a set the moment the model changes.
  const [businessModel, setBusinessModel] = useState<BusinessModel>(DEFAULT_BUSINESS_MODEL);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(defaultGoalFor(DEFAULT_BUSINESS_MODEL));
  /** Shown after a model switch: what was saved for the previous model is still here. */
  const [modelNotice, setModelNotice] = useState("");

  const [rankedTargets, setRankedTargets] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<GrowthTargetCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [capNote, setCapNote] = useState("");

  /**
   * Audience segments. They look like part of the decisions, but they live on their own
   * endpoints — a segment is created, renamed, promoted and deleted on its own, and a
   * pending edit here must never travel in the profile payload the save button sends.
   */
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(true);
  const [audiencesError, setAudiencesError] = useState("");
  const [audiencesNotice, setAudiencesNotice] = useState("");
  const [generatingAudiences, setGeneratingAudiences] = useState(false);
  const [audienceBusy, setAudienceBusy] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  /** Which segment's edit form is open; the draft lives in the object below. */
  const [editingAudienceId, setEditingAudienceId] = useState<number | null>(null);
  const [audienceDraft, setAudienceDraft] = useState<AudienceForm>(EMPTY_AUDIENCE_FORM);
  /** The manual-add form, folded away until asked for. */
  const [showAddAudience, setShowAddAudience] = useState(false);
  const [newAudience, setNewAudience] = useState<AudienceForm>(EMPTY_AUDIENCE_FORM);

  /** Which group the rail highlights. Purely presentational — nothing depends on it. */
  const [activeGroup, setActiveGroup] = useState<string>(GROUPS[0].id);

  const saveSection = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // isDemo() reads localStorage, so it cannot run during the prerender — same reason
    // AppShell defers its own check.
    const timer = window.setTimeout(() => setDemo(isDemo()), 0);

    endpoints
      .business()
      .then((res) => {
        const loaded = res.business;
        setBusiness(loaded);
        if (!loaded) return;
        const budget = Number(loaded.monthly_budget_ils);
        setBudgetText(Number.isFinite(budget) && budget > 0 ? String(budget) : "");
        const loadedModel = loaded.business_model ?? DEFAULT_BUSINESS_MODEL;
        setBusinessModel(loadedModel);
        // The goal has to fit the model: the API answers a mismatch with a 422, so a row
        // saved before the fork falls back to the goal the model actually offers.
        const loadedGoal = loaded.primary_goal;
        setPrimaryGoal(
          loadedGoal && isGoalValidFor(loadedModel, loadedGoal)
            ? loadedGoal
            : defaultGoalFor(loadedModel),
        );
        const answers = loaded.diagnostics;
        setDiagnostics({
          has_customer_club: answers?.has_customer_club ?? null,
          repeat_vs_new: answers?.repeat_vs_new ?? null,
          priority_channel: answers?.priority_channel ?? null,
          lead_source: answers?.lead_source ?? null,
          has_portfolio: answers?.has_portfolio ?? null,
          brand_owner: answers?.brand_owner ?? null,
          capacity_constraint: answers?.capacity_constraint ?? "",
        });
        setRankedTargets((loaded.growth_targets ?? []).slice(0, MAX_TARGETS));
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "שגיאה בטעינת ההחלטות");
      })
      .finally(() => setLoading(false));

    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Segments load in their own request, and only once there is a business to scope them
   * to. A failure here must not blank the rest of the screen: the groups above and below
   * are independent of the audience list, so the error is kept next to that group.
   *
   * The loading flag starts true and nothing is set synchronously in the effect body —
   * this fetch runs once, when a business appears, and its own state is all it touches.
   * It is keyed on the profile existing rather than on the object, so saving an unrelated
   * decision does not refetch the segments.
   */
  const hasBusiness = business !== null;
  useEffect(() => {
    if (!hasBusiness) return;
    let cancelled = false;
    endpoints
      .audiences()
      .then((res) => {
        if (cancelled) return;
        setAudiences(res.audiences ?? []);
        setAudiencesError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setAudiencesError(err instanceof Error ? err.message : "טעינת קהלי היעד נכשלה");
      })
      .finally(() => {
        if (!cancelled) setAudiencesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasBusiness]);

  // Scroll-spy for the rail: the last group whose top passed the sticky header wins.
  // Reading positions on scroll keeps it dependency-free; every failure mode is a no-op.
  useEffect(() => {
    if (!business) return;
    function update() {
      let current: string = GROUPS[0].id;
      for (const group of GROUPS) {
        const node = document.getElementById(group.id);
        if (node && node.getBoundingClientRect().top <= 140) current = group.id;
      }
      setActiveGroup(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [business]);

  const parsedBudget = Number(budgetText);
  const budgetInvalid = budgetText.trim() === "" || !Number.isFinite(parsedBudget) || parsedBudget < 0;
  const budgetValue = budgetInvalid ? 0 : parsedBudget;
  const currentStage = stageFor(budgetValue);

  /** The questions this model actually asks. The group below renders exactly these. */
  const diagnosticQuestions = diagnosticQuestionsFor(businessModel);

  const diagnosticsAnswered = diagnosticQuestions.filter(
    (question) => diagnostics[question.field],
  ).length;
  const modelTitle =
    BUSINESS_MODEL_OPTIONS.find((option) => option.key === businessModel)?.title ?? businessModel;
  const capacityFields = capacityCopy(businessModel);
  const leadTarget = rankedTargets[0] ?? "";
  /** The one segment the plan leads with, for the rail's summary line. */
  const leadAudience =
    audiences.find((audience) => audience.is_primary)?.name ?? audiences[0]?.name ?? "";

  /** Any edit invalidates the "saved" confirmation and the previous error. */
  function markChanged() {
    setDirty(true);
    setSaved(false);
    setSaveError("");
  }

  function diagnosticsPayload(): Diagnostics {
    return {
      has_customer_club: diagnostics.has_customer_club ?? null,
      repeat_vs_new: diagnostics.repeat_vs_new ?? null,
      priority_channel: diagnostics.priority_channel ?? null,
      lead_source: diagnostics.lead_source ?? null,
      has_portfolio: diagnostics.has_portfolio ?? null,
      brand_owner: diagnostics.brand_owner ?? null,
      capacity_constraint: diagnostics.capacity_constraint ?? "",
    };
  }

  /**
   * One answer at a time. Every field of `Diagnostics` has its own literal union, so a
   * computed key would widen the value to `string`; the switch keeps each write narrow.
   * (`undefined` is in the parameter type so each cast is a plain narrowing.)
   */
  function setAnswer(field: DiagnosticField, value: string | null | undefined) {
    setDiagnostics((current) => {
      const next: Diagnostics = { ...current };
      switch (field) {
        case "has_customer_club":
          next.has_customer_club = value as Diagnostics["has_customer_club"];
          break;
        case "repeat_vs_new":
          next.repeat_vs_new = value as Diagnostics["repeat_vs_new"];
          break;
        case "priority_channel":
          next.priority_channel = value as Diagnostics["priority_channel"];
          break;
        case "lead_source":
          next.lead_source = value as Diagnostics["lead_source"];
          break;
        case "has_portfolio":
          next.has_portfolio = value as Diagnostics["has_portfolio"];
          break;
        case "brand_owner":
          next.brand_owner = value as Diagnostics["brand_owner"];
          break;
      }
      return next;
    });
  }

  /**
   * Switching the model invalidates three things at once, and they go in the same commit:
   * the answers only the previous model asked for, a goal the new model has no place for
   * (the API answers a mismatch with a 422, so it must never be sent), and the suggested
   * targets that were generated for the previous model.
   *
   * The saved priorities and the quarterly plan are deliberately not deleted — they were
   * built for the previous model, so they are left visible and flagged instead.
   *
   * The identity check is the guard: this only ever runs from a click on a different
   * model, so a profile that is merely loaded is never reset.
   */
  function changeBusinessModel(nextModel: BusinessModel) {
    if (nextModel === businessModel) return;
    setBusinessModel(nextModel);
    setDiagnostics((current) => pruneDiagnostics(nextModel, current));
    setPrimaryGoal((current) =>
      isGoalValidFor(nextModel, current) ? current : defaultGoalFor(nextModel),
    );
    setCandidates([]);
    setCandidatesError("");
    setCapNote("");
    setModelNotice(
      "העדיפויות שנשמרו והתוכנית הרבעונית נבנו למודל הקודם — הן נשארו כאן כמו שהן, אבל כדי שיתאימו למודל החדש כדאי לבנות אותן מחדש באשף.",
    );
    markChanged();
  }

  async function save() {
    if (!business) return;
    setSaveError("");
    setSaved(false);
    if (budgetInvalid) {
      setSaveError("התקציב החודשי חייב להיות מספר תקין בש״ח.");
      return;
    }
    if (rankedTargets.length > MAX_TARGETS) {
      setSaveError(`אפשר לשמור עד ${MAX_TARGETS} עדיפויות. הסירו יעד אחד ונסו שוב.`);
      return;
    }

    setSaving(true);
    try {
      // Last line of defence for the pair the API validates together: a goal the current
      // model does not offer is rejected with a 422, so it is repaired here, not sent.
      const goalToSave = isGoalValidFor(businessModel, primaryGoal)
        ? primaryGoal
        : defaultGoalFor(businessModel);
      // POST /onboarding/profile replaces the whole profile: every field the wizard
      // collected has to travel back with the edit, or it is wiped. Only the decisions
      // this screen owns are changed; the rest is echoed as loaded.
      const payload: OnboardingPayload = {
        name: business.name,
        website_url: business.website_url,
        business_type: business.business_type,
        offerings: business.offerings,
        location: business.location ?? "",
        presence_type: business.presence_type,
        business_model: businessModel,
        social_links: business.social_links ?? {},
        monthly_budget_ils: budgetValue,
        competitors: business.competitors ?? [],
        primary_goal: goalToSave,
        diagnostics: diagnosticsPayload(),
        growth_targets: rankedTargets.slice(0, MAX_TARGETS),
        long_horizon_plan: business.long_horizon_plan ?? undefined,
      };
      await endpoints.saveProfile(payload);
      setDirty(false);
      setSaved(true);
      toast("ההחלטות נשמרו");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שמירת ההחלטות נכשלה");
    } finally {
      setSaving(false);
    }
  }

  /** A second save affordance lives in the sticky bar; bring the error next to it. */
  async function saveFromBar() {
    await save();
    saveSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadCandidates() {
    setCandidatesError("");
    setCapNote("");
    setLoadingCandidates(true);
    try {
      const result = await endpoints.targets();
      setCandidates(result.targets);
      if (!result.targets.length) {
        setCandidatesError("לא התקבלו הצעות חדשות כרגע. אפשר לנסות שוב, או לשמור את מה שכבר יש.");
      }
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : "טעינת ההצעות נכשלה");
    } finally {
      setLoadingCandidates(false);
    }
  }

  /**
   * Every audience call is a real write on its own endpoint, so each one reports where it
   * stands: `audienceBusy` names the one in flight ("new", "3", "3:primary", "3:delete")
   * and disables only that card's controls rather than the whole screen.
   */
  function audienceNotice(message: string) {
    setAudiencesNotice(message);
    setAudiencesError("");
  }

  /** Real model call: several seconds, and only ever from this click. */
  async function generateAudiences() {
    setGeneratingAudiences(true);
    setAudiencesError("");
    setAudiencesNotice("");
    try {
      const result = await endpoints.generateAudiences();
      const list = result.audiences ?? [];
      setAudiences(list);
      setEditingAudienceId(null);
      setConfirmDeleteId(null);
      // The route answers with the full list and its own account of what it replaced and
      // what it kept, so the owner is told what actually happened rather than what the
      // screen assumed happened.
      audienceNotice(
        result.note
          ? result.note
          : list.length
            ? `הצעת הקהלים נשמרה — ${list.length} קהלים. אפשר לערוך כל אחד מהם.`
            : "ההצעה חזרה בלי קהלים. אפשר להוסיף קהל ידנית.",
      );
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "הצעת הקהלים נכשלה");
    } finally {
      setGeneratingAudiences(false);
    }
  }

  function startEditAudience(audience: Audience) {
    setEditingAudienceId(audience.id);
    setAudienceDraft(formFromAudience(audience));
    setConfirmDeleteId(null);
    setAudiencesNotice("");
  }

  /** Edit is inline: the fields replace the card's text until saved or cancelled. */
  async function saveAudience(id: number) {
    if (!audienceDraft.name.trim()) {
      setAudiencesError("לקהל צריך להיות שם — בלעדיו אי אפשר לשייך אליו פוסט.");
      return;
    }
    setAudienceBusy(String(id));
    setAudiencesError("");
    try {
      const result = await endpoints.updateAudience(id, payloadFromForm(audienceDraft));
      setAudiences((current) =>
        current.map((audience) => (audience.id === id ? result.audience : audience)),
      );
      setEditingAudienceId(null);
      audienceNotice("הקהל עודכן.");
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "עדכון הקהל נכשל");
    } finally {
      setAudienceBusy("");
    }
  }

  async function addAudience() {
    if (!newAudience.name.trim()) {
      setAudiencesError("לקהל צריך להיות שם — בלעדיו אי אפשר לשייך אליו פוסט.");
      return;
    }
    setAudienceBusy("new");
    setAudiencesError("");
    try {
      const result = await endpoints.createAudience(payloadFromForm(newAudience));
      setAudiences((current) => [...current, result.audience]);
      setNewAudience(EMPTY_AUDIENCE_FORM);
      setShowAddAudience(false);
      audienceNotice("הקהל נוסף. אפשר לסמן אותו כקהל המוביל.");
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "הוספת הקהל נכשלה");
    } finally {
      setAudienceBusy("");
    }
  }

  /** The API keeps exactly one primary, so the whole list is replaced with its answer. */
  async function makePrimary(id: number) {
    setAudienceBusy(`${id}:primary`);
    setAudiencesError("");
    try {
      const result = await endpoints.setPrimaryAudience(id);
      setAudiences(result.audiences ?? []);
      audienceNotice("הקהל המוביל עודכן. הפוסטים הבאים ייבנו סביבו.");
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "סימון הקהל המוביל נכשל");
    } finally {
      setAudienceBusy("");
    }
  }

  /** Two steps: the first click only opens the confirmation. */
  async function deleteAudience(id: number) {
    setAudienceBusy(`${id}:delete`);
    setAudiencesError("");
    try {
      const result = await endpoints.deleteAudience(id);
      setConfirmDeleteId(null);
      if (editingAudienceId === id) setEditingAudienceId(null);
      // Deleting the primary promotes the next segment on the server, so the list is
      // re-read instead of being patched locally with a guess.
      if (result.promoted_audience) {
        const refreshed = await endpoints.audiences();
        setAudiences(refreshed.audiences ?? []);
      } else {
        setAudiences((current) => current.filter((audience) => audience.id !== id));
      }
      audienceNotice(
        result.message ||
          "הקהל נמחק. פוסטים שהיו משויכים אליו נשארו בלי שיוך ויופיעו כ׳לא משויך׳.",
      );
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "מחיקת הקהל נכשלה");
    } finally {
      setAudienceBusy("");
    }
  }

  function handleRankedChange(next: string[]) {
    markChanged();
    if (next.length > MAX_TARGETS) {
      setRankedTargets(next.slice(0, MAX_TARGETS));
      setCapNote(`אפשר לבחור עד ${MAX_TARGETS} עדיפויות לרבעון — היעד הנוסף לא נכנס.`);
      return;
    }
    setCapNote("");
    setRankedTargets(next);
  }

  function moveTarget(from: number, to: number) {
    if (to < 0 || to >= rankedTargets.length || from === to) return;
    const next = [...rankedTargets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    markChanged();
    setRankedTargets(next);
  }

  function removeTarget(target: string) {
    markChanged();
    setCapNote("");
    setRankedTargets(rankedTargets.filter((item) => item !== target));
  }

  /** The one wording for "where the save stands", shared by the rail, the bar and the card. */
  const saveState = saving
    ? "שומרים…"
    : dirty
      ? "יש שינויים שלא נשמרו"
      : saved
        ? "ההחלטות נשמרו ✓"
        : "אין שינויים חדשים";
  const savePending = saving || dirty || saved;

  const groups = [
    {
      ...GROUPS[0],
      state: modelTitle,
      done: true,
    },
    {
      ...GROUPS[1],
      state: budgetInvalid ? "לא הוזן" : currentStage.title,
      done: !budgetInvalid,
    },
    {
      ...GROUPS[2],
      state: diagnosticsAnswered
        ? `${diagnosticsAnswered} מתוך ${diagnosticQuestions.length}`
        : "לא נענה",
      done: diagnosticsAnswered > 0,
    },
    {
      ...GROUPS[3],
      state: audiencesLoading
        ? "טוענים…"
        : audiences.length
          ? `${audiences.length} קהלים · מוביל: ${leadAudience}`
          : "לא הוגדרו",
      done: audiences.length > 0,
    },
    {
      ...GROUPS[4],
      state: rankedTargets.length ? `${rankedTargets.length} מתוך ${MAX_TARGETS}` : "לא נבחרו",
      done: rankedTargets.length > 0,
    },
  ];

  return (
    <AppShell>
      {/* Extra bottom room on mobile for the save bar, which sits above the app's nav. */}
      <div className="mx-auto max-w-6xl pb-20 lg:pb-0">
        <SectionHeader
          section="decisions"
          title="ההחלטות שלי"
          subtitle={`מודל העסק, התקציב, האבחון והעדיפויות שקבעתם עם ${AGENT_NAME} — אפשר לשנות כאן בכל רגע, בלי לחזור על האשף.`}
        />

        {demo ? (
          <p
            className="mb-5 rounded-md border px-4 py-2 text-xs leading-5 text-[#5c6472]"
            style={{ background: SURFACE, borderColor: ACCENT_BORDER }}
          >
            מצב הדגמה — הנתונים לדוגמה. אפשר לשנות כאן בחופשיות, זה לא נוגע בעסק אמיתי.
          </p>
        ) : null}

        {loadError ? <ErrorNote message={loadError} /> : null}

        {loading && !business ? <LoadingMark label="טוענים את ההחלטות…" /> : null}

        {!business && !loading && !loadError ? (
          <section className="rounded-lg border border-[#e6e4dc] bg-white p-6 text-center">
            <h2 className="text-sm font-black text-[#191b18]">עוד אין עסק מקושר לחשבון הזה</h2>
            <p className="mt-1 text-sm leading-6 text-[#5e6159]">
              התקציב, האבחון והעדיפויות נשמרים על העסק. אפשר למלא אותם באשף, ומכאן לשנות אותם
              בכל רגע.
            </p>
            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[#20211f] px-4 text-sm font-bold text-white hover:bg-[#343632]"
            >
              לאשף הבנייה
            </Link>
          </section>
        ) : null}

        {business ? (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
            {/* The rail: what this screen holds, where you are in it, and the save action.
                On narrow screens it collapses to a summary strip above the groups. */}
            <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-64">
              <div className="flex flex-col gap-4">
                <section
                  aria-label="המצב כרגע"
                  className="rounded-lg border p-3.5"
                  style={{ background: SURFACE, borderColor: ACCENT_BORDER }}
                >
                  <h2 className="text-[11px] font-black" style={{ color: ACCENT }}>
                    המצב כרגע
                  </h2>
                  <dl className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                    <StatusRow label="מודל">
                      <span className="font-bold text-[#191b18]">{modelTitle}</span>
                    </StatusRow>
                    <StatusRow label="תקציב">
                      {budgetInvalid ? (
                        <span className="font-bold text-[#9f4330]">לא הוזן</span>
                      ) : (
                        <>
                          <span className="metric-number font-bold text-[#191b18]">
                            {formatNis(budgetValue)}
                          </span>
                          <span className="text-[11px] text-[#5e6159]"> · {currentStage.title}</span>
                        </>
                      )}
                    </StatusRow>
                    <StatusRow label="אבחון">
                      <span className="font-bold text-[#191b18]">
                        {diagnosticsAnswered} מתוך {diagnosticQuestions.length}
                      </span>
                      <span className="text-[11px] text-[#5e6159]"> תשובות</span>
                    </StatusRow>
                    <StatusRow label="עדיפויות">
                      {rankedTargets.length ? (
                        <>
                          <span className="font-bold text-[#191b18]">
                            {rankedTargets.length} מתוך {MAX_TARGETS}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#5e6159]">
                            מוביל: {leadTarget}
                          </span>
                        </>
                      ) : (
                        <span className="font-bold text-[#8b8e84]">לא נבחרו</span>
                      )}
                    </StatusRow>
                  </dl>
                </section>

                <nav aria-label="קבוצות ההחלטות" className="hidden lg:block">
                  <h2 className="px-3 text-[11px] font-black text-[#8b8e84]">מה יש כאן</h2>
                  <ul className="mt-2 space-y-0.5">
                    {groups.map((group) => {
                      const active = activeGroup === group.id;
                      return (
                        <li key={group.id}>
                          <a
                            href={`#${group.id}`}
                            aria-current={active ? "location" : undefined}
                            className={`flex items-start gap-2.5 rounded-md px-3 py-2 transition-colors ${
                              active ? "bg-[#eceef2]" : "hover:bg-[#f3f4f7]"
                            }`}
                            style={active ? { boxShadow: `inset 3px 0 0 0 ${ACCENT}` } : undefined}
                          >
                            <span
                              aria-hidden
                              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: group.done ? ACCENT : "#ccd2dd" }}
                            />
                            <span className="min-w-0">
                              <span
                                className={`block text-sm ${
                                  active ? "font-black text-[#191b18]" : "font-bold text-[#3c3e3a]"
                                }`}
                              >
                                {group.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-5 text-[#8b8e84]">
                                {group.hint}
                              </span>
                              <span
                                className="mt-0.5 block text-[11px] font-bold"
                                style={{ color: group.done ? ACCENT : "#8b8e84" }}
                              >
                                {group.state}
                              </span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {/* Always reachable on desktop: the rail does not scroll away from the save. */}
                <div className="hidden border-t border-[#dedcd4] pt-3 lg:block">
                  <Button className="w-full" onClick={() => void save()} disabled={saving}>
                    {saving ? "שומרים…" : "שמירת ההחלטות"}
                  </Button>
                  <p className="mt-2 text-[11px] leading-5 text-[#8b8e84]" role="status">
                    {saveState}
                  </p>
                </div>
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-10">
              <SettingsGroup
                id="model"
                icon={<IconStore className="h-4 w-4" />}
                label="מודל העסק"
                title="מה העסק מוכר"
                note="המודל קובע מה התוכנית מנסה לייצר: חנות מתוכננת סביב רכישות, ועסק שירותים סביב פניות."
                badge={modelTitle}
              >
                <div className="grid gap-2 sm:grid-cols-3">
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

                {modelNotice ? (
                  <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-3 py-2 text-xs leading-5 text-[#685f47]">
                    {modelNotice}
                  </p>
                ) : null}
              </SettingsGroup>

              <SettingsGroup
                id="budget"
                icon={<IconChart className="h-4 w-4" />}
                label="תקציב"
                title="תקציב חודשי"
                note="התקציב הוא הגבול של מה שהתוכנית יכולה לבצע. הוא קובע אם נגייס לקוחות חדשים, נחזור למי שכבר מכיר אתכם, או נמתין."
                badge={
                  budgetInvalid ? "לא הוזן" : `השלב שנבחר: ${currentStage.title} · ${currentStage.range}`
                }
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {BUDGET_STAGES.map((stage) => {
                    const selected = !budgetInvalid && currentStage.key === stage.key;
                    return (
                      <button
                        key={stage.key}
                        type="button"
                        onClick={() => {
                          setBudgetText(String(stage.suggestion));
                          markChanged();
                        }}
                        className={`rounded-md border p-3 text-right ${
                          selected
                            ? "border-[#191b18] bg-[#191b18] text-white"
                            : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18] hover:border-[#191b18]"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold">{stage.title}</span>
                          <span className="text-[11px] opacity-80">{stage.range}</span>
                        </span>
                        <span className="mt-1 block text-[11px] leading-5 opacity-80">{stage.buys}</span>
                        <span className="mt-2 block text-[11px] font-bold opacity-90">
                          {selected ? "השלב הנוכחי · " : "בחירה מהירה · "}
                          {formatNis(stage.suggestion)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label htmlFor="monthly-budget" className="mb-1 block text-xs font-bold text-[#191b18]">
                    סכום מדויק לחודש (ש״ח)
                  </label>
                  <input
                    id="monthly-budget"
                    type="number"
                    min={0}
                    step={100}
                    inputMode="numeric"
                    value={budgetText}
                    placeholder="4500"
                    onChange={(event) => {
                      setBudgetText(event.target.value);
                      markChanged();
                    }}
                    className={`w-full rounded-md border bg-[#faf8f5] px-3 py-2 text-sm font-bold ${
                      budgetInvalid ? "border-[#eed1c9]" : "border-[#dedcd4]"
                    }`}
                  />
                </div>

                <div className="mt-4 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-4 py-3">
                  {budgetInvalid ? (
                    <p className="text-sm leading-6 text-[#9f4330]">
                      הזינו תקציב חודשי במספרים, כדי שנדע מה הוא קונה.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="metric-number text-xs font-bold text-[#685f47]">
                          {formatNis(budgetValue)} בחודש
                        </span>
                        <span className="text-[11px] font-bold text-[#685f47]">
                          שלב: {currentStage.title} · {currentStage.range}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#3c3e3a]">{currentStage.buys}</p>
                    </>
                  )}
                </div>
              </SettingsGroup>

              <SettingsGroup
                id="diagnostics"
                icon={<IconSparkles className="h-4 w-4" />}
                label="אבחון"
                title="מה שחוזר מהלקוחות"
                note={`התשובות שקובעות מה ${AGENT_NAME} תציע לחזק קודם. הן מתחלפות עם מודל העסק, אפשר לשנות אותן בכל רגע, והן נכנסות לתוכנית הבאה.`}
                badge={`${diagnosticsAnswered} מתוך ${diagnosticQuestions.length} תשובות`}
              >
                <div className="space-y-6">
                  {/* The questions come from the fork, not from this file: a shop is asked
                      about its customer club, a service business about where inquiries
                      come from — and each answer is written to its own Diagnostics field. */}
                  {diagnosticQuestions.map((question) => (
                    <QuestionBlock
                      key={question.field}
                      title={question.title}
                      note={question.note}
                      onClear={
                        diagnostics[question.field]
                          ? () => {
                              markChanged();
                              setAnswer(question.field, null);
                            }
                          : undefined
                      }
                    >
                      <div className="grid gap-2 sm:grid-cols-3">
                        {question.options.map((option) => (
                          <ChoiceButton
                            key={option.key}
                            title={option.title}
                            desc={option.desc}
                            selected={diagnostics[question.field] === option.key}
                            onClick={() => {
                              markChanged();
                              setAnswer(question.field, option.key);
                            }}
                          />
                        ))}
                      </div>
                    </QuestionBlock>
                  ))}

                  <QuestionBlock title={capacityFields.title} note={capacityFields.note}>
                    <textarea
                      rows={2}
                      value={diagnostics.capacity_constraint ?? ""}
                      placeholder={capacityFields.placeholder}
                      onChange={(event) => {
                        setDiagnostics((current) => ({
                          ...current,
                          capacity_constraint: event.target.value,
                        }));
                        markChanged();
                      }}
                      className="w-full rounded-md border border-[#dedcd4] bg-white p-3 text-sm"
                    />
                  </QuestionBlock>
                </div>
              </SettingsGroup>

              <SettingsGroup
                id="audiences"
                icon={<IconUsers className="h-4 w-4" />}
                label="קהלי היעד"
                title="למי התוכנית מיועדת"
                note={`התוכנית וכל פוסט נבנים סביב מי שאתם מגדירים כאן — מה שהקהל צריך ואיפה הוא נמצא. ההצעה היא קריאה אמיתית של ${AGENT_NAME}, ולכן היא רצה רק כשמבקשים.`}
                badge={
                  audiences.length
                    ? `${audiences.length} קהלים${leadAudience ? ` · מוביל: ${leadAudience}` : ""}`
                    : "עוד לא הוגדרו"
                }
              >
                {/* One line for the whole group: why this is not a label for its own sake. */}
                <p className="mb-4 rounded-md border px-3 py-2 text-xs leading-5 text-[#5c6472]"
                  style={{ background: SURFACE, borderColor: ACCENT_BORDER }}
                >
                  בלי שם לקהל, הפוסטים מדברים לכולם ולכן לא ממש משכנעים אף אחד. כל פוסט מקבל כאן
                  שיוך לקהל, ובעמוד התוצאות רואים מה עבד לכל קהל בנפרד.
                </p>

                {audiencesNotice ? (
                  <p className="mb-3 rounded-md border border-[#c7d6c2] bg-[#f3f7f1] px-3 py-2 text-xs leading-5 text-[#374b3d]">
                    {audiencesNotice}
                  </p>
                ) : null}

                {audiencesError ? (
                  <p className="mb-3 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-3 py-2 text-xs leading-5 text-[#9f4330]">
                    {audiencesError}
                  </p>
                ) : null}

                {audiencesLoading && !audiences.length ? (
                  <p className="rounded-md border border-dashed border-[#dedcd4] bg-[#f8f7f4] px-4 py-6 text-center text-sm text-[#8b8e84]">
                    טוענים את הקהלים…
                  </p>
                ) : null}

                {!audiencesLoading && !audiences.length ? (
                  <p className="rounded-md border border-dashed border-[#dedcd4] bg-[#f8f7f4] px-4 py-6 text-center text-sm text-[#8b8e84]">
                    עוד לא הוגדרו קהלים. אפשר לבקש הצעה מ{AGENT_NAME}, או לכתוב קהל אחד ידנית
                    ולחזור אליו אחר כך.
                  </p>
                ) : null}

                {audiences.length ? (
                  <ul className="space-y-3">
                    {audiences.map((audience) => {
                      const editing = editingAudienceId === audience.id;
                      const busy = audienceBusy.startsWith(String(audience.id));
                      const primaryBusy = audienceBusy === `${audience.id}:primary`;
                      const deleteBusy = audienceBusy === `${audience.id}:delete`;
                      const confirming = confirmDeleteId === audience.id;
                      return (
                        <li
                          key={audience.id}
                          className={`rounded-lg border bg-white p-4 ${
                            audience.is_primary ? "border-[#191b18]" : "border-[#e6e4dc]"
                          }`}
                        >
                          {editing ? (
                            <AudienceFormFields
                              form={audienceDraft}
                              onChange={setAudienceDraft}
                              idPrefix={`audience-${audience.id}`}
                            />
                          ) : (
                            <>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-black text-[#191b18]">
                                    {audience.name}
                                    {audience.is_primary ? (
                                      <span
                                        className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
                                        style={{
                                          background: SURFACE,
                                          borderColor: ACCENT_BORDER,
                                          color: ACCENT,
                                        }}
                                      >
                                        הקהל המוביל
                                      </span>
                                    ) : null}
                                  </h3>
                                  {audience.summary ? (
                                    <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">
                                      {audience.summary}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 text-[10px] font-bold text-[#8b8e84]">
                                  {audience.source === "generated" ? "הוצע ע״י AI" : "נכתב ידנית"}
                                </span>
                              </div>

                              {audience.needs.length ? (
                                <ChipRow label="מה הקהל צריך" items={audience.needs} />
                              ) : null}
                              {audience.where.length ? (
                                <ChipRow label="איפה פוגשים אותו" items={audience.where} />
                              ) : null}

                              {audience.description ? (
                                <p className="mt-3 text-xs leading-5 text-[#5e6159]">
                                  {audience.description}
                                </p>
                              ) : null}
                            </>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e6e4dc] pt-3">
                            {editing ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => void saveAudience(audience.id)}
                                  disabled={busy}
                                >
                                  {busy ? "שומרים…" : "שמירה"}
                                </Button>
                                <button
                                  type="button"
                                  onClick={() => setEditingAudienceId(null)}
                                  disabled={busy}
                                  className="min-h-9 px-2 text-xs font-bold text-[#62635f] underline underline-offset-4 disabled:opacity-40"
                                >
                                  ביטול
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditAudience(audience)}
                                  className="min-h-9 rounded-md border border-[#dedcd4] px-3 text-xs font-bold text-[#3c3e3a] hover:border-[#191b18]"
                                >
                                  עריכה
                                </button>
                                {audience.is_primary ? null : (
                                  <button
                                    type="button"
                                    onClick={() => void makePrimary(audience.id)}
                                    disabled={busy}
                                    className="min-h-9 rounded-md border border-[#dedcd4] px-3 text-xs font-bold text-[#3c3e3a] hover:border-[#191b18] disabled:opacity-40"
                                  >
                                    {primaryBusy ? "מסמנים…" : "סמנו כקהל המוביל"}
                                  </button>
                                )}
                                {confirming ? (
                                  <>
                                    <span className="text-xs font-bold text-[#9f4330]">
                                      למחוק את הקהל?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void deleteAudience(audience.id)}
                                      disabled={deleteBusy}
                                      className="min-h-9 rounded-md border border-[#9f4330] px-3 text-xs font-bold text-[#9f4330] disabled:opacity-40"
                                    >
                                      {deleteBusy ? "מוחקים…" : "כן, למחוק"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      disabled={deleteBusy}
                                      className="min-h-9 px-2 text-xs font-bold text-[#62635f] underline underline-offset-4 disabled:opacity-40"
                                    >
                                      לא
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(audience.id)}
                                    className="min-h-9 px-2 text-xs font-bold text-[#8b8e84] underline underline-offset-4 hover:text-[#9f4330]"
                                  >
                                    מחיקה
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className="mt-4 flex flex-col gap-3 border-t border-[#e6e4dc] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button onClick={() => void generateAudiences()} disabled={generatingAudiences}>
                    {generatingAudiences ? "מציעים קהלים…" : "הצעת קהלים"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAudience((open) => !open);
                      setAudiencesError("");
                    }}
                    className="min-h-11 rounded-md border border-[#dedcd4] bg-white px-4 text-sm font-bold text-[#191b18] hover:border-[#191b18]"
                  >
                    {showAddAudience ? "סגירת הטופס" : "הוסף קהל ידנית"}
                  </button>
                  <span className="text-xs leading-5 text-[#8b8e84]">
                    {generatingAudiences
                      ? "ההצעה קוראת את העסק והאבחון — זה לוקח כמה שניות."
                      : "ההצעה רצה רק בלחיצה. היא לא נטענת מעצמה ולא דורסת קהל שכתבתם."}
                  </span>
                </div>

                {showAddAudience ? (
                  <div className="mt-4 rounded-lg border border-[#dedcd4] bg-[#f8f7f4] p-4">
                    <h3 className="text-sm font-black text-[#191b18]">קהל חדש</h3>
                    <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                      מה שתכתבו כאן ישמש את הפוסטים ואת המדידה. הקהל הראשון שתוסיפו הופך לקהל
                      המוביל, ואחריו הסימון הוא בחירה מפורשת.
                    </p>
                    <div className="mt-3">
                      <AudienceFormFields
                        form={newAudience}
                        onChange={setNewAudience}
                        idPrefix="new-audience"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => void addAudience()} disabled={audienceBusy === "new"}>
                        {audienceBusy === "new" ? "מוסיפים…" : "הוספת הקהל"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewAudience(EMPTY_AUDIENCE_FORM);
                          setShowAddAudience(false);
                        }}
                        disabled={audienceBusy === "new"}
                        className="min-h-9 px-2 text-xs font-bold text-[#62635f] underline underline-offset-4 disabled:opacity-40"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                ) : null}

                {audiencesError ? null : (
                  <p className="mt-3 text-xs leading-5 text-[#8b8e84]">
                    את מי שכל פוסט משרת אפשר לשנות בעורך הפוסטים, ואת התוצאות לכל קהל רואים
                    ב
                    <Link href="/performance" className="font-bold text-[#191b18] underline underline-offset-4">
                      עמוד התוצאות
                    </Link>
                    .
                  </p>
                )}
              </SettingsGroup>

              <SettingsGroup
                id="targets"
                icon={<IconFlag className="h-4 w-4" />}
                label="עדיפויות"
                title="העדיפויות לרבעון"
                note="עד שלושה יעדים, לפי סדר החשיבות. היעד הראשון הוא זה שהתוכנית הרבעונית נבנית סביבו."
                badge={
                  rankedTargets.length
                    ? `${rankedTargets.length} מתוך ${MAX_TARGETS} · הראשון הוא המוביל`
                    : `אפשר לבחור עד ${MAX_TARGETS}`
                }
              >
                {rankedTargets.length && !candidates.length ? (
                  <ol className="space-y-2">
                    {rankedTargets.map((target, index) => (
                      <li
                        key={target}
                        className="flex items-start gap-3 rounded-md border border-[#e6e4dc] bg-white p-3"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#191b18] text-[11px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-bold leading-6 text-[#191b18]">
                          {target}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveTarget(index, index - 1)}
                            disabled={index === 0}
                            aria-label="העבר למעלה"
                            className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTarget(index, index + 1)}
                            disabled={index === rankedTargets.length - 1}
                            aria-label="העבר למטה"
                            className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTarget(target)}
                            aria-label="הסר יעד"
                            className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] hover:bg-[#f8f7f4]"
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {candidates.length ? (
                  <div className={rankedTargets.length ? "mt-4" : undefined}>
                    <TargetRanker
                      candidates={candidates}
                      value={rankedTargets}
                      onChange={handleRankedChange}
                    />
                  </div>
                ) : null}

                {!candidates.length && !rankedTargets.length ? (
                  <p className="rounded-md border border-dashed border-[#dedcd4] bg-[#f8f7f4] px-4 py-6 text-center text-sm text-[#8b8e84]">
                    עוד לא נבחרו עדיפויות. טענו הצעות של {AGENT_NAME} ובחרו מהן.
                  </p>
                ) : null}

                {candidates.length && rankedTargets.length ? (
                  <p className="mt-3 text-xs leading-5 text-[#8b8e84]">
                    אפשר לסדר מחדש או להסיר כאן. כדי להוסיף יעד — טענו הצעות חדשות.
                  </p>
                ) : null}

                {capNote ? (
                  <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-3 py-2 text-xs leading-5 text-[#685f47]">
                    {capNote}
                  </p>
                ) : null}

                {candidatesError ? (
                  <p className="mt-3 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-3 py-2 text-xs leading-5 text-[#9f4330]">
                    {candidatesError}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-3 border-t border-[#e6e4dc] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button onClick={() => void loadCandidates()} disabled={loadingCandidates}>
                    {loadingCandidates ? "טוענים הצעות…" : "טען הצעות חדשות"}
                  </Button>
                  <span className="text-xs leading-5 text-[#8b8e84]">
                    ההצעות נבנות מהעסק, מהאתר ומהאבחון. זה קורה רק כשמבקשים — לא אוטומטית.
                  </span>
                </div>
              </SettingsGroup>

              <section
                id="save"
                ref={saveSection}
                className="scroll-mt-4 rounded-lg border border-[#e6e4dc] bg-white p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-black text-[#191b18]">
                    <span aria-hidden className="h-1.5 w-1.5" style={{ background: ACCENT }} />
                    שמירת ההחלטות
                  </h2>
                  <span className="text-[11px] text-[#8b8e84]" role="status">
                    {saveState}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-[#5e6159]">
                  השינויים בעמוד הזה לא נשמרים עד שלוחצים כאן, והם נכנסים לתוכניות שנבנות מכאן
                  והלאה.
                </p>

                {saved ? (
                  <p className="mt-3 rounded-md border border-[#c7d6c2] bg-[#f3f7f1] px-4 py-3 text-sm leading-6 text-[#374b3d]">
                    <span className="font-bold">ההחלטות נשמרו ✓ </span>
                    מכאן הן מזינות את התוכניות. את התמונה הגדולה אפשר לראות ב
                    <Link href="/plan" className="font-bold underline underline-offset-4">
                      תוכנית הרבעונית
                    </Link>
                    .
                  </p>
                ) : null}

                {saveError ? (
                  <div className="mt-3">
                    <ErrorNote message={saveError} />
                  </div>
                ) : null}

                <div className="mt-4 flex justify-end border-t border-[#e6e4dc] pt-4">
                  <Button onClick={() => void save()} disabled={saving}>
                    {saving ? "שומרים…" : "שמירת ההחלטות"}
                  </Button>
                </div>
              </section>

              <section className="rounded-lg border border-[#e6e4dc] bg-white p-5 sm:p-6">
                <h2 className="text-sm font-black text-[#191b18]">איפה כל תוכנית יושבת</h2>
                <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
                  ההחלטות שלמעלה מזינות את שתי התוכניות. אלה המקומות שבהם קוראים אותן.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/plan"
                    className="rounded-md border border-[#e6e4dc] bg-[#f8f7f4] p-4 hover:border-[#191b18]"
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-[#191b18]">
                      <IconCompass className="h-4 w-4" />
                      התוכנית הרבעונית
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#5e6159]">
                      לאן הולכים בשלושת החודשים הקרובים, ומה אבן הדרך בכל חודש.
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#20211f]">
                      לעמוד התוכנית
                      <IconArrowLeft className="h-3.5 w-3.5" />
                    </span>
                  </Link>

                  <Link
                    href="/strategy"
                    className="rounded-md border border-[#e6e4dc] bg-[#f8f7f4] p-4 hover:border-[#191b18]"
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-[#191b18]">
                      <IconRoute className="h-4 w-4" />
                      התוכנית החודשית
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#5e6159]">
                      מה עושים החודש — הפוסטים, הערוצים ואיך התקציב מתפצל ביניהם.
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#20211f]">
                      לעמוד החודש
                      <IconArrowLeft className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* Mobile: the save is a real bar above the app's bottom nav, never out of reach. */}
        {business ? (
          <div className="fixed inset-x-0 bottom-[68px] z-40 flex items-center gap-3 border-t border-[#dedcd4] bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
            {/* Announced only while it says something the user does not already know. */}
            <span
              className="min-w-0 flex-1 text-[11px] leading-4 text-[#8b8e84]"
              role={savePending ? "status" : undefined}
            >
              {saveState}
            </span>
            <Button size="sm" onClick={() => void saveFromBar()} disabled={saving}>
              {saving ? "שומרים…" : "שמירת ההחלטות"}
            </Button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

/**
 * One audience segment's editable fields — the same four the manual form asks for, so a
 * generated segment and a hand-written one are edited in exactly the same way.
 */
function AudienceFormFields({
  form,
  onChange,
  idPrefix,
}: {
  form: AudienceForm;
  onChange: (next: AudienceForm) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-xs font-bold text-[#191b18]">
          שם הקהל
        </label>
        <input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="משפחות מיפו שקונות לשישי"
          className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-summary`} className="mb-1 block text-xs font-bold text-[#191b18]">
          שורה אחת על מי זה
        </label>
        <input
          id={`${idPrefix}-summary`}
          value={form.summary}
          onChange={(event) => onChange({ ...form, summary: event.target.value })}
          placeholder="מי שקונה לשולחן של שישי וחוזר כל שבוע"
          className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-needs`} className="mb-1 block text-xs font-bold text-[#191b18]">
          מה הקהל צריך (מופרד בפסיקים)
        </label>
        <input
          id={`${idPrefix}-needs`}
          value={form.needs}
          onChange={(event) => onChange({ ...form, needs: event.target.value })}
          placeholder="חלה טרייה לשישי, מארז חג, שעות פתיחה מדויקות"
          className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-where`} className="mb-1 block text-xs font-bold text-[#191b18]">
          איפה פוגשים אותו (מופרד בפסיקים)
        </label>
        <input
          id={`${idPrefix}-where`}
          value={form.where}
          onChange={(event) => onChange({ ...form, where: event.target.value })}
          placeholder="שוק הפשפשים, קבוצות השכונה, אינסטגרם"
          className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="mb-1 block text-xs font-bold text-[#191b18]">
          תיאור מלא (לא חובה)
        </label>
        <textarea
          id={`${idPrefix}-description`}
          rows={3}
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          placeholder="מי הם, מה חשוב להם, ומה גורם להם לחזור"
          className="w-full rounded-md border border-[#dedcd4] bg-white px-3 py-2 text-sm leading-6"
        />
      </div>
    </div>
  );
}

/** A row of chips with its own label — needs and "where" read the same way on every card. */
function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2.5">
      <p className="text-[10px] font-bold text-[#8b8e84]">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
            style={{ background: SURFACE, borderColor: ACCENT_BORDER, color: ACCENT }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One labelled line of the rail's "where things stand" summary. */
function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-[#8b8e84]">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm leading-5">{children}</dd>
    </div>
  );
}

/**
 * A settings group: label, why it matters, the current value as a badge, then the control.
 * Deliberately not a bordered card — the accent rail and the heading carry the grouping,
 * so the screen reads as one form rather than a stack of boxes.
 */
function SettingsGroup({
  id,
  icon,
  label,
  title,
  note,
  badge,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  note: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 border-t pt-6 first:border-t-0 first:pt-0"
      style={{ borderColor: ACCENT_BORDER }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-black" style={{ color: ACCENT }}>
            <span aria-hidden className="h-3 w-0.5" style={{ background: ACCENT }} />
            {icon}
            {label}
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-[#191b18]">{title}</h2>
        </div>
        {badge ? (
          <span
            className="self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold sm:self-auto"
            style={{ background: SURFACE, borderColor: ACCENT_BORDER, color: ACCENT }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#63665e]">{note}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function QuestionBlock({
  title,
  note,
  onClear,
  children,
}: {
  title: string;
  note?: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#e6e4dc] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-[#191b18]">{title}</h3>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] text-[#5e6159] underline underline-offset-4"
          >
            בטל בחירה
          </button>
        ) : null}
      </div>
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
        selected
          ? "border-[#191b18] bg-[#191b18] text-white"
          : "border-[#e6e4dc] bg-[#f8f7f4] text-[#191b18] hover:border-[#191b18]"
      }`}
    >
      <span className="block text-xs font-bold">{title}</span>
      {desc ? <span className="mt-1 block text-[11px] opacity-80">{desc}</span> : null}
    </button>
  );
}
