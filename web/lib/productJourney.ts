import type { ResearchJourney } from "./researchJourney";

/** The interview collects inputs in the same order as the product story. Saved step IDs stay stable. */
export const SETUP_CHAPTERS = [
  { key: "research", label: "היכרות" },
  { key: "connections", label: "חיבורים" },
  { key: "goals", label: "מטרות" },
  { key: "plan", label: "תוכנית" },
] as const;
export type ProductStage = typeof SETUP_CHAPTERS[number]["key"] | "campaign" | "learning";
const BEFORE = ["name", "offer", "different", "audiences", "links", "discovery", "signup"];

export function interviewSteps(journey: Pick<ResearchJourney, "phase" | "segment">): string[] {
  if (journey.phase === "before") return BEFORE;
  return [...(journey.segment === "software" ? ["software_offer", "software"] : []), "sources", "connections", "detail", "metrics", "build"];
}

export function interviewChapter(step: string): typeof SETUP_CHAPTERS[number]["key"] {
  if (step === "connections" || step === "detail") return "connections";
  if (step === "metrics") return "goals";
  if (step === "build") return "plan";
  return "research";
}

/** Only visual context: this never gates a route or implies a provider grant is ready. */
export function productStage(path: string): ProductStage | null {
  if (["/business", "/brand", "/decisions"].some(route => path === route || path.startsWith(`${route}/`))) return "research";
  if (path.startsWith("/integrations") || path.startsWith("/baseline")) return "connections";
  if (path.startsWith("/strategy") || path === "/plan" || path === "/calendar" || path === "/promotion") return "plan";
  if (["/dashboard", "/campaign", "/posts", "/prepare", "/assets", "/featured", "/voice"].includes(path)) return "campaign";
  if (path === "/performance" || path === "/recommendations") return "learning";
  return null;
}

