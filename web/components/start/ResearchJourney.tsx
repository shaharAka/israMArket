"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, endpoints, exitDemo, isDemo } from "@/lib/api";
import { emptyFlow, loadFlow, saveFlow, draftForApi, clearSavedFlow, scanBrand, validateLinks, exitDraftMock, type FlowState, type OnboardingDraft, type LinkKey } from "@/lib/draft";
import { mergeResearchReplies, BUSINESS_SEGMENTS, METRICS, observationValid, type Segment, type ResearchJourney as Journey, type Observation, type DiscoveryResult } from "@/lib/researchJourney";
import { StepName, StepDifferent, StepAudiences, type StepProps } from "./steps";
import { StepSoftwareOffer } from "./StepSoftwareOffer";
import { StepSoftware } from "./StepSoftware";
import { ServiceClientSources } from "./BusinessRoute";
import { StepSave } from "./StepSave";
import { StepShell, TextInput } from "./ui";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { HowToFind } from "@/components/help/HowToFind";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { IdentityMark } from "@/components/landing-v2/IdentityMark";
import { BuildReview, REVIEW_PATHS } from "./BuildReview";
import { BUSINESS_EXAMPLES } from "@/components/landing-v2/businessExamples";
import { inferField } from "@/lib/businessFields";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import styles from "./start.module.css";
import form from "./form.module.css";

const BEFORE = ["name", "offer", "different", "audiences", "links", "discovery", "signup"];
function sequence(j: Journey) { return j.phase === "before" ? BEFORE : [...(j.segment === "software" ? ["software_offer", "software"] : []), "sources", "connections", "metrics", "detail", "build"]; }
function initialJourney(segment: Segment): Journey { return { version: 1, segment, phase: "before", step: "name", replies: [], observations: [] }; }
function selectSegment(flow: FlowState, segment: Segment): FlowState {
  const choice = BUSINESS_SEGMENTS.find(item => item.key === segment)!;
  const previous = flow.draft.research_journey;
  const changed = previous && previous.segment !== segment;
  return { ...flow, modelConfirmed: true, plan: null, quarterPlan: null, draft: { ...flow.draft,
    business_model: choice.model, presence_type: segment === "online_shop" ? "online_only" : segment === "physical_shop" ? "brick_and_mortar" : undefined,
    goal: segment === "fundraising" ? "brand_awareness" : choice.model === "products" ? "sales" : "leads",
    baseline: undefined, lever: undefined, target: undefined, success: undefined, budget: undefined,
    research_journey: changed ? { ...initialJourney(segment), step: "offer" } : previous ?? initialJourney(segment) } };
}

/** Public discovery ends at account creation. Only signed-in owners get recommendations. */
export function ResearchJourney() {
  const router = useRouter(); const t = useCopy(); const { locale } = useLanguage();
  const [flow, setFlow] = useState<FlowState | null>(null);
  const latest = useRef<FlowState | null>(null);
  const [signedIn, setSignedIn] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [mock, setMock] = useState(false);
  const mockRef = useRef(false);
  const [showSegments, setShowSegments] = useState(false);
  function update(fn: (f: FlowState) => FlowState) {
    // Keep the ref current synchronously: typing and clicking Next may share a render.
    const current = latest.current; if (!current) return;
    const next = fn(current); latest.current = next; if (!mockRef.current) saveFlow(next); setFlow(next);
  }
  function setDraft(patch: Partial<OnboardingDraft>) { update(f => ({ ...f, draft: { ...f.draft, ...patch } })); }
  function patchJourney(patch: Partial<Journey>) { update(f => ({ ...f, draft: { ...f.draft, research_journey: { ...f.draft.research_journey!, ...patch } } })); }
  async function persist(current: FlowState) {
    const errors = await validateLinks(current.draft.links).catch(() => Object.fromEntries(Object.entries(current.draft.links).filter(([, v]) => v?.trim()).map(([k]) => [k, t("לא הצלחנו לבדוק את הקישור. אפשר לתקן אותו בחיבורים בהמשך.")])));
    const safe = { ...current, deferredLinks: Object.keys(errors) as LinkKey[] };
    await api("/onboarding/from-draft", { method: "POST", body: JSON.stringify({ draft: draftForApi(safe), deferred_links: Object.fromEntries(Object.keys(errors).map(key => [key, current.draft.links[key as LinkKey] ?? ""])) }) });
  }
  async function enterAccount() {
    const current = latest.current; if (!current) return;
    setBusy(true); setError("");
    const j = current.draft.research_journey!;
    const next = { ...current, draft: { ...current.draft, research_journey: { ...j, phase: "after" as const, step: j.segment === "software" ? "software_offer" : "sources" } } };
    try {
      if (!mock) { const owner = await endpoints.me(); next.researchOwnerId = owner.id; await persist(next); } setSignedIn(true); update(() => next); window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור. התשובות נשמרו במכשיר; נסו שוב."));
    } finally { setBusy(false); }
  }
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
    const params = new URLSearchParams(window.location.search); const preview = params.get("mock") === "1";
    mockRef.current = preview; setMock(preview); if (!preview) { exitDraftMock(); if (isDemo()) exitDemo(); }
    const saved = preview ? emptyFlow() : loadFlow() ?? emptyFlow();
    const requested = params.get("segment") ?? ({ products: "online_shop", saas: "software", services: "services", nonprofit: "fundraising" } as Record<string, string>)[params.get("model") ?? ""];
    const segment = BUSINESS_SEGMENTS.some(x => x.key === requested) ? requested as Segment : saved.draft.research_journey?.segment ?? (saved.draft.business_model === "saas" ? "software" : saved.draft.business_model === "products" ? "online_shop" : "services");
    const loaded = saved.draft.research_journey ? (requested ? selectSegment(saved, segment) : saved) : selectSegment(saved, segment);
    // Old browser drafts retain owner answers, but no old plan or numerical assumptions cross this gate.
    if (!saved.draft.research_journey) { loaded.draft.research_journey!.step = loaded.draft.business_name ? "offer" : "name"; loaded.modelConfirmed = Boolean(requested || saved.modelConfirmed); }
    if (params.get("site") && !loaded.draft.links.website) loaded.draft.links.website = params.get("site")!;
        const reviewStep = params.get("review_step");
    if (preview && reviewStep) {
      const example = BUSINESS_EXAMPLES[REVIEW_PATHS[segment]];
      // Review-only fixture: the preview uses the same business as its plan view.
      // Never loads or saves a customer's draft or calls generation.
      loaded.draft.business_name = t(example.name);
      loaded.draft.offerings = t({
        fundraising: "חונכות לילדים שצריכים עזרה בלימודים",
        software: "תוכנית שיווק, פוסטים ולמידה מהתוצאות לעסקים קטנים",
        services: "עיצוב פנים לדירות לפני שיפוץ",
        online_shop: "לחמים וחלות להזמנה מראש ולאיסוף במאפייה",
        physical_shop: "לחמים וחלות במאפייה שכונתית",
      }[segment]);
      loaded.draft.audiences = [{ name: t(example.audience), description: "" }];
      loaded.draft.research_journey!.metric = METRICS[segment][0].key;
      loaded.draft.business_type = "other"; loaded.modelConfirmed = true;
      loaded.draft.research_journey!.phase = params.get("phase") === "after" ? "after" : "before";
      if (sequence(loaded.draft.research_journey!).includes(reviewStep)) loaded.draft.research_journey!.step = reviewStep;
    }
    latest.current = loaded; setFlow(loaded); if (!preview) saveFlow(loaded);
    const googleError = googleErrorFromLocation(); if (googleError) setError(googleError);
    if (preview) return;
    endpoints.me().then(async (owner) => {
      const response = await endpoints.business(); if (!live) return;
      if (response.business?.onboarding_complete || response.business?.quarter_plan) { router.replace("/dashboard"); return; }
      setSignedIn(true);
      const stored = response.business?.owner_context?.research_journey;
      if (stored) {
        const local = latest.current!;
        // Local edits win only for this same incomplete workspace; another account's draft cannot overwrite it.
        const same = local.researchOwnerId === owner.id && local.draft.research_journey?.phase === "after" && local.draft.business_name === stored.answers.business_name;
        const recovered = same ? local : { ...emptyFlow(), researchOwnerId: owner.id, modelConfirmed: true, draft: { ...stored.answers, links: { ...stored.answers.links, ...Object.fromEntries(Object.entries(response.business?.owner_context?.pending_links ?? {}).map(([key, pending]) => [key, pending.url])) }, research_journey: { ...stored, answers: undefined } as Journey } };
        latest.current = recovered; setFlow(recovered); saveFlow(recovered);
      } else if (params.get("resume") === "save") { await enterAccount(); }
      if (params.has("resume")) { params.delete("resume"); window.history.replaceState(null, "", `${window.location.pathname}?${params}`); }
    }).catch((err) => {
      if (!live) return;
      // Only an expired session returns to signup; a server outage must not look like logout.
      if (err instanceof ApiError && err.status === 401) {
        if (latest.current?.draft.research_journey?.phase === "after") patchJourney({ phase: "before", step: "signup" });
      } else {
        setError(t("לא הצלחנו לטעון את החשבון כרגע. התשובות נשמרו במכשיר; נסו לרענן."));
      }
    });
    }, 0);
    return () => { live = false; window.clearTimeout(timer); };
    // Initial URL, account and browser draft are read once; later edits do not restart the interview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!flow) return <p className="p-8"><Copy text="טוענים…" /></p>;
  const journey = flow.draft.research_journey!; const steps = sequence(journey); const index = steps.indexOf(journey.step);
  const common: StepProps = { flow, update, setDraft, next: () => void advance(), reflection: null, focus: true, direction, nextLabel: ({ name: "לספר על העסק", offer: "לספר מה מייחד אתכם", different: "מי הלקוחות שלכם?", audiences: "להוסיף אתר ופרופילים", discovery: "להמשיך לפתיחת החשבון", software_offer: "מה המוצר פותר?", software: "איך לקוחות מוצאים אתכם?", sources: "להמשיך לחיבורים", connections: "מה ייחשב הצלחה?", metrics: "עוד שאלה קצרה", detail: "להמשיך לבניית התוכנית" } as Record<string, string>)[journey.step], notice: error ? <p role="alert" className={form.error}>{error}</p> : undefined };
  async function move(step: string, back = false) {
    const current = latest.current!; const j = current.draft.research_journey!;
    const next = { ...current, step, seen: [...new Set([...current.seen, j.step])], draft: { ...current.draft, research_journey: { ...j, step } } };
    setBusy(true); setError("");
    try { if (signedIn && j.phase === "after" && !mock) await persist(next); update(() => next); setDirection(back ? "back" : "fwd"); window.scrollTo({ top: 0 }); }
    catch (err) { setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור. נסו שוב.")); }
    finally { setBusy(false); }
  }
  async function advance() { const j = latest.current!.draft.research_journey!; const all = sequence(j); const next = all[all.indexOf(j.step) + 1]; if (next && !busy) await move(next); }
  let screen;
  switch (journey.step) {
    case "name": screen = <StepName {...common} />; break;
    case "offer": screen = <StepShell {...common} title="מה אתם עושים?" why="" primary="להמשיך" primaryDisabled={busy || !flow.modelConfirmed || flow.draft.offerings.trim().length < 3} onPrimary={() => { const field = inferField(flow.draft.offerings); setDraft({ business_type: field ?? "other" }); void advance(); }}>
      {showSegments || !flow.modelConfirmed ? <fieldset><legend className={form.label}><Copy text="מה אתם עושים?" /></legend><div className="flex flex-wrap gap-2">{BUSINESS_SEGMENTS.map(item => <button key={item.key} type="button" className={form.chip} aria-pressed={journey.segment === item.key} onClick={() => { update(f => selectSegment(f, item.key)); setShowSegments(false); }}><Copy text={item.label} /></button>)}</div></fieldset> : <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-3"><Copy text={BUSINESS_SEGMENTS.find(item => item.key === journey.segment)!.label} /><button type="button" onClick={() => setShowSegments(true)} className="min-h-11 text-sm text-[var(--primary)]"><Copy text="לשנות את סוג העסק" /></button></div>}
      <TextInput id="offering" label={journey.segment === "fundraising" ? "למען מה אתם פועלים ומבקשים תמיכה?" : "מה אתם מציעים ללקוחות?"} value={flow.draft.offerings} onChange={offerings => setDraft({ offerings })} maxLength={900} />
    </StepShell>; break;
    case "different": screen = <StepDifferent {...common} />; break;
    case "audiences": screen = <StepAudiences {...common} />; break;
    case "links": screen = <StepShell {...common} title="איפה אפשר להכיר אתכם?" why="אתר ופרופילים עסקיים, אם יש. אין צורך בסיסמה או בחיבור חשבון בשלב הזה." primary="להכיר את העסק" primaryDisabled={busy} onPrimary={() => void advance()} actionNote={<p className="text-sm text-[var(--ink-muted)]"><Copy text="אין קישור כרגע? אפשר להמשיך עם מה שסיפרתם." /></p>}>
      {(["website", "instagram", "facebook"] as const).map(key => <div key={key}><TextInput id={`public-${key}`} label={{ website: "אתר העסק", instagram: "פרופיל האינסטגרם של העסק", facebook: "עמוד הפייסבוק של העסק" }[key]} value={flow.draft.links[key] ?? ""} onChange={value => setDraft({ links: { ...latest.current!.draft.links, [key]: value } })} dir="ltr" maxLength={300} /><HowToFind topic={key} /></div>)}
    </StepShell>; break;
    case "discovery": case "detail": screen = <DiscoveryStep {...common} mock={mock} after={journey.phase === "after"} onReplies={replies => patchJourney({ replies: mergeResearchReplies(journey.replies, replies) })} />; break;
    case "signup": screen = <StepSave {...common} researchOnly loggedIn={signedIn || mock} saving={busy} saveError={error} onSave={enterAccount} />; break;
    case "software_offer": screen = <StepSoftwareOffer {...common} />; break;
    case "software": screen = <StepSoftware {...common} />; break;
    case "sources": screen = <StepShell {...common} title={journey.segment === "fundraising" ? "איך אנשים מגיעים לעשייה שלכם?" : "איך לקוחות מוצאים אתכם היום?"} why="" primary="להמשיך לחיבורים" primaryDisabled={busy} onPrimary={() => void advance()}><ServiceClientSources flow={flow} setDraft={setDraft} /></StepShell>; break;
    case "connections": screen = <StepShell {...common} title="נחבר את המידע שכבר יש לכם" why="החיבורים עוזרים לראות מה מביא רכישות, פניות או תרומות. תוכלו לחזור לכאן אחרי אישור החיבור; התשובות נשמרות בחשבון." primary="להמשיך למה שנמדוד" primaryDisabled={busy} onPrimary={() => void advance()}><Link href="/integrations" className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)]"><Copy text="לבחור ולחבר את הכלים שלי" /></Link><p><Copy text="אפשר להמשיך גם בלי חיבור. נציין מה עוד לא נמדד, ונשלים בהמשך." /></p></StepShell>; break;
    case "metrics": screen = <MetricsStep {...common} onChange={patchJourney} />; break;
    case "build": screen = <BuildReview {...common} mock={mock} busy={busy} canStart={signedIn && !busy}
      onDone={() => { void clearSavedFlow(); router.replace("/strategy"); }} />; break;
  }
  return <div className={`start-blue ${styles.flow}`}><header className="border-b border-[var(--rule)]"><div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" aria-label={t("ישראמארקט")} className="product-wordmark !text-[22px]" dir="ltr"><IdentityMark /></Link><ProductUtilities inline /></div></header>
    <main className="mx-auto w-full max-w-[760px] px-5 py-6 sm:py-10" aria-busy={busy}>{index > 0 ? <button type="button" disabled={busy} onClick={() => void move(steps[index - 1], true)} className="mb-4 min-h-11 text-sm"><Copy text="חזרה" /></button> : null}
      <div className="mb-7 flex gap-1" aria-label={t("התקדמות בהיכרות")} role="progressbar" aria-valuenow={Math.max(1, index + 1)} aria-valuemin={1} aria-valuemax={steps.length}>{steps.map((step, i) => <span key={step} className={`h-1 flex-1 ${i <= index ? "bg-[var(--primary)]" : "bg-[var(--rule)]"}`} />)}</div>
      <div key={journey.step}>{screen}</div>
      <span className="sr-only" lang={locale}>{t("ישראמארקט")}</span>
    </main></div>;
}

function DiscoveryStep(props: StepProps & { after: boolean; mock: boolean; onReplies: (replies: { question: string; answer: string }[]) => void }) {
  const [result, setResult] = useState<DiscoveryResult | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const t = useCopy(); const { locale } = useLanguage();
  useEffect(() => {
    let live = true;
    async function read() {
      if (props.mock) {
        setResult({ sources: [], assisted: true, questions: [{ question: props.after ? t("מה הכי חשוב להסביר על ההצעה שלכם לפני שמישהו מחליט?") : t("מה חשוב שאנשים יבינו על מה שאתם עושים?"), quote: "", source: "answers" }] });
        setAnswers([""]); return;
      }
      // Independent checks share one wait; the brand API applies its own URL guards.
      const [errors, brand] = await Promise.all([
        validateLinks(props.flow.draft.links).catch(() => Object.fromEntries(Object.keys(props.flow.draft.links).map(key => [key, "unchecked"]))),
        props.flow.draft.links.website ? scanBrand(props.flow.draft.links.website, props.flow.draft).catch(() => null) : Promise.resolve(null),
      ]);
      const safe = { ...props.flow, deferredLinks: Object.keys(errors) as LinkKey[] };
      if (live && brand) props.update(f => ({ ...f, brandScan: { ...brand, url: props.flow.draft.links.website! } }));
      const value = await api<DiscoveryResult>(props.after ? "/onboarding/interview" : "/public/discovery", { method: "POST", body: JSON.stringify({ draft: draftForApi(safe), locale }) });
      if (live) { setResult(value); setAnswers(value.questions.map(q => props.flow.draft.research_journey?.replies.find(r => r.question === q.question)?.answer ?? "")); }
    }
    read().catch(() => { if (live) setError(t("לא הצלחנו לקרוא כרגע. אפשר להמשיך עם מה שסיפרתם ולהשלים בהמשך.")); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // This screen runs one bounded research request per entry, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <StepShell {...props} title={props.after ? "מה למדנו על העסק שלכם" : "בואו נוודא שהבנו אתכם"} why="" primary={props.after ? "להמשיך לבניית התוכנית" : "להמשיך לפתיחת החשבון"} onPrimary={() => { props.onReplies((result?.questions ?? []).map((q, i) => ({ question: q.question, answer: answers[i] ?? "" }))); props.next(); }}>
    {loading ? <p role="status"><Copy text="קוראים את המידע ומכינים שאלה להיכרות…" /></p> : null}
    {error ? <p role="status">{error}</p> : null}
    {result?.facts?.length ? <section className="space-y-3 border-b border-[var(--rule)] pb-5"><h2 className="font-semibold"><Copy text="מה למדנו על העסק שלכם" /></h2>{result.facts.map((fact, i) => <blockquote key={i} className="border-s-2 border-[var(--rule)] ps-3 text-sm"><p>{fact.quote}</p><a className="text-xs underline" href={fact.url} target="_blank" rel="noopener noreferrer"><Copy text="למקור" /></a></blockquote>)}</section> : null}
    {result?.sources.length ? <details className="text-sm text-[var(--ink-muted)]"><summary className="cursor-pointer"><Copy text="המידע שעליו הסתמכנו" /></summary><ul className="mt-3 space-y-2">{result.sources.map((source, i) => <li key={`${source.url}-${i}`}><bdi>{source.url}</bdi> · <Copy text={source.status === "read" ? "נקרא" : source.status === "not_read" ? "הקישור נשמר. תוכן הפרופיל עדיין לא נקרא." : source.status === "limited" || source.status === "blocked" ? "הקריאה מוגבלת. אפשר להמשיך בלי המידע הזה." : "לא הצלחנו לקרוא. נמשיך עם התשובות שלכם."} /></li>)}</ul></details> : null}
    {result && !result.assisted ? <p className="text-sm text-[var(--ink-muted)]"><Copy text="המחקר המותאם לא זמין כרגע. אפשר להמשיך בהיכרות ולהשלים אותו בחשבון." /></p> : null}
    <p className="border-b border-[var(--rule)] pb-4">{props.flow.draft.business_name} · {props.flow.draft.offerings}</p>
    {result?.questions.map((q, i) => <div key={i}>{q.quote ? <blockquote className="border-s-2 border-[var(--rule)] ps-3 text-sm">{q.quote}</blockquote> : null}<TextInput id={`research-answer-${i}`} label={q.question} value={answers[i] ?? ""} onChange={answer => setAnswers(list => list.map((old, at) => at === i ? answer : old))} maxLength={600} /></div>)}
  </StepShell>;
}

function MetricsStep(props: StepProps & { onChange: (patch: Partial<Journey>) => void }) {
  const t = useCopy();
  const j = props.flow.draft.research_journey!; const segment = j.segment;
  const choices = METRICS[segment]; const metric = j.metric ?? choices[0].key;
  const baselineLabel = { purchases: "כמה הזמנות הושלמו באתר ב-30 הימים האחרונים?", store_sales: "כמה קניות היו בחנות ב-30 הימים האחרונים?", qualified_inquiries: "כמה פניות התאימו לשירות שלכם ב-30 הימים האחרונים?", booked_work: "כמה עבודות או פגישות נסגרו ב-30 הימים האחרונים?", paid_accounts: "כמה לקוחות התחילו לשלם ב-30 הימים האחרונים?", demos: "כמה הדגמות עם לקוחות מתאימים התקיימו ב-30 הימים האחרונים?", trials: "כמה התנסויות חדשות התחילו ב-30 הימים האחרונים?", donations: "כמה תרומות קיבלתם ב-30 הימים האחרונים?", recurring_donors: "כמה תורמים קבועים הצטרפו ב-30 הימים האחרונים?" }[metric];
  const values: Observation[] = [j.observations.find(x => x.key === "outcomes") ?? { key: "outcomes", status: "unknown", unit: "count", period: "last_30_days", source: "owner" }, j.observations.find(x => x.key === "marketing_budget") ?? { key: "marketing_budget", status: "unknown", unit: "ILS", period: "per_month", source: "owner" }];
  function observations(next: Observation[]) { return [...j.observations.filter(value => value.key === "order_value"), ...next]; }
  const [error, setError] = useState("");
  function change(index: number, value: Observation) { props.onChange({ metric, observations: observations(values.map((x, i) => i === index ? value : x)) }); }
  return <StepShell {...props} title="מה ייחשב הצלחה בשבילכם?" why="" primary="להמשיך" onPrimary={() => { if (!values.every(observationValid)) { setError("הזינו מספרים חיוביים או אפס. כמות צריכה להיות מספר שלם, ובטווח המספר השני צריך להיות גדול מהראשון או שווה לו."); return; } props.onChange({ metric, observations: observations(values) }); props.next(); }}>
    <fieldset><legend className="sr-only"><Copy text="התוצאה שהכי חשובה לכם כרגע" /></legend><div className="flex flex-wrap gap-2">{choices.map(item => <button key={item.key} type="button" className={form.chip} aria-pressed={metric === item.key} onClick={() => props.onChange({ metric: item.key, observations: j.observations.filter(x => x.key !== "outcomes") })}><Copy text={item.label} /></button>)}</div></fieldset>
    <TextInput id="campaign-location" label="באיזה אזור או מדינה תרצו לפרסם?" placeholder="למשל: חיפה והסביבה, כל ישראל או ארצות הברית" value={props.flow.draft.city ?? ""} onChange={city => props.setDraft({ city })} maxLength={80} />
    {values.map((value, i) => <fieldset key={value.key} className="space-y-3 border-t border-[var(--rule)] pt-5"><legend className={form.label}><Copy text={i === 0 ? baselineLabel : "כמה תרצו להשקיע בפרסום בחודש?"} /></legend>
      <div className="flex flex-wrap gap-2">{[{ key: "unknown", label: "לא יודעים כרגע" }, { key: "exact", label: "יש לי מספר" }, { key: "range", label: "יש לי טווח" }].map(option => <button key={option.key} type="button" className={form.chip} aria-pressed={value.status === option.key} onClick={() => change(i, { ...value, status: option.key as Observation["status"], lower: null, upper: null })}><Copy text={option.label} /></button>)}</div>
      {value.status !== "unknown" ? <div className="grid gap-3 sm:grid-cols-2"><TextInput id={`metric-${i}-lower`} label={t(value.status === "range" ? "המספר הנמוך בטווח" : value.unit === "ILS" ? "סכום בשקלים" : "מספר")} value={value.lower == null ? "" : String(value.lower)} onChange={text => change(i, { ...value, lower: text.trim() ? Number(text) : null })} inputMode={value.unit === "count" ? "numeric" : "decimal"} dir="ltr" />{value.status === "range" ? <TextInput id={`metric-${i}-upper`} label={t("המספר הגבוה בטווח")} value={value.upper == null ? "" : String(value.upper)} onChange={text => change(i, { ...value, upper: text.trim() ? Number(text) : null })} inputMode={value.unit === "count" ? "numeric" : "decimal"} dir="ltr" /> : null}</div> : null}
    </fieldset>)}
    {error ? <p role="alert" className={form.error}>{error}</p> : null}
  </StepShell>;
}
