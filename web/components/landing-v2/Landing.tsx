"use client";

import Link from "next/link";
import { type ReactNode } from "react";
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
import { CampaignPostExamples } from "./CampaignPostExamples";
import { FeatureStory } from "./FeatureStory";
import { LearningBridge } from "./LearningBridge";
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
  const t = useCopy();
  const { locale } = useLanguage();
  const persona = PERSONA_PAGES[path];
  // The fundraising journey is tracked in #155; never send it through a shop fallback.
  const canStart = path !== "nonprofit";
  const start = canStart ? `/start?model=${path}&lang=${locale}` : heroOnly ? "/for/nonprofit#posts" : "#posts";
  const startLabel = canStart ? "להתחיל חודש בחינם" : "לראות דוגמאות לעמותות";
  const posts = POST_EXAMPLES.filter(item => item.path === path && item.key !== "bakery").map(item => ({ ...item,
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
          <BusinessRoleSelector path={path} hrefFor={key => heroOnly ? `/design/hero?persona=${key}&composition=${heroVariant}&type=${heroTypeface}&lang=${locale}` : `/for/${key}?lang=${locale}`} />
          <div className="lv2-hero-cta"><Link href={start} className="lv2-btn"><Copy text={startLabel} /><IconArrowLeft className="h-4 w-4" /></Link></div>
          <p className="lv2-fine"><Copy text={canStart ? "בלי כרטיס אשראי. אתם בודקים ומפרסמים." : "המסלול לעמותות בפיתוח. בינתיים אפשר לראות את הכיוון בדוגמאות."} /></p>
        </div>
        {heroVariant === "workspace" ? <HeroWorkspace key={path} path={path} /> : <HeroProduct key={path} path={path} />}
      </div></section>
      {!heroOnly && <>
      <FeatureStory path={path} />
      <section id="posts" className="lv2-showcase-section lv2-post-section" aria-labelledby="lv2-post-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="מהתוכנית לפוסטים שלכם" /></p>
        <h2 id="lv2-post-title" className="lv2-h2"><Copy text="אנחנו יוצרים את הפוסטים. אתם מביאים את האופי." /></h2>
        <p className="lv2-lead"><Copy text="תמונות, טקסטים ותוכן בתנועה שנבנים מתוך תוכנית השיווק, בסגנון שמתאים לעסק שלכם. מוכנים לבדיקה ולפרסום." /></p>
        <CampaignPostExamples galleryOnly key={path} examples={posts} selectionLabel={t("לבחור פוסט לדוגמה")} captionLabel={t("לקרוא את הטקסט שמלווה את הפוסט")} screenshot={{src:"/showcase/platform-week-desktop.png",alt:t("התוכנית והצעד הבא במערכת")}} />
      </div></section>
      <section id="learn" className="lv2-feature-group lv2-learn-group" aria-labelledby="lv2-learn-title"><div className="lv2-wrap lv2-feature-grid">
        <div><p className="lv2-eyebrow"><Copy text="למידה מהתוצאות" /></p><h2 id="lv2-learn-title" className="lv2-h2"><Copy text="כל הנתונים האלה. צעד אחד ברור." /></h2><p className="lv2-lead"><Copy text="אנחנו קוראים את הנתונים מהחשבונות שחיברתם, מפרידים בין חשיפה, לחיצות ותוצאות, ומסבירים מה ללמוד מהם. הממצא חוזר לתוכנית ולפוסט הבא." /></p><p className="lv2-fine"><Copy text="ממצא, הסבר וצעד לפוסט הבא. לא רק עוד גרף." /></p></div>
        <LearningBridge path={path} />
      </div></section>
      <section id="connections" className="lv2-showcase-section lv2-connections-band" aria-labelledby="lv2-connect-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="מתחילים ממה שאתם כבר משתמשים בו" /></p>
        <h2 id="lv2-connect-title" className="lv2-h2"><Copy text="הכלים שלכם. התמונה מתחברת אצלנו." /></h2>
        <p className="lv2-lead"><Copy text="פחות מעבר בין מסכים. יותר הבנה של מה מביא אנשים לעסק ומה כדאי לפרסם בהמשך." /></p>
        <ConnectionShowcase />
      </div></section>
      <section className="lv2-phone-group"><div className="lv2-wrap lv2-phone-grid"><div><h2 className="lv2-h2"><Copy text="צוות השיווק שלכם. גם בטלפון." /></h2><p className="lv2-lead"><Copy text="לבדוק פוסט, לראות את הצעד הבא ולהבין מה למדנו. בין לקוחות, מהטלפון שלכם." /></p></div><div className="lv2-phone-proof" aria-label={t("התוכנית בטלפון")}><BusinessProductProof compact path={path} screen="plan" /></div></div></section>
      <section id="trust" className="lv2-trust" aria-labelledby="lv2-trust-title"><div className="lv2-wrap">
        <h2 id="lv2-trust-title" className="lv2-h2"><Copy text="המידע של העסק נשאר שלכם." /></h2>
        <dl className="lv2-trust-rows">{TRUST.map(row => <div key={row.k}><dt><Copy text={row.k} /></dt><dd><Copy text={row.v} /></dd></div>)}</dl>
        <Link href="/security" className="lv2-link"><Copy text="איך שומרים על המידע שלכם" /></Link>
      </div></section>
      <section className="lv2-ai-work" aria-labelledby="lv2-ai-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="AI שיש לו מה לעשות בשבילכם" /></p>
        <h2 id="lv2-ai-title" className="lv2-h2"><Copy text="פחות להתחיל מאפס. יותר זמן לעסק." /></h2>
        <p className="lv2-lead"><Copy text="המחקר נותן כיוון. התוכנית מחברת בין הפעולות. הפוסטים כבר מחכים לבדיקה, והנתונים מגיעים עם הסבר והצעה לצעד הבא." /></p>
        <Link href={start} className="lv2-link"><Copy text={canStart ? "לבנות תוכנית לעסק שלכם" : "לראות דוגמאות לעמותות"} /><IconArrowLeft className="h-4 w-4" /></Link>
      </div></section>
      <section id="price" className="lv2-price" aria-labelledby="lv2-price-title"><div className="lv2-wrap">
        <p className="lv2-eyebrow"><Copy text="המנוי" /></p><h2 id="lv2-price-title" className="lv2-price-num"><span>{PRICE_ILS}</span><small><Copy text="₪ לחודש" /></small></h2>
        <p className="lv2-lead"><Copy text={TRIAL_LABEL} />{NO_CARD_AT_SIGNUP ? <Copy text=", בלי כרטיס אשראי" /> : null}<Copy text=". אין התחייבות." /></p><p className="lv2-fine"><Copy text={VAT_NOTE} /></p><Link href={start} className="lv2-btn-quiet lv2-btn-quiet--lg lv2-price-cta"><Copy text={startLabel} /></Link>
      </div></section>
      <section id="faq" className="lv2-faq" aria-labelledby="lv2-faq-title"><div className="lv2-wrap lv2-faq-grid"><h2 id="lv2-faq-title" className="lv2-h2"><Copy text="שאלות ששואלים אותנו" /></h2><div>{FAQ.map(({q,a}) => <details key={q}><summary><Copy text={q} /></summary><p>{typeof a === "string" ? <Copy text={a} /> : a}</p></details>)}</div></div></section>
      </>}
    </main>
    <footer className="lv2-foot"><div className="lv2-wrap lv2-foot-row"><span><Copy text="ישראמארקט" /></span><Link href="/security"><Copy text="אבטחה ופרטיות" /></Link><Link href="/terms"><Copy text="תנאי שימוש" /></Link></div></footer>
    <DeletedNotice />
  </div>;
}
