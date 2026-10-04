import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_NOTICE_LINK, PUBLIC_NOTICE_PRIMARY, PublicNotice } from "@/components/landing/PublicNotice";

export const metadata: Metadata = {
  title: "העמוד לא נמצא · ישראמארקט",
  robots: { index: false },
};

/** Every address the app does not know, and every notFound(): in Hebrew, with the way home. */
export default function NotFound() {
  return (
    <PublicNotice
      title="לא מצאנו את העמוד הזה"
      lead="אולי הכתובת השתנתה, או שנפלה בה טעות קטנה. מהעמוד הראשי אפשר להמשיך לכל מקום."
      actions={
        <>
          <Link href="/" className={PUBLIC_NOTICE_PRIMARY}>
            לעמוד הראשי
          </Link>
          <Link href="/login" className={PUBLIC_NOTICE_LINK}>
            להיכנס לחשבון
          </Link>
        </>
      }
    />
  );
}
