import type { Metadata } from "next";
import { ConnectionWorkshop } from "@/components/design/ConnectionWorkshop";

export const metadata: Metadata = {
  title: "חיבורים פשוטים לעסק — isramarket",
  robots: { index: false, follow: false },
};

export default function ConnectionDesignPage() {
  return <ConnectionWorkshop />;
}
