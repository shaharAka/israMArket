import type { Metadata } from "next";
import { ReleaseNotes } from "@/components/language/ReleaseNotes";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "מה חדש — ישראמארקט",
  description: "עדכונים ושיפורים בישראמארקט, ואיפה אפשר לנסות אותם.",
  robots: { index: false, follow: false },
};
export default function UpdatesPage() { return <AppShell><ReleaseNotes /></AppShell>; }
