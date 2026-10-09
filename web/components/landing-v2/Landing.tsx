"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { PriceAnswer, CancellationAnswer } from "@/components/language/PricingAnswers";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { IconArrowLeft } from "@/lib/icons";
import { NO_CARD_AT_SIGNUP, PRICE_ILS, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";
import { HERO, TRUST } from "./content";
import { type ExamplePath } from "./businessExamples";
import { POST_EXAMPLES } from "./postExamples";
import { HeroWorkspace } from "./HeroWorkspace";
import { BusinessProductProof } from "./BusinessProductProof";
import { HeroProduct } from "./HeroProduct";
import type { IdentityDirection } from "./IdentityMark";
import { BrandWordmark } from "./BrandWordmark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import { PERSONA_PAGES } from "./personaPages";
import { BusinessRoleSelector } from "./BusinessRoleSelector";
import { FeatureWalkthrough } from "./FeatureWalkthrough";
import { ConnectionShowcase } from "./ConnectionShowcase";
import "./lv2.css";
import "./showcase.css";

const FAQ: { q: string; a: ReactNode }[] = [
  { q: "מה קורה אחרי החודש החינמי?", a: <PriceAnswer /> },
  { q: "צריך אתר כדי להתחיל?", a: "לא. אפשר להתחיל עם עמוד עסקי ברשת חברתית, או פשוט לספר לנו על העסק." },
  { q: "צריך לחבר את כל החשבונות מיד?", a: "לא. מתחילים עם המידע שיש ובונים תוכנית ופוסטים. חיבורים מוסיפים כשצריך לדייק את המדידה. בעמוד של כל חיבור מוסבר מה נדרש ומה זמין." },
  { q: "מי מאשר ומפרסם את הפוסטים?", a: "אתם. אנחנו מכינים טיוטות לפי התוכנית ובסגנון שלכם. אתם בודקים את התמונה ואת הפרטים, משנים ומפרסמים בעצמכם." },
  { q: "אפשר לבטל?", a: <CancellationAnswer /> },
];

/** Role-specific pages use real product components with explicitly simulated business data. */
export function Landing({ initialPath = "services", heroVariant = "workspace", heroTypeface = "modern", heroOnly = false, identity }: { initialPath?: ExamplePath; heroVariant?: "workspace" | "tabs"; heroTypeface?: "modern" | "sans"; heroOnly?: boolean; identity?: IdentityDirection }) {
  const path = initialPath;
  const [segment, setSegment] = useState<string | undefined>();
  useEffect(() => {
    const read = () => setSegment(new URLSearchParams(window.location.search).get("segment") ?? undefined);
    const timer = window.setTimeout(read, 0); window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, [initialPath]);
  const t = useCopy();
  const { locale } = useLanguage();
  const persona = PERSONA_PAGES[path];
  // Each landing choice carries its interview segment; nonprofit platform extensions remain tracked in #155.
  const canStart = true;
  const start = `/start?model=${path}&lang=${locale}${segment ? `&segment=${segment}` : ""}`;
  const startLabel = canStart ? "להתחיל חודש בחינם" : "לראות דוגמאות לעמותות";
  const posts = POST_EXAMPLES.filter(item => (item.path === path && item.key !== "bakery") || (path === "products" && item.key === "dj")).map(item => ({ ...item,
    business: t(item.business), kind: t(item.kind), alt: item.alt ? t(item.alt) : undefined,
    headline: t(item.headline), tip: t(item.tip), action: t(item.action), label: t(item.label),
    plan: t(item.plan), caption: t(item.caption), motion: item.motion?.map(line => t(line)),
  }));
  return <div className={`lv2 lv2-site ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={path} data-hero-type={heroTypeface}>
    <header className="lv2-nav"><div className="lv2-wrap lv2-nav-row">
      <Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark direction={identity} /></Link>
      {!heroOnly && <nav aria-label={t("בעמוד הזה")} className="lv2-nav-links"><a href="#story"><Copy text="איך זה עובד" /></a><a href="#posts"><Copy text="הפוסטים" /></a><a href="#connections"><Copy text="חיבורים" /></a><a href="#price"><Copy text="מנוי" /></a><a href="#trust"><Copy text="המידע שלכם" /></a></nav>}
      <div className="lv2-nav-end"><ProductUtilities inline /><Link href="/login" className="lv2-login"><Copy text="להיכנס" /></Link><Link href={start} className="lv2-btn-quiet"><Copy text={canStart ? "להתחיל בחינם" : "דוגמאות לעמותות"} /></Link></div>
    </div></header>
    <main>
      <section className="lv2-hero" aria-labelledby="lv2-title"><div className="lv2-wrap lv2-hero-grid">
        <div className="lv2-hero-text">
          <h1 id="lv2-title" className="lv2-display"><Copy text={HERO.title} /></h1>
          <p className="lv2-lead"><Copy text={persona.body} /></p>
          <BusinessRoleSelector path={path} segment={segment ?? (path === "products" ? "online_shop" : undefined)} onSelect={setSegment} hrefFor={(key, selected) => (heroOnly ? `/design/hero?persona=${key}&composition=${heroVariant}&type=${heroTypeface}&lang=${locale}` : `/for/${key}?lang=${locale}`) + `&segment=${selected}`} />
          <div className="lv2-hero-cta"><Link href={start} className="lv2-btn"><Copy text={startLabel} /><IconArrowLeft className="h-4 w-4" /></Link></div>
          <p className="lv2-fine"><Copy text={canStart ? "בלי כרטיס אשראי. אתם בודקים ומפרסמים." : "המסלול לעמותות בפיתוח. בינתיים אפשר לראות את הכיוון בדוגמאות."} /></p>
        </div>
        {heroVariant === "workspace" ? <HeroWorkspace key={path} path={path} /> : <HeroProduct key={path} path={path} />}
      </div></section>
      {!heroOnly && <>
      <FeatureWalkthrough key={path} path={path} examples={posts} />
      <section id="connections" className="lv2-showcase-section lv2-connections-band" aria-labelledby="lv2-connect-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="מתחילים ממה שאתם כבר משתמשים בו" /></p>
        <h2 id="lv2-connect-title" className="lv2-h2"><Copy text="כל כלי השיווק והקידום שלכם במקום אחד." /></h2>
        <p className="lv2-lead"><Copy text="פחות מעבר בין מסכים. יותר הבנה של מה מביא אנשים לעסק ומה כדאי לפרסם בהמשך." /></p>
        <ConnectionShowcase />
      </div></section>
      <section className="lv2-phone-group"><div className="lv2-wrap lv2-phone-grid"><div><h2 className="lv2-h2"><Copy text="צוות השיווק שלכם. גם בטלפון." /></h2><p className="lv2-lead"><Copy text="לבדוק פוסט, לראות את הצעד הבא ולהבין מה למדנו. בין לקוחות, מהטלפון שלכם." /></p></div><div className="lv2-phone-proof" aria-label={t("התוכנית בטלפון")}><BusinessProductProof compact path={path} screen="plan" /></div></div></section>
      <section id="trust" className="lv2-trust" aria-labelledby="lv2-trust-title"><div className="lv2-wrap">
        <h2 id="lv2-trust-title" className="lv2-h2"><Copy text="המידע של העסק נשאר שלכם." /></h2>
        <dl className="lv2-trust-rows">{TRUST.map(row => <div key={row.k}><dt><Copy text={row.k} /></dt><dd><Copy text={row.v} /></dd></div>)}</dl>
        <Link href="/security" className="lv2-link"><Copy text="איך שומרים על המידע שלכם" /></Link>
      </div></section>
      <section id="price" className="lv2-price" aria-labelledby="lv2-price-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="המנוי" /></p><h2 id="lv2-price-title" className="lv2-price-num"><span>{PRICE_ILS}</span><small><Copy text="₪ לחודש" /></small></h2>
        <h3 className="lv2-price-includes-title"><Copy text="מה כלול במנוי?" /></h3><ul className="lv2-price-includes">{["מחקר על העסק והקהל ותוכנית שיווק שמתעדכנת", "פוסטים ועיצובים מתוך התוכנית, בסגנון של העסק", "ערכת פרסום עם טקסט, תמונה וקישור", "חיבור מקורות הנתונים והסבר פשוט של התוצאות"].map(item => <li key={item}><Copy text={item} /></li>)}</ul><p className="lv2-fine"><Copy text="תקציב הפרסום ברשתות אינו כלול במנוי." /></p>
        <p className="lv2-lead"><Copy text={TRIAL_LABEL} />{NO_CARD_AT_SIGNUP ? <Copy text=", בלי כרטיס אשראי" /> : null}<Copy text=". אין התחייבות." /></p><p className="lv2-fine"><Copy text={VAT_NOTE} /></p><Link href={start} className="lv2-btn-quiet lv2-btn-quiet--lg lv2-price-cta"><Copy text={startLabel} /></Link>
      </div></section>
      <section id="faq" className="lv2-faq" aria-labelledby="lv2-faq-title"><div className="lv2-wrap lv2-faq-grid"><h2 id="lv2-faq-title" className="lv2-h2"><Copy text="שאלות ששואלים אותנו" /></h2><div>{FAQ.map(({q,a}) => <details key={q}><summary><Copy text={q} /></summary><p>{typeof a === "string" ? <Copy text={a} /> : a}</p></details>)}</div></div></section>
      </>}
    </main>
    <footer className="lv2-foot"><div className="lv2-wrap lv2-foot-row"><span><Copy text="ישראמארקט" /></span><Link href="/security"><Copy text="אבטחה ופרטיות" /></Link><Link href="/terms"><Copy text="תנאי שימוש" /></Link></div></footer>
    <DeletedNotice />
  </div>;
}
