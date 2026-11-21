import type { Metadata } from "next";
import { DesignLibrary } from "@/components/design/DesignLibrary";

export const metadata: Metadata = { title: "ספריית העיצוב — isramarket", robots: { index: false, follow: false } };

export default function DesignPage() {
  return <DesignLibrary />;
}
