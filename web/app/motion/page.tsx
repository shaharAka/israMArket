import type { Metadata } from "next";
import { MotionGallery } from "@/components/motion/MotionGallery";

export const metadata: Metadata = { title: "מעבדת תנועה — ישראמארקט", robots: { index: false, follow: false } };

export default function MotionPage() {
  return <MotionGallery />;
}
