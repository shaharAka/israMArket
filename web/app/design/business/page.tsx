import { BusinessScreenPreview } from "@/components/landing-v2/BusinessScreenPreview";
import { PERSONA_PAGES } from "@/components/landing-v2/personaPages";
import type { ExamplePath } from "@/components/landing-v2/businessExamples";

export default async function BusinessScreenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const path = typeof query.persona === "string" && Object.hasOwn(PERSONA_PAGES, query.persona) ? query.persona as ExamplePath : "services";
  return <BusinessScreenPreview path={path} screen={query.screen === "results" ? "results" : "plan"} />;
}
