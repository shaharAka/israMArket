import { HeroTest } from "@/components/landing-v2/HeroTest";
import { PERSONA_PAGES } from "@/components/landing-v2/personaPages";
import type { ExamplePath } from "@/components/landing-v2/businessExamples";

export default async function HeroTestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const path = typeof query.persona === "string" && Object.hasOwn(PERSONA_PAGES, query.persona) ? query.persona as ExamplePath : "services";
  return <HeroTest path={path} initialComposition={query.composition === "tabs" ? "tabs" : "workspace"} initialTypeface={query.type === "sans" ? "sans" : "modern"} />;
}
