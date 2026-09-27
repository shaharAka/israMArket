/**
 * The conversation's script: the order of the questions, their chapters, and what the
 * consultant says back after each answer.
 *
 * Reflections are templated here from the answers, not written by a model: they have to
 * appear instantly, and they only restate what the owner said plus one piece of plain
 * marketing sense. They never promise a number.
 */
import { goalsFor } from "@/lib/businessModel";
import {
  NETWORKS,
  TRIED_OPTIONS,
  firstOffering,
  kitFor,
  monthsLabel,
  type FlowState,
  type Network,
} from "@/lib/draft";
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
  | "goal"
  | "plan"
  | "save";

export const CHAPTERS: { key: string; label: string; steps: StepId[] }[] = [
  { key: "business", label: "העסק", steps: ["name", "what", "different"] },
  { key: "customers", label: "הלקוחות", steps: ["audiences", "seasons"] },
  { key: "marketing", label: "איך משווקים", steps: ["links", "tried", "competitors", "goal"] },
  { key: "plan", label: "מה למדנו", steps: ["plan", "save"] },
];

export const STEP_ORDER: StepId[] = CHAPTERS.flatMap((chapter) => chapter.steps);

export function isStepId(value: string): value is StepId {
  return (STEP_ORDER as string[]).includes(value);
}

export function chapterIndexOf(step: StepId): number {
  return CHAPTERS.findIndex((chapter) => chapter.steps.includes(step));
}

export function previousStep(step: StepId): StepId | null {
  const index = STEP_ORDER.indexOf(step);
  return index > 0 ? STEP_ORDER[index - 1] : null;
}

export function nextStep(step: StepId): StepId | null {
  const index = STEP_ORDER.indexOf(step);
  return index >= 0 && index < STEP_ORDER.length - 1 ? STEP_ORDER[index + 1] : null;
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
    case "goal": {
      switch (d.goal) {
        case "sales":
          return "המטרה: מכירות. כל פוסט יסתיים בדרך ברורה להזמין.";
        case "brand_awareness":
          return "המטרה: שיכירו אתכם. קודם נגיע לאנשים חדשים, ורק אחר כך נמכור.";
        case "leads":
          return "המטרה: פניות. נסביר מה אתם עושים עד שיהיה קל לפנות.";
        case "personal_brand":
          return "המטרה: שיכירו אתכם כמומחים. נראה את הידע, לא רק את השירות.";
        default:
          return null;
      }
    }
    case "plan": {
      const direction = flow.plan?.directions[flow.chosenDirection ?? -1];
      return direction ? `בחרתם: ${direction.title}. מכאן נבנה את החודש הראשון.` : null;
    }
    default:
      return null;
  }
}

/** The goal options for the model, and whether `goal` is one of them. */
export function goalOptions(flow: FlowState) {
  return goalsFor(flow.draft.business_model ?? "products");
}
