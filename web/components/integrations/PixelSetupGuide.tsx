"use client";

import { useState } from "react";
import styles from "./meta-connection.module.css";

const PLATFORMS = {
  wix: {
    label: "Wix",
    instruction: "בהגדרות השיווק של האתר, פתחו Meta Pixel & CAPI והמשיכו לחיבור לפייסבוק.",
    note: "ב־Wix נדרשים מסלול Premium ודומיין מחובר.",
    url: "https://support.wix.com/en/article/connecting-a-facebook-pixel-and-the-conversions-api-to-your-wix-site",
  },
  shopify: {
    label: "Shopify",
    instruction: "פתחו את ערוץ Facebook & Instagram, ואז Settings ← Share data settings. בחרו את ה־Pixel ואת רמת שיתוף הנתונים שמתאימה לכם.",
    note: "אם כבר יש Pixel באתר, השתמשו בו. התקנה נוספת עלולה לספור פעולות פעמיים.",
    url: "https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/meta-pixel",
  },
  wordpress: {
    label: "WordPress / WooCommerce",
    instruction: "בדקו קודם אם חיבור Meta כבר מותקן. אם לא, מנהל האתר יכול לחבר דרך התוסף Meta pixel for WordPress של Facebook ולבחור את ה־Pixel של העסק.",
    note: "השתמשו בחיבור אחד למעקב. אין צורך להתקין תוסף נוסף אם המעקב כבר עובד.",
    url: "https://wordpress.org/plugins/official-facebook-pixel/",
  },
  other: {
    label: "מערכת אחרת / לא בטוחים",
    instruction: "חפשו בחיבורי השיווק של מערכת האתר את Meta Pixel. אם אין חיבור מובנה, מי שמנהל את האתר יוכל לעזור בהתקנה.",
    note: "אם כבר יש Pixel, בקשו ממנהל העסק לאפשר גישה אליו ולחשבון הפרסום שמקושר אליו. אין צורך לפתוח מעקב חדש.",
    url: "",
  },
} as const;

/** Installation belongs to the customer's site; IsraMarket reads their authorised Pixel. */
export function PixelSetupGuide({ onRefresh, busy }: { onRefresh: () => void; busy: boolean }) {
  const [platform, setPlatform] = useState<keyof typeof PLATFORMS | "">("");
  const guide = platform ? PLATFORMS[platform] : null;
  return <details className={styles.setupGuide}>
    <summary>המעקב חסר? כך מחברים אותו לאתר</summary>
    <div className={styles.setupBody}>
      <label className={styles.field}>באיזו מערכת האתר שלכם?<select value={platform} onChange={e => setPlatform(e.target.value as keyof typeof PLATFORMS | "")}>
        <option value="">לבחור את מערכת האתר</option>
        {Object.entries(PLATFORMS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select></label>
      {guide && <>
        <p>{guide.instruction}</p>
        <p className={styles.hint}>{guide.note}</p>
        {guide.url && <a href={guide.url} target="_blank" rel="noopener noreferrer">להוראות של {guide.label} ↗</a>}
        <p>בסיום החיבור לאתר, חזרו לכאן ובחרו את המעקב שהופיע בחשבון הפרסום שלכם.</p>
        <button type="button" className={styles.textAction} onClick={onRefresh} disabled={busy}>חיברתי באתר — לרענן את הרשימה</button>
      </>}
    </div>
  </details>;
}
