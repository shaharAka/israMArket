import { MetaReturn } from "@/components/integrations/MetaReturn";
export default async function MetaComplete({ searchParams }: { searchParams: Promise<{ meta_result?: string }> }) {
  const { meta_result } = await searchParams;
  const result = ["success", "cancelled", "expired", "failed"].includes(meta_result || "") ? meta_result! : "failed";
  return <MetaReturn result={result} />;
}
