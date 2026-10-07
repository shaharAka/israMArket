import type { Metadata } from "next";
import { IdentityWorkshop } from "@/components/landing-v2/IdentityWorkshop";

export const metadata: Metadata = { title: "זהות המותג — ישראמארקט", robots: { index: false, follow: false } };

export default function IdentityPage() { return <IdentityWorkshop />; }
