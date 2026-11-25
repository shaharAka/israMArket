"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProviderLogo } from "@/components/landing-v2/ProviderLogo";
import { sourcePresentation } from "@/components/integrations/SourceReadState";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { endpoints, type IntegrationsPayload } from "@/lib/api";
import type { StepProps } from "./steps";
import { PrimaryButton, StepShell } from "./ui";
import styles from "./connections-step.module.css";

const tools = {
  ga4: {
    provider: "google-analytics",
    name: "Google Analytics",
    detail: "מאיפה מגיעים לאתר ומה עושים בו",
  },
  meta: {
    provider: "facebook-instagram",
    name: "Facebook · Instagram",
    detail: "ביצועי הפוסטים והמודעות שלכם",
  },
} as const;
type Tool = keyof typeof tools;

/** Help the owner pick a measurement tool, or head straight to their goal. */
export function ConnectionsStep(props: StepProps & { mock: boolean; busy: boolean }) {
  const { locale } = useLanguage();
  const t = useCopy();
  const { links } = props.flow.draft;
  const shared = Object.values(links).some(Boolean);
  const [selected, setSelected] = useState<Tool>(() =>
    !links.website && (links.instagram || links.facebook) ? "meta" : "ga4"
  );
  const [data, setData] = useState<IntegrationsPayload | null>(null);

  useEffect(() => {
    if (props.mock) return;
    let live = true;
    endpoints.integrations().then(value => { if (live) setData(value); }).catch(() => {
      // The connector page owns connection diagnostics. The owner can still continue here.
    });
    return () => { live = false; };
  }, [props.mock]);

  const card = tools[selected];
  const item = data?.integrations.find(integration => integration.provider === selected);
  const ready = item?.source_readiness?.status === "ready";
  const allowed = selected === "ga4" ? data?.ga4_ready : data?.meta_ready;
  const status = item?.connected
    ? sourcePresentation(item.source_readiness).label
    : data && !allowed ? "החיבור עדיין לא זמין לחשבון הזה" : null;
  const connected = data?.integrations.some(integration => integration.connected);

  return (
    <StepShell {...props} tip={undefined} title="חיבור כלי המדידה"
      why={shared ? "הקישורים ששיתפתם כבר שמורים. חיבור כלי מדידה מאפשר לראות גם את התוצאות." : "אם יש לכם כלי מדידה, אפשר לחבר אותו ולראות את התוצאות בתוכנית."}
      hidePrimary primary="להמשיך להגדרת היעד" primaryDisabled={props.busy} onPrimary={props.next}
    >
      <PrimaryButton type="button" onClick={props.next} disabled={props.busy}>
        <Copy text={connected ? "להמשיך להגדרת היעד" : "להמשיך בלי לחבר חשבונות"} />
      </PrimaryButton>
      <p className={styles.later}><Copy text="אפשר לחבר כלים גם אחרי שהתוכנית מוכנה." /></p>

      <div className={styles.chooser} role="group" aria-label={t("בחירת חיבור")}>
        {(Object.keys(tools) as Tool[]).map(key => (
          <button key={key} type="button" aria-pressed={selected === key} onClick={() => setSelected(key)}>
            {tools[key].name}
          </button>
        ))}
      </div>
      <section className={styles.card} aria-labelledby="connection-tool">
        <ProviderLogo provider={card.provider} size={28} />
        <div>
          <h2 id="connection-tool">{card.name}</h2>
          <p><Copy text={card.detail} /></p>
          {status && <p><Copy text={status} /></p>}
        </div>
        <Link href={`/integrations?lang=${locale}#${selected}`}>
          <Copy text={ready ? "לבדוק את החיבור" : "לפתוח את החיבור"} />
        </Link>
      </section>
    </StepShell>
  );
}
