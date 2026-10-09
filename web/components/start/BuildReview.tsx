"use client";

import { useState } from "react";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { BusinessProductProof } from "@/components/landing-v2/BusinessProductProof";
import type { ExamplePath } from "@/components/landing-v2/businessExamples";
import { METRICS, type Observation, type Segment } from "@/lib/researchJourney";
import type { StepProps } from "./steps";
import { PrimaryButton, StepShell } from "./ui";
import styles from "./build-review.module.css";

export const REVIEW_PATHS: Record<Segment, ExamplePath> = {
  fundraising: "nonprofit", software: "saas", services: "services",
  online_shop: "products", physical_shop: "products",
};

/** English content brief:
 * Purpose: review the facts the owner is giving us before creating the plan.
 * Message: Build the marketing plan for [business].
 * Content: their offer, audience, chosen outcome and optional stated media budget.
 * Action: Build my plan. This creates the plan structure; posts are a later action.
 * No generic process promises, success guarantees or repeated storage notices.
 * The source literals below are natural Hebrew adaptations of this brief.
 */
export function BuildReview(props: StepProps & {
  mock: boolean; canStart: boolean; busy: boolean; onDone: () => void;
}) {
  const t = useCopy(); const { locale } = useLanguage();
  const [preview, setPreview] = useState(false);
  const draft = props.flow.draft; const journey = draft.research_journey!;
  const chosen = METRICS[journey.segment].find(item => item.key === journey.metric);
  const budget = journey.observations.find(item => item.key === "marketing_budget");
  const audiences = draft.audiences.map(item => props.mock ? t(item.name) : item.name).filter(Boolean).join(" · ");
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  function amount(value: Observation) {
    if (value.status === "unknown" || value.lower == null) return null;
    const range = value.status === "range" && value.upper != null;
    return range ? `${number(value.lower)}–${number(value.upper!)} ₪` : `${number(value.lower)} ₪`;
  }
  const mediaBudget = budget ? amount(budget) : null;
  return <StepShell {...props} title={t("נבנה את התוכנית של {arg_0}", { arg_0: props.mock ? t(draft.business_name) : draft.business_name })}
    why="" hidePrimary primary="לבנות את התוכנית שלי" primaryDisabled onPrimary={() => {}}>
    {preview ? <BusinessProductProof path={REVIEW_PATHS[journey.segment]} screen="plan" /> : <>
      <dl className={styles.facts}>
        <div><dt><Copy text={journey.segment === "fundraising" ? "העשייה שלכם" : "מה אתם מציעים"} /></dt><dd dir="auto">{props.mock ? t(draft.offerings) : draft.offerings}</dd></div>
        {audiences ? <div><dt><Copy text="למי פונים" /></dt><dd dir="auto">{audiences}</dd></div> : null}
        {chosen ? <div><dt><Copy text="מה רוצים להשיג" /></dt><dd><Copy text={chosen.label} /></dd></div> : null}
        {mediaBudget ? <div><dt><Copy text="תקציב פרסום חודשי" /></dt><dd><bdi>{mediaBudget}</bdi></dd></div> : null}
      </dl>
      <div className={styles.action}>
        {props.mock ? <PrimaryButton type="button" onClick={() => setPreview(true)}><Copy text="לראות את התוכנית" /></PrimaryButton>
          : <MonthBuildProgress canStart={props.canStart} onDone={props.onDone}
            idle={build => <PrimaryButton type="button" disabled={build.starting || props.busy}
              onClick={() => void build.start()}><Copy text="לבנות את התוכנית שלי" /></PrimaryButton>} />}
      </div>
    </>}
  </StepShell>;
}
