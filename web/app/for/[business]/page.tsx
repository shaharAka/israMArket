import { notFound } from "next/navigation";
import { Landing } from "@/components/landing-v2/Landing";
import { PERSONA_PAGES } from "@/components/landing-v2/personaPages";
import type { ExamplePath } from "@/components/landing-v2/businessExamples";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(PERSONA_PAGES).map(business => ({ business })); }

export default async function BusinessPage({ params }: { params: Promise<{ business: string }> }) {
  const { business } = await params;
  if (!Object.hasOwn(PERSONA_PAGES, business)) notFound();
  return <Landing key={business} initialPath={business as ExamplePath} />;
}
