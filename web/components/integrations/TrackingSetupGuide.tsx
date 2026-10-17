"use client";

import { useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { UIDialog, UIAction } from "@/components/design/Controls";
import { SendToHelper } from "@/components/help/SendToHelper";
import { restoreTrackingDraft, trackingGuideKey, type TrackingDraft as Draft, type TrackingPlatform as Platform } from "./trackingGuideDraft";

type Provider = "google" | "meta" | "tiktok";
const PLATFORMS = { wix: "Wix", shopify: "Shopify", wordpress: "WordPress / WooCommerce", other: "מערכת אחרת / לא בטוחים" };
const GUIDES = {
  google: {
    wix: { instruction: "בניהול האתר פתחו את חיבורי השיווק ובחרו Google Analytics. חברו את המדידה שכבר קיימת, או צרו חדשה דרך גוגל.", url: "https://support.google.com/analytics/answer/11622602?hl=en" },
    shopify: { instruction: "בניהול החנות פתחו את ערוץ Google & YouTube, ובהגדרות Google Analytics בחרו את המדידה של החנות.", url: "https://help.shopify.com/en/manual/reports-and-analytics/google-analytics/google-analytics-setup" },
    wordpress: { instruction: "בניהול האתר בדקו אם Google Analytics כבר מחובר. אם לא, אפשר לחבר דרך התוסף Site Kit של גוגל.", url: "https://sitekit.withgoogle.com/documentation/supported-services/analytics/" },
    other: { instruction: "מי שמנהל את האתר יכול לחבר את המדידה של גוגל ולהגדיר את הפעולות שרוצים לספור.", url: "https://support.google.com/analytics/answer/9304153?hl=en" },
  },
  meta: {
    wix: { instruction: "בניהול האתר פתחו את חיבורי השיווק ובחרו Meta Pixel & CAPI. התחברו עם מנהל העסק ובחרו את המעקב של העסק.", url: "https://support.wix.com/en/article/connecting-a-facebook-pixel-and-the-conversions-api-to-your-wix-site" },
    shopify: { instruction: "פתחו את ערוץ Facebook & Instagram, ובהגדרות שיתוף הנתונים בחרו את המעקב של העסק.", url: "https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/meta-pixel" },
    wordpress: { instruction: "בניהול האתר בדקו אם המעקב של פייסבוק כבר מחובר. אם לא, מנהל האתר יכול לחבר דרך התוסף Meta pixel for WordPress של פייסבוק.", url: "https://wordpress.org/plugins/official-facebook-pixel/" },
    other: { instruction: "מי שמנהל את האתר יכול לחבר את המעקב של פייסבוק ולוודא שהוא שייך לעסק שלכם.", url: "https://www.facebookblueprint.com/student/activity/248027" },
  },
  tiktok: {
    wix: { instruction: "בניהול האתר בדקו אם יש חיבור לטיקטוק. בהגדרות האירועים של טיקטוק בחרו חיבור דרך שותף, אם המערכת שלכם מוצעת שם.", url: "https://ads.tiktok.com/help/article/website-data-connection-setup-methods?lang=en" },
    shopify: { instruction: "בהגדרות האירועים של טיקטוק בחרו חיבור דרך שותף וחפשו Shopify. המשיכו עם החנות והמעקב של העסק.", url: "https://ads.tiktok.com/help/article/website-data-connection-setup-methods?lang=en" },
    wordpress: { instruction: "בהגדרות האירועים של טיקטוק בדקו אם WooCommerce מופיעה כשותפה. אם אין חיבור מתאים, מי שמנהל את האתר יכול לעזור.", url: "https://ads.tiktok.com/help/article/website-data-connection-setup-methods?lang=en" },
    other: { instruction: "מי שמנהל את האתר יכול לחבר מעקב דרך הקוד של טיקטוק או חיבור מהשרת, לפי מערכת האתר.", url: "https://ads.tiktok.com/help/article/website-data-connection-setup-methods?lang=en" },
  },
} satisfies Record<Provider, Record<Platform, { instruction: string; url: string }>>;

/** מטרה: להתקין מדידה בעזרת מערכת האתר, ואז לחזור לבדיקה אמיתית.
 * שומרים רק את המקום בהוראות. לחיצה על ״חיברנו״ לעולם אינה אישור שהמדידה פועלת.
 */
export function TrackingSetupGuide({ provider, businessId, onReturn, busy = false, returnLabel }: {
  provider: Provider; businessId?: number; onReturn?: () => void; busy?: boolean; returnLabel?: string;
}) {
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ platform: "", step: "platform" });
  const storageKey = trackingGuideKey(businessId, provider);
  const label = provider === "meta" ? t("לחבר את המעקב של פייסבוק לאתר") : provider === "google" ? t("לעזור לי להפעיל מדידה באתר") : t("ומה עם מדידת פעולות באתר?");
  function save(value: Draft) {
    setDraft(value);
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The guide also works without storage. */ } }
  }
  function begin() {
    let restored = restoreTrackingDraft(null);
    if (storageKey) { try { restored = restoreTrackingDraft(localStorage.getItem(storageKey)); }
      catch { /* Storage may be unavailable; start at the platform choice. */ } }
    setDraft(restored);
    setOpen(true);
  }
  const guide = draft.platform ? GUIDES[provider][draft.platform] : null;
  return <>
    <UIAction variant="text" onClick={begin}>{label}</UIAction>
    <UIDialog open={open} onClose={() => setOpen(false)} title={label}>
      <div className="space-y-5 pb-2 pt-3">
        <ol aria-label={t("שלבי התקנת המדידה")} className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--ink-muted)]">
          {(["platform", "install", "check"] as const).map((step, index) => <li key={step} aria-current={draft.step === step ? "step" : undefined} className={draft.step === step ? "font-semibold text-[var(--primary)]" : ""}>{index + 1}. {t(["מערכת האתר", "החיבור באתר", "בדיקת הנתונים"][index])}</li>)}
        </ol>
        {draft.step === "platform" ? <>
          <p className="text-[16px] font-medium text-[var(--ink)]"><Copy text="באיזו מערכת בניתם את האתר?" /></p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{Object.entries(PLATFORMS).map(([key, name]) => <UIAction key={key} variant="secondary" onClick={() => save({ platform: key as Platform, step: "install" })}>{t(name)}</UIAction>)}</div>
          <p className="text-[14px] leading-6 text-[var(--ink-soft)]"><Copy text="אם כבר יש מעקב באתר, נשתמש בו." /></p>
          {onReturn ? <UIAction variant="text" onClick={() => save({ ...draft, step: "check" })}><Copy text="המעקב כבר מחובר לאתר" /></UIAction> : null}
        </> : draft.step === "install" && guide ? <>
          <p className="text-[16px] font-medium text-[var(--ink)]">{t(PLATFORMS[draft.platform as Platform])}</p>
          <p className="text-[15px] leading-7 text-[var(--ink-soft)]">{t(guide.instruction)}</p>
          <a href={guide.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] hover:underline"><Copy text="לפתוח את הוראות החיבור" /></a>
          {draft.platform === "wix" ? <p className="text-[13px] text-[var(--ink-muted)]"><Copy text="ב־Wix נדרשים מסלול מתאים ודומיין מחובר." /></p> : null}
          <div><UIAction onClick={() => save({ ...draft, step: "check" })}><Copy text="חיברנו באתר, מה עכשיו?" /></UIAction></div>
          <UIAction variant="text" onClick={() => save({ ...draft, step: "platform" })}><Copy text="לבחור מערכת אתר אחרת" /></UIAction>
        </> : <>
          <p className="text-[16px] font-medium text-[var(--ink)]"><Copy text="עכשיו בודקים מה באמת מתקבל" /></p>
          <p className="text-[15px] leading-7 text-[var(--ink-soft)]">{provider === "meta" ? t("בחרו את המעקב בחשבון הפרסום ובדקו אם מתקבלים אירועים מהאתר שלכם. אחר כך נבדוק אילו פעולות נמדדות.")
            : provider === "google" ? t("בחרו את האתר בחשבון הגוגל שמנהל את המדידה. נקרא את הנתונים ונציג את התאריך שלהם. ספירת קניות או פניות דורשת הגדרה שלהן באתר.")
            : t("את האירועים מהאתר אפשר לבדוק במנהל האירועים של טיקטוק. חיבור נתוני המודעות והאתר של טיקטוק לישראמארקט עדיין לא זמין; כאן אפשר לקרוא נתוני סרטונים בלבד.")}</p>
          {onReturn ? <UIAction busy={busy} onClick={() => { onReturn(); setOpen(false); }}>{returnLabel ? t(returnLabel) : t("לחזור לבחירת החשבון ולבדיקה")}</UIAction>
            : <a href="https://ads.tiktok.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] hover:underline"><Copy text="לפתוח את חשבון הפרסום בטיקטוק" /></a>}
          <UIAction variant="text" onClick={() => save({ ...draft, step: "platform" })}><Copy text="לחזור להוראות ההתקנה" /></UIAction>
        </>}
        <details className="border-t border-[var(--rule)] pt-3 text-[14px] text-[var(--ink-soft)]"><summary className="min-h-11 cursor-pointer font-medium"><Copy text="מישהו אחר מנהל את האתר?" /></summary>
          <SendToHelper title={t("הודעה למנהל האתר")} message={provider === "google" ? t("אפשר לבדוק אם Google Analytics מחובר לאתר שלנו? אם כן, נרצה להשתמש במדידה הקיימת ולהגדיר את הפעולות שחשובות לעסק. נצטרך גם גישת צפייה כדי לחבר את הנתונים לישראמארקט.")
            : provider === "meta" ? t("אפשר לבדוק אם המעקב של פייסבוק מחובר לאתר שלנו? נרצה להשתמש במעקב הקיים, לוודא שהוא שייך לעסק ולהגדיר את הפעולות שחשובות לנו. אחר כך נחבר אותו לישראמארקט.")
            : t("אפשר לבדוק אם המעקב של טיקטוק מחובר לאתר שלנו? נרצה להשתמש במעקב הקיים ולהגדיר את הפעולות שחשובות לעסק. את הבדיקה נבצע במנהל האירועים של טיקטוק.")} />
        </details>
      </div>
    </UIDialog>
  </>;
}
