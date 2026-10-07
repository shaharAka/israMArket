"use client";
import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { CONNECTION_EXAMPLES, type ConnectionExampleKey } from "./connectionExamples";
import { ConnectionScreenshot } from "./ConnectionScreenshot";
import { ProviderLogo } from "./ProviderLogo";
import { BrandWordmark } from "./BrandWordmark";
import { siteClean } from "./siteFonts";
import "./lv2.css";
import "./showcase.css";

const VALUES = {
  "google-analytics": ["להבין מאיפה מגיעים לאתר", "לראות מה עושים אחרי הלחיצה", "לבחור מה לשנות בפוסט הבא"],
  "facebook-instagram": ["להכיר את התוכן שכבר עובד אצלכם", "לשמור על האופי של העסק", "לתכנן לפי תגובת הקהל"],
  "ads-pixel": ["לראות את ההוצאה מול התוצאות שנמדדו", "לגלות מה חסר במדידה", "לדייק את ההחלטה הבאה בתוכנית"],
  website: ["להתחיל מהמוצרים והשירותים שלכם", "להכיר את הסגנון והמותג", "להגיע לתוכנית עם פחות הקלדה"],
  whatsapp: ["לתת לקהל דרך פשוטה לפנות", "למדוד לחיצות על הקישור", "להוסיף את הפניות שדיווחתם עליהן"],
} as const;

export function ConnectionDetail({ provider }: { provider: ConnectionExampleKey }) {
  const connection = CONNECTION_EXAMPLES[provider];
  const { locale } = useLanguage();
  const t = useCopy();
  return <div className={`lv2 lv2-site ${siteClean.variable}`}>
    <header className="lv2-nav"><div className="lv2-wrap lv2-nav-row"><Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark /></Link><div className="lv2-nav-end"><ProductUtilities inline /><Link href={`/?lang=${locale}#connections`} className="lv2-login"><Copy text="לכל החיבורים" /></Link></div></div></header>
    <main>
      <section className="lv2-connection-hero lv2-wrap">
        <div><div className="lv2-connection-pair"><ProviderLogo provider={provider} size={56} /><span aria-hidden="true">+</span><span className="lv2-wordmark" dir="ltr">isramarket</span></div>
          <p className="lv2-eyebrow"><Copy text={connection.short} /></p><h1 className="lv2-h2"><Copy text={connection.title} /></h1>
          <p className="lv2-lead"><Copy text={connection.benefit} /></p>
          <Link href={`/integrations?lang=${locale}`} className="lv2-btn lv2-value-cta"><Copy text="לפתוח את החיבורים בחשבון" /></Link>
          <p className="lv2-fine"><Copy text="החיבור מתחיל מתוך המערכת. אתם בוחרים למה לתת גישה." /></p>
        </div>
        <div className="lv2-connection-art"><div className="lv2-connection-art-title"><ProviderLogo provider={provider} size={28} /><strong><Copy text="מהמידע שלכם, לצעד הבא בתוכנית" /></strong></div><ConnectionScreenshot src={connection.screenshot} alt={connection.alt} /></div>
      </section>
      <section className="lv2-wrap lv2-connection-benefits"><h2 className="lv2-h2"><Copy text="מה החיבור נותן לעסק שלכם" /></h2><ol>{VALUES[provider].map((value, index) => <li key={value}><span aria-hidden="true">0{index+1}</span><h3><Copy text={value} /></h3></li>)}</ol></section>
      <section className="lv2-wrap lv2-connection-practical">
        <div><h2 className="lv2-h2"><Copy text="הכל נשאר בשליטה שלכם." /></h2><p className="lv2-lead"><Copy text={connection.privacy} /></p><Link href="/security" className="lv2-link"><Copy text="איך שומרים על המידע שלכם" /></Link></div>
        <div><p className="lv2-connection-availability"><Copy text={connection.caveat} /></p>
          <details><summary><Copy text="איך מתחילים לחבר" /></summary><ol className="lv2-setup-steps">{connection.steps.map(step => <li key={step}><Copy text={step} /></li>)}</ol></details>
        </div>
      </section>
    </main>
  </div>;
}
