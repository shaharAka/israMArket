import { notFound } from "next/navigation";
import { DnaQa } from "./DnaQa";

/**
 * Visual QA for the Design DNA renderer (docs/design-dna.md, phase D3): fictional
 * businesses with hand-written DNAs, three compositions each, side by side. Three of them
 * are bakeries sharing one photograph — the proof that same-field businesses come out
 * looking like different designers made them. Not linked from the app; not served in
 * production builds.
 *
 *   /dev/dna                 every business, 4:5
 *   /dev/dna?ratio=1:1       the same at 1:1 (or 9:16)
 *   /dev/dna?only=bonbon     one business
 *   /dev/dna?all=1           every composition for every business
 */
export default function DevDnaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DnaQa />;
}
