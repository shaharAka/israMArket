import { notFound } from "next/navigation";
import { CONNECTION_EXAMPLES, type ConnectionExampleKey } from "@/components/landing-v2/connectionExamples";
import { ConnectionDetail } from "@/components/landing-v2/ConnectionDetail";
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(CONNECTION_EXAMPLES).map(provider => ({ provider })); }
export default async function ConnectionPage({ params }: PageProps<"/connections/[provider]">) {
  const { provider } = await params;
  if (!Object.hasOwn(CONNECTION_EXAMPLES, provider)) notFound();
  return <ConnectionDetail provider={provider as ConnectionExampleKey} />;
}
