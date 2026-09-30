/**
 * The conversation's script: the order of the questions, their chapters, and what the
 * consultant says back after each answer.
 *
 * Reflections are templated here from the answers, not written by a model: they have to
 * appear instantly, and they only restate what the owner said plus one piece of plain
 * marketing sense. They never promise a number.
 */
import {
  NETWORKS,
  inferBusinessModel,
  TRIED_OPTIONS,
  firstOffering,
  kitFor,
  monthsLabel,
  type FlowState,
  type Network,
} from "@/lib/draft";
import { baselineSummary, leverReflection, targetText } from "@/lib/goals";
import { budgetLabel } from "@/lib/quarterPlan";
import { withLamed } from "./ui";

export type StepId =
  | "name"
  | "what"
  | "different"
  | "audiences"
  | "seasons"
  | "links"
  | "tried"
  | "competitors"
  | "grow"
  | "baseline"
  | "lever"
  | "budget"
  | "target"
  | "found"
  | "direction"
  | "quarter"
  | "save";

export const CHAPTERS: { key: string; label: string; short?: string; steps: StepId[] }[] = [
  { key: "business", label: "העסק", steps: ["name", "what", "different"] },
  { key: "customers", label: "הלקוחות", steps: ["audiences", "seasons"] },
  { key: "marketing", label: "איך משווקים", steps: ["links", "tried", "competitors"] },
  // Revision 6: where the business is today, what to grow, the budget, and the calculated target.
  { key: "goal", label: "המטרה והתקציב", short: "המטרה", steps: ["grow", "baseline", "lever", "budget", "target"] },
  // "מה למדנו" leads straight into the 3-month plan: that plan is the artifact.
  { key: "plan", label: "מה למדנו", steps: ["found", "quarter", "save"] },
];

export const STEP_ORDER: StepId[] = CHAPTERS.flatMap((chapter) => chapter.steps);

const STEP_DESTINATIONS: Record<StepId, string> = {
  name: "לשם העסק", what: "לתיאור העסק", different: "למה שמייחד את העסק",
  audiences: "ללקוחות", seasons: "לעונות השנה", links: "לאתר ולרשתות",
  tried: "למה שכבר ניסיתם", competitors: "למתחרים", grow: "למטרת הצמיחה",
  baseline: "למצב העסק היום", lever: "להמלצה לצמיחה", budget: "לתקציב",
  target: "ליעד ל־3 חודשים", found: "למה שגילינו", direction: "לכיוון התוכנית",
  quarter: "לתוכנית ל־3 חודשים", save: "לשמירת התוכנית",
};

export function nextStepLabel(step: StepId, flow: FlowState): string | undefined {
  const destination = nextStep(step, flow);
  return destination ? `לעבור ${STEP_DESTINATIONS[destination]}` : undefined;
}

/**
 * A saved flow from an earlier version: "plan" was the single reveal (now "found"), the
 * one-page strategy and the sample posts became the 3-month plan, and the goal question
 * became "מה ייחשב הצלחה", which revision 6 replaced with the baseline, the lever and the target.
 */
export function migrateStep(value: string): string {
  if (value === "plan") return "found";
  if (value === "strategy" || value === "preview" || value === "direction") return "quarter";
  if (value === "goal" || value === "success") return "baseline";
  return value;
}

/** The model as the flow knows it: confirmed, or inferred from what the owner wrote. */
export function modelOf(flow: FlowState) {
  const d = flow.draft;
  return d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
}

/** "איפה אתם רוצים לגדול?" is for shops: a service business skips it. */
function skipped(step: StepId, flow: FlowState): boolean {
  return step === "grow" && modelOf(flow) === "services";
}

export function isStepId(value: string): value is StepId {
  return (STEP_ORDER as string[]).includes(value);
}

export function chapterIndexOf(step: StepId): number {
  return CHAPTERS.findIndex((chapter) => chapter.steps.includes(step));
}

export function previousStep(step: StepId, flow: FlowState): StepId | null {
  for (let index = STEP_ORDER.indexOf(step) - 1; index >= 0; index -= 1) {
    if (!skipped(STEP_ORDER[index], flow)) return STEP_ORDER[index];
  }
  return null;
}

export function nextStep(step: StepId, flow: FlowState): StepId | null {
  const start = STEP_ORDER.indexOf(step);
  if (start < 0) return null;
  for (let index = start + 1; index < STEP_ORDER.length; index += 1) {
    if (!skipped(STEP_ORDER[index], flow)) return STEP_ORDER[index];
  }
  return null;
}

/** The steps of a chapter this business is actually asked. */
export function chapterSteps(chapterIndex: number, flow: FlowState): StepId[] {
  return CHAPTERS[chapterIndex].steps.filter((step) => !skipped(step, flow));
}

const NETWORK_LABEL: Record<Network, string> = Object.fromEntries(
  NETWORKS.map((n) => [n.key, n.label]),
) as Record<Network, string>;

function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

function quote(text: string, max = 60): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

/** What the consultant says after `step` was answered (or skipped). */
export function reflectionAfter(step: StepId, flow: FlowState): string | null {
  const d = flow.draft;
  if (!flow.seen.includes(step)) return null;
  switch (step) {
    case "name":
      return d.business_name.trim() ? `נעים להכיר, ${d.business_name.trim()}.` : null;
    case "what": {
      const offer = firstOffering(d.offerings);
      const heard = kitFor(d.business_type).heard;
      return offer ? `הבנו: ${offer}. ${heard}` : heard;
    }
    case "different":
      return d.differentiator?.trim()
        ? `זה מה שנשים בחזית: ${quote(d.differentiator)}.`
        : "בסדר גמור. לרוב זה מסתתר במה שלקוחות מספרים עליכם, ונמצא את זה יחד.";
    case "audiences": {
      const names = d.audiences.map((a) => a.name.trim()).filter(Boolean);
      if (!names.length) return "נמצא יחד את הקהל הנכון. בינתיים נכתוב למי שגר ועובד קרוב אליכם.";
      if (names.length === 1) return `נכתוב קודם כול ${withLamed(names[0])}. קהל אחד ברור עדיף על כולם.`;
      return `נכתוב קודם ${withLamed(names[0])}, ואחר כך ${joinHe(names.slice(1).map(withLamed))}.`;
    }
    case "seasons": {
      const busy = d.seasons?.busy ?? [];
      const slow = d.seasons?.slow ?? [];
      if (busy.length) {
        const verb = busy.length > 1 ? "הם" : "הוא";
        const tail = slow.length ? " ובחודשים השקטים נחזיר לקוחות קבועים." : "";
        return `הבנו: ${monthsLabel(busy)} ${verb} העונה החזקה שלכם, ולכן נתחיל להתכונן שלושה שבועות לפני.${tail}`;
      }
      if (slow.length) {
        return `הבנו: ב${monthsLabel(slow)} שקט יותר. אלה החודשים להחזיר לקוחות קבועים.`;
      }
      return "אין בעיה. נתכנן לפי לוח השנה ונלמד מהתוצאות.";
    }
    case "links": {
      if (d.has_none) return "מתחילים נקי, וזה יתרון: אין הרגלים ישנים לתקן. נבחר ערוץ אחד ונעשה אותו טוב.";
      const regular = NETWORKS.find((n) => d.activity?.[n.key] === "regular" && d.links[n.key] !== undefined);
      if (regular) return `יש לכם כבר קהל ב${NETWORK_LABEL[regular.key]}. נבנה עליו לפני שנפתח ערוץ חדש.`;
      if (d.links.website !== undefined) return "נקרא את האתר ברקע ונלמד ממנו את הסגנון שלכם.";
      const any = NETWORKS.find((n) => d.links[n.key] !== undefined);
      if (any) return `נתחיל מ${NETWORK_LABEL[any.key]}, כי שם כבר מחפשים אתכם.`;
      return null;
    }
    case "tried": {
      const worked = d.tried?.what_worked?.trim();
      const channels = d.tried?.channels ?? [];
      if (worked) return `נחזק את מה שכבר הצליח: ${quote(worked)}.`;
      if (channels.includes("word_of_mouth")) {
        return "פה לאוזן הוא סימן מצוין: יש לקוחות שממליצים עליכם. נעזור להם לספר.";
      }
      if (channels.length) {
        const labels = TRIED_OPTIONS.filter((o) => channels.includes(o.key)).map((o) => o.label);
        return `ניסיתם ${joinHe(labels)}. נבדוק מה מזה שווה להמשיך, ומה לעזוב.`;
      }
      return "מתחילים מאפס, וזה בסדר. ערוץ אחד, עשוי טוב, מספיק להתחלה.";
    }
    case "competitors": {
      const names = (d.competitors ?? []).map((c) => c.name.trim()).filter(Boolean);
      if (names.length) return `נבדוק מה ${joinHe(names)} מפרסמים, ונמצא איפה אתם יכולים לבלוט.`;
      return "נחפש בעצמנו עסקים דומים באזור, וניקח מהם השראה, לא העתקה.";
    }
    case "grow":
      switch (d.grow_where) {
        case "online":
          return "הבנו: הצמיחה באתר. נמדוד הזמנות אונליין, לא רק לייקים.";
        case "store":
          return "הבנו: המטרה שיבואו לחנות. נדבר קודם למי שגר ועובד קרוב.";
        case "both":
          return "גם באתר וגם בחנות. נבדוק מה כל ערוץ מביא, בנפרד.";
        default:
          return null;
      }
    case "baseline": {
      const model = modelOf(flow);
      const answered = Object.values(d.baseline ?? {}).some((v) => v !== undefined && v !== "unknown");
      if (!answered) return "בסדר גמור. נמדוד מהשבוע הראשון, וזו תהיה נקודת הפתיחה.";
      return `הבנו: ${baselineSummary(d.baseline, model, model === "services" ? undefined : d.grow_where)}`;
    }
    case "lever":
      return d.lever ? leverReflection(d.lever.primary, d.baseline, modelOf(flow)) : null;
    case "target": {
      const text = targetText(d.target);
      if (!text) return null;
      if (d.target?.kind === "qualitative") return "בלי לנחש מספר: מודדים חודש, ואז קובעים יעד.";
      return `היעד: ${text}. נבדוק מולו כל חודש.`;
    }
    case "budget": {
      const label = budgetLabel(d.budget);
      const sum = label ? `בחרתם תקציב של ${label}${d.budget?.exact_ils != null ? "" : " בחודש"}. ` : "";
      switch (d.budget?.range) {
        case "none":
          return "בלי תקציב פרסום זה בסדר. נבנה תוכנית שעובדת בזמן שלכם, ונראה מה סכום קטן היה מוסיף.";
        case "lt1k":
          return `${sum}עם סכום קטן נשקיע רק במה שכבר הצליח, ובמי שכבר מכיר אתכם.`;
        case "1k-3k":
          return `${sum}זה מספיק כדי לבדוק ערוץ ממומן אחד ברצינות.`;
        case "3k-7k":
          return `${sum}אפשר לפתוח ערוץ חדש ולמדוד אותו כמו שצריך.`;
        case "gt7k":
          return `${sum}עם תקציב כזה חשוב למדוד כל שקל, כבר מהחודש הראשון.`;
        case "unknown":
          return "בסדר גמור. נבנה קודם תוכנית בלי פרסום, ונראה מה תקציב היה מוסיף.";
        default:
          return null;
      }
    }
    case "direction": {
      const direction = flow.plan?.directions[flow.chosenDirection ?? -1];
      return direction ? `בחרתם: ${direction.title}. עכשיו נפרוש את זה ל-3 חודשים.` : null;
    }
    default:
      return null;
  }
}
