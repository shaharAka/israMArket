import { ProcessLanding } from "@/components/landing-v2/ProcessLanding";

export default async function EditorialPreview({
  searchParams,
}: {
  searchParams: Promise<{ outcomes?: string | string[] }>;
}) {
  const query = await searchParams;
  const outcomes = query.outcomes === "stacked" ? "stacked" : "grid";

  return <ProcessLanding editorial={{ outcomes }} />;
}
