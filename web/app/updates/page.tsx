import type { Metadata } from "next";
import { ReleaseNotes } from "@/components/language/ReleaseNotes";

export const metadata: Metadata = {
  title: "מה חדש — ישראמארקט",
  description: "עדכונים ושיפורים בישראמארקט, ואיפה אפשר לנסות אותם.",
};
export default function UpdatesPage() { return <ReleaseNotes />; }
