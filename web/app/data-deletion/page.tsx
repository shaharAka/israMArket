import type { Metadata } from "next";
import Link from "next/link";
import { BACKUP_NOTE, CONTACT_EMAIL } from "@/lib/company";
import {
  LEGAL_LINK,
  LegalPage,
  LegalSection,
} from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "מחיקת מידע · ישראמארקט",
  description: "איך מוחקים את החשבון והמידע בישראמארקט, ואיך מנתקים את פייסבוק, אינסטגרם וגוגל.",
};

// Public instructions for Meta's data-deletion URL. This is not a signed-request
// callback. The steps below describe the existing /account and /integrations flows.
export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="המידע שלכם"
      title="איך מוחקים את המידע"
      lead="אפשר לנתק חיבור, או למחוק את החשבון ואת כל המידע של העסק. מחיקת החשבון אינה ניתנת לביטול."
      contents={[
        { id: "account", title: "מחיקת החשבון והמידע" },
        { id: "connection", title: "ניתוק חיבור" },
        { id: "help", title: "עזרה במחיקה" },
        { id: "english", title: "Instructions in English" },
      ]}
      current="/data-deletion"
    >
      <LegalSection id="account" title="מחיקת החשבון והמידע">
        <ol className="list-decimal space-y-2 ps-5">
          <li>היכנסו לישראמארקט עם החשבון שאת המידע שלו רוצים למחוק.</li>
          <li>
            פתחו את <Link href="/account" className={LEGAL_LINK}>עמוד החשבון</Link>,
            ובסעיף ״מחיקת החשבון״ לחצו על ״למחוק את החשבון״.
          </li>
          <li>
            בדקו את רשימת המידע שיימחק. אשרו באמצעות הסיסמה שלכם, או באמצעות
            הקלדת האימייל אם נרשמתם עם גוגל ולא הגדרתם סיסמה. לחצו על ״למחוק לתמיד״.
          </li>
        </ol>
        <p>
          המחיקה מסירה מהמערכת את החשבון, העסק, התוכניות, הפוסטים, העיצובים,
          התמונות שהעליתם, החיבורים והמפתחות שלהם, הנתונים והמחקר. גם הנתונים
          שהתקבלו מגוגל וממטא — פייסבוק, אינסטגרם, דוחות מודעות ומידע על הפיקסל — נמחקים.
          לאחר הצלחת המחיקה תצאו מהחשבון.
        </p>
        <p>{BACKUP_NOTE}</p>
        <p>
          פוסטים שכבר פרסמתם ברשתות החברתיות והמידע שנמצא בגוגל, במטא או באתר
          העסק שלכם נשארים אצלם. מחיקת החשבון בישראמארקט אינה מוחקת אותם.
        </p>
      </LegalSection>

      <LegalSection id="connection" title="ניתוק חיבור">
        <p>
          כדי להפסיק את הגישה בלי למחוק את החשבון, פתחו את{" "}
          <Link href="/integrations" className={LEGAL_LINK}>החיבורים</Link>
          {" "}ולחצו ״לנתק״ ליד מטא או גוגל. הניתוק מוחק את המפתחות ששמרנו ומפסיק
          קריאה חדשה דרך אותו חיבור. נתונים שכבר נשמרו בניתוחים ובתוכנית נשארים
          עד למחיקת החשבון.
        </p>
        <p>
          אפשר להסיר את ההרשאה גם בהגדרות החיבורים של גוגל או בהגדרות
          האינטגרציות העסקיות של פייסבוק. הסרת הרשאה אצל הספק אינה בקשה
          למחיקת החשבון בישראמארקט; למחיקת המידע אצלנו השתמשו בשלבים שלמעלה.
        </p>
      </LegalSection>

      <LegalSection id="help" title="עזרה במחיקה">
        <p>
          אם אינכם מצליחים להיכנס, כתבו אל{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className={LEGAL_LINK}>{CONTACT_EMAIL}</a>
          {" "}מהאימייל של החשבון וציינו שזו בקשה למחיקת המידע בישראמארקט.
          נצטרך לוודא שהבקשה מגיעה מבעל החשבון. אין לשלוח סיסמאות או מפתחות חיבור.
        </p>
        <p>
          <Link href="/security" className={LEGAL_LINK}>מדיניות הפרטיות ומידע על שמירת הנתונים</Link>
        </p>
      </LegalSection>

      <LegalSection id="english" title="Instructions in English">
        <div dir="ltr" lang="en">
          <p>
            To delete your IsraMarket account and its data, sign in, open Account,
            expand Account deletion, review the data listed, and confirm with your
            password (or your account email for a Google-only account). Choose Delete
            permanently. This deletes stored business data, content, connection tokens,
            and imported Google and Meta data, including Instagram insights, ads reports
            and Pixel evidence. You are signed out after successful deletion.
          </p>
          <p>
            Backups expire within 30 days. Content and data held by Google, Meta or
            your website are not deleted by this action. Disconnecting a provider removes
            our stored tokens but does not delete previously saved analyses. To request
            help with deletion, email {CONTACT_EMAIL} from your account email.
            Do not send passwords or access tokens.
          </p>
        </div>
      </LegalSection>
    </LegalPage>
  );
}
