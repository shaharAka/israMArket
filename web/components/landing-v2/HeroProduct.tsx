"use client";

import { useState, type CSSProperties } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { PostArtwork } from "./PostArtwork";
import { POST_EXAMPLES } from "./postExamples";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";

const AGENTS = [
  { label: "מחקר" },
  { label: "תוכנית" },
  { label: "פוסטים" },
  { label: "למידה" },
] as const;

/** Interactive explanation, with fictional business/data; actual app captures are below. */
export function HeroProduct({ path }: { path: ExamplePath }) {
  const [view, setView] = useState(1);
  const t = useCopy();
  const example = BUSINESS_EXAMPLES[path];
  const source = POST_EXAMPLES.find(item => item.key === (path === "services" ? "interior" : path === "products" ? "bakery" : path === "saas" ? "software" : "nonprofit"))!;
  const post = { ...source, business: t(source.business), headline: t(source.headline), tip: t(source.tip), action: t(source.action), alt: source.alt ? t(source.alt) : undefined };
  return <div className="lv2-team-demo" id="homepage-business-example" style={{ "--business-ink": example.color, "--business-soft": example.soft } as CSSProperties}>
    <div className="lv2-team-agents" role="group" aria-label={t("צוות השיווק: מחקר, תוכנית, פוסטים ולמידה")}>{AGENTS.map((agent, index) => <button type="button" key={agent.label} aria-pressed={view === index} aria-controls="hero-agent-work" onClick={() => setView(index)}><small>0{index + 1}</small><span><Copy text={agent.label} /></span></button>)}</div>
    <div className="lv2-team-stage">
      <article className="lv2-team-work" id="hero-agent-work">
        <header><strong><Copy text={example.name} /></strong><span><Copy text="עסק לדוגמה" /></span></header>
        {view === 0 ? <div className="lv2-team-research"><p className="lv2-team-label"><Copy text="מה גילינו במחקר" /></p><h2><Copy text={example.learned} /></h2><div className="lv2-team-next"><small><Copy text="מכאן מתחילים" /></small><p><Copy text={example.recommendation} /></p></div><p className="lv2-team-source"><Copy text="האתר, הקהל ומה שסיפרתם לנו. יחד נותנים כיוון." /></p></div> : null}
        {view === 1 ? <div className="lv2-team-plan"><p className="lv2-team-label"><Copy text="תוכנית השיווק" /></p><h2><Copy text={example.plan} /></h2><p className="lv2-team-audience"><Copy text={example.audience} /></p><div className="lv2-team-next"><small><Copy text="הצעד הקרוב בתוכנית" /></small><p><Copy text={example.recommendation} /></p></div></div> : null}
        {view === 2 ? <div className="lv2-team-post-work"><div><p className="lv2-team-label"><Copy text="מהתוכנית, לפוסט הבא" /></p><h2><Copy text={example.draft} /></h2><p><Copy text={example.caption} /></p><small><Copy text="אתם בודקים ומאשרים לפני הפרסום." /></small></div><PostArtwork item={post} /></div> : null}
        {view === 3 ? <div className="lv2-team-results"><p className="lv2-team-label"><Copy text="מה למדנו מהתוצאות" /></p><h2><Copy text={example.finding} /></h2><dl className="lv2-team-compare">{example.comparison.map((label, index) => <div key={label}><dt><Copy text={label} /></dt><dd><i style={{ width: index === 0 ? "80%" : "27%" }} /><span>{index === 0 ? "12" : "4"}</span></dd></div>)}</dl><p className="lv2-team-source"><Copy text={example.measure} /></p><div className="lv2-team-next"><p><Copy text={example.next} /></p></div><p className="lv2-team-missing"><Copy text={example.missing} /></p></div> : null}
      </article>
    </div>
    <p className="lv2-team-caption"><Copy text="נתונים להמחשה" /></p>
  </div>;
}
