"use client";

import Link from "next/link";
import { TRIAL_LABEL } from "@/lib/pricing";
import { useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { HERO } from "./content";
import { type ExamplePath } from "./businessExamples";
import { HeroWorkspace } from "./HeroWorkspace";
import { HeroProduct } from "./HeroProduct";
import type { IdentityDirection } from "./IdentityMark";
import { BrandWordmark } from "./BrandWordmark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import { PERSONA_PAGES } from "./personaPages";
import { BusinessRoleSelector } from "./BusinessRoleSelector";
import { ProcessLanding } from "./ProcessLanding";
import "./lv2.css";
import "./showcase.css";

type LandingProps = { initialPath?: ExamplePath; heroVariant?: "workspace" | "tabs"; heroTypeface?: "modern" | "sans"; heroOnly?: boolean; identity?: IdentityDirection };

export function Landing(props: LandingProps) {
  if (!props.heroOnly) return <ProcessLanding initialPath={props.initialPath} identity={props.identity} />;
  return <HeroStudy {...props} />;
}

/** Preserve the previous hero study at /design/hero for direct design comparisons. */
function HeroStudy({ initialPath = "services", heroVariant = "workspace", heroTypeface = "modern", identity }: LandingProps) {
  const [segment, setSegment] = useState<string | undefined>();
  useEffect(() => {
    const read = () => setSegment(new URLSearchParams(window.location.search).get("segment") ?? undefined);
    const timer = window.setTimeout(read, 0); window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, [initialPath]);
  const t = useCopy();
  const { locale } = useLanguage();
  const start = `/start?model=${initialPath}&lang=${locale}${segment ? `&segment=${segment}` : ""}`;
  return <div className={`lv2 lv2-site ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={initialPath} data-hero-type={heroTypeface}>
    <header className="lv2-nav"><div className="lv2-wrap lv2-nav-row">
      <Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark direction={identity} /></Link>
      <div className="lv2-nav-end"><ProductUtilities inline /><Link href="/login" className="lv2-login"><Copy text="להיכנס" /></Link><Link href={start} className="lv2-btn-quiet"><Copy text={TRIAL_LABEL} /></Link></div>
    </div></header>
    <main><section className="lv2-hero" aria-labelledby="lv2-title"><div className="lv2-wrap lv2-hero-grid">
      <div className="lv2-hero-text">
        <h1 id="lv2-title" className="lv2-display"><Copy text={HERO.title} /></h1>
        <p className="lv2-lead"><Copy text={PERSONA_PAGES[initialPath].body} /></p>
        <BusinessRoleSelector path={initialPath} segment={segment ?? (initialPath === "products" ? "online_shop" : undefined)} onSelect={setSegment} hrefFor={(key, selected) => `/design/hero?persona=${key}&composition=${heroVariant}&type=${heroTypeface}&lang=${locale}&segment=${selected}`} />
        <div className="lv2-hero-cta"><Link href={start} className="lv2-btn"><Copy text={TRIAL_LABEL} /></Link></div>
        <p className="lv2-fine"><Copy text="בלי כרטיס אשראי. אתם בודקים ומפרסמים." /></p>
      </div>
      {heroVariant === "workspace" ? <HeroWorkspace key={initialPath} path={initialPath} /> : <HeroProduct key={initialPath} path={initialPath} />}
    </div></section></main>
  </div>;
}
