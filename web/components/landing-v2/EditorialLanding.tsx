"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { IconArrowLeft, IconCheck, IconLock } from "@/lib/icons";
import { BrandWordmark } from "./BrandWordmark";
import { EditorialCalendar } from "./EditorialCalendar";
import { CreativeReel } from "./CreativeReel";
import { editorialAudiences, editorialCopy as copy, editorialOutcomes, editorialSteps } from "./editorialContent";
import { ApprovalPreview, MeasurementPreview } from "./ProductOutcomes";
import { PROCESS_HERO } from "./processStory";
import { TrialCtaLabel, TrialOfferNote } from "./TrialCtaLabel";
import { campaignWeek, formatNovember } from "./workshopCampaign";
import s from "./EditorialLanding.module.css";

type Layout = "grid" | "stacked";
const media = "/showcase/campaign-cuts/";
const studio = "/showcase/dyo-tari/";

function Hero({ start }: { start: string }) {
  const { t, locale } = useLanguage();
  return <section className={s.hero} aria-labelledby="process-title">
    <div className={s.heroInner}>
      <div className={s.heroCopy}>
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <p><Copy text={PROCESS_HERO.body} /></p>
        <div className={s.heroActions}>
          <Link className={s.cta} href={start}><TrialCtaLabel /><IconArrowLeft /></Link>
          <a href="#story" className={s.howLink}>{t(copy.stepTitle)}</a>
        </div>
        <small><TrialOfferNote /><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small>
      </div>
      <figure className={s.heroSpread}>
        <div className={s.heroArt}>
          <Image src={media+"printmaker.webp"} alt={t(copy.photoAlt)} fill sizes="(max-width: 760px) 100vw, 54vw" className={s.heroPhoto} preload />
          <div className={s.printProof}>
            <span aria-hidden="true" className={s.registration} />
            <Image src={studio+"feed.webp"} alt={t(copy.posterAlt)} width={864} height={1080} sizes="(max-width: 760px) 36vw, 19vw" loading="eager" />
            <i className={s.swatches} aria-hidden="true"><i/><i/><i/></i>
          </div>
        </div>
        <figcaption className={s.spreadLabel}>
          <div><b><Copy text="למלא את סדנת ההדפס" /></b><span>{t(copy.example)} · {t(copy.studio)}</span></div>
          <div><strong>{t(campaignWeek[0].title)}</strong><span><bdi lang="en">{campaignWeek[0].platform}</bdi> · <time dateTime="2026-11-08">{formatNovember(locale, 8, { day:"2-digit", month:"2-digit" })}</time></span></div>
        </figcaption>
      </figure>
    </div>
  </section>;
}

function Benefit() {
  const t = useCopy();
  return <section className={s.benefit} aria-labelledby="benefit-title">
    <div className={s.split}>
      <div className={s.copyBlock}><h2 id="benefit-title">{t(copy.benefit)}</h2><p>{t(copy.benefitBody)}</p></div>
      <EditorialCalendar />
    </div>
  </section>;
}

function StepArt({ id }: { id: typeof editorialSteps[number]["id"] }) {
  const { t, locale } = useLanguage();
  if (id === "research") return <div className={s.interviewArt}>
    <div className={s.interviewPaper}>
      <div><b>{t(copy.question)}</b><i aria-hidden="true" /></div>
      <p>{t(copy.answer)}</p>
    </div>
  </div>;
  if (id === "connections") return <div className={s.connectionArt}>
    <div className={s.connectionRows}>{[
      ["instagram", "Instagram"], ["googleanalytics", "Google Analytics"],
    ].map(([icon, name])=><div key={icon}>
      <Image alt="" src={`/connectors/${icon}.svg`} width={26} height={26} />
      <bdi lang="en">{name}</bdi>
      <span aria-hidden="true"><IconCheck /></span>
    </div>)}</div>
  </div>;
  if (id === "goals") return <div className={s.goalArt}>
    <Image src={media+"worktable.webp"} alt="" fill sizes="(max-width:760px) 90vw, 46vw" />
    <div className={s.ticket}><span>{t(copy.goal)}</span><b>{t(copy.goalValue)}</b></div>
  </div>;
  return <div className={s.reviewArt}>
    <div className={s.reviewSheet}>
      <Image alt="" src={studio+"story.webp"} width={180} height={320} sizes="96px" />
      <div><time dateTime="2026-11-12">{formatNovember(locale, 12, { weekday: "short", day: "numeric", month: "short" })}</time>
        <strong>{t(campaignWeek[2].title)}</strong><span><IconCheck />{t(copy.ready)}</span></div>
    </div>
  </div>;
}

function Steps() {
  const t = useCopy();
  return <section id="story" className={s.story} aria-labelledby="story-title">
    <div className={s.wrap}><h2 id="story-title" className={s.display}>{t(copy.stepTitle)}</h2>
      <ol className={s.checker}>{editorialSteps.map((step, index) => <li key={step.id} id={step.id} className={s.step}>
        <div className={s.stepHead}><span aria-hidden="true">{String(index+1).padStart(2, "0")}</span><div>
          <h3>{t(step.title)}</h3><p>{t(step.body)}</p></div>
        </div>
        <StepArt id={step.id} />
      </li>)}</ol>
    </div>
  </section>;
}

function Outcomes({ layout }: { layout: Layout }) {
  const { t, locale } = useLanguage();
  const previews = [EditorialCalendar, ApprovalPreview, MeasurementPreview];
  return <section id="results" className={s.outcomes} aria-labelledby="outcome-title">
    <div className={s.wrap}>
      <div className={s.resultsHead}><h2 id="outcome-title" className={s.display}>{t(copy.outcomes)}</h2>
        <nav className={s.switcher} aria-label={t(copy.compare)}>
          {(["grid", "stacked"] as const).map(view=><Link key={view} href={`/design/editorial?lang=${locale}&outcomes=${view}#results`}
            aria-current={view===layout ? "true" : undefined} scroll={false}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
              {view==="grid" ? <path d="M1.5 2.5h5v11h-5zm8 0h5v11h-5z"/> : <path d="M2 2h12v4H2zm0 7.5h12v4H2z"/>}
            </svg>{t(copy[view])}
          </Link>)}
        </nav>
      </div>
      <div className={s.outcomeList} data-layout={layout}
        role={layout === "grid" ? "region" : undefined}
        aria-label={layout === "grid" ? t(copy.outcomes) : undefined}
        tabIndex={layout === "grid" ? 0 : undefined}>{editorialOutcomes.map((item, i) => {
        const Preview = previews[i];
        return <article key={item.id} className={s.outcome} id={item.id}>
          <div className={s.preview}><Preview /></div>
          <div className={s.outcomeText}><h3>{t(item.title)}</h3><p>{t(item.body)}</p></div>
        </article>;
      })}</div>
    </div>
  </section>;
}

function Audience() {
  const t = useCopy();
  const [selection, setSelection] = useState(0);
  const item = editorialAudiences[selection];
  return <section id="audience" className={s.audience} aria-labelledby="audience-title">
    <div className={s.split}>
      <div className={s.audienceCopy}>
        <h2 className={s.display} id="audience-title">{t(copy.audience)}</h2>
        <ul className={s.audienceChoices}>{editorialAudiences.map((item, i) => <li key={item.label}>
          <button type="button" aria-controls="audience-example" aria-pressed={selection===i} onClick={()=>setSelection(i)}>
            <span>{t(item.label)}</span><IconArrowLeft />
          </button>
        </li>)}</ul>
      </div>
      <figure id="audience-example" className={s.audienceFrame}>
        <div><Image key={item.image} src={item.image} alt={t(item.alt)} fill sizes="(max-width:760px) 90vw, 46vw" /></div>
        <figcaption aria-live="polite">{t(item.description)}</figcaption>
      </figure>
    </div>
  </section>;
}

function Mobile() {
  const t = useCopy();
  const [approved, setApproved] = useState(false);
  return <section id="mobile" className={s.mobile} aria-labelledby="mobile-title">
    <div className={s.split}>
      <div className={s.copyBlock}><h2 id="mobile-title">{t(copy.mobile)}</h2><p>{t(copy.mobileBody)}</p></div>
      <div className={s.mobileArt}>
        <Image alt="" src={media+"worktable.webp"} fill className={s.tablePhoto} sizes="(max-width:760px) 100vw, 50vw" />
        <div className={s.phone}>
          <div className={s.phoneBar} aria-hidden="true"><i/><span><IconLock />isramarket</span></div>
          <div className={s.phoneBrand}><BrandWordmark /></div>
          <div className={s.phoneContent}>
            <strong>{t(copy.nextPost)}</strong>
            <Image alt={t(copy.posterAlt)} src={studio+"feed.webp"} width={864} height={1080} sizes="200px" />
            <button type="button" onClick={()=>setApproved(!approved)} aria-pressed={approved}><IconCheck />{t(approved ? copy.approved : copy.inspectPost)}</button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

export function EditorialLanding({ start, outcomes = "grid", children }: {
  start: string; outcomes?: Layout; children?: ReactNode;
}) {
  return <div className={s.page}>
    <Hero start={start} />
    <Benefit />
    <Steps />
    <Outcomes layout={outcomes} />
    <div className={s.portfolio}><CreativeReel /></div>
    <Audience />
    <Mobile />
    {children}
  </div>;
}
