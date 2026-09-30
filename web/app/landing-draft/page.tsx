import type { Metadata } from "next";
import { LandingDraft } from "@/components/landing-v2/LandingDraft";

/** Draft of the new landing page, for the owner's review. Not linked, not indexed. */
export const metadata: Metadata = {
  title: "טיוטה: עמוד הבית · ישראמארקט",
  robots: { index: false, follow: false },
};

export default function LandingDraftPage() {
  return <LandingDraft />;
}
