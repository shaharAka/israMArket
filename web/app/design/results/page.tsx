import type { Metadata } from "next";
import { ResultsPreview } from "@/components/design/ResultsWorkshop";

export const metadata: Metadata = {
  title: "תוצאות שמובילות לצעד הבא — ישראמארקט",
  robots: { index: false, follow: false },
};

export default function ResultsDesignPage() {
  return <ResultsPreview />;
}
