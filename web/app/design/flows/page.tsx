import type { Metadata } from "next";
import { FlowBoard } from "@/components/design/FlowBoard";

export const metadata: Metadata = { title: "מסע המשתמש — ישראמארקט", robots: { index: false, follow: false } };

export default async function FlowsPage({ searchParams }: { searchParams: Promise<{ persona?: string | string[]; step?: string | string[] }> }) {
  const params = await searchParams;
  const persona = typeof params.persona === "string" ? params.persona : undefined;
  const step = typeof params.step === "string" ? params.step : undefined;
  return <FlowBoard key={`${persona ?? "store"}:${step ?? "landing"}`} initialPersona={persona} initialStep={step} />;
}
