import type { Metadata } from "next";
import { ConnectionWorkshop } from "@/components/design/ConnectionWorkshop";

export const metadata: Metadata = {
  title: "חיבורים פשוטים לעסק — ישראמארקט",
  robots: { index: false, follow: false },
};

export default function ConnectionDesignPage() {
  return <ConnectionWorkshop />;
}
