"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { endpoints, type IntegrationsPayload } from "@/lib/api";
import { sourcePresentation } from "@/components/integrations/SourceReadState";
import { ProviderLogo } from "@/components/landing-v2/ProviderLogo";
import { Copy } from "@/components/language/LanguageProvider";
import styles from "./journey.module.css";

const SOURCES = [
  { key: "ga4", logo: "google-analytics", title: "נתוני האתר", benefit: "מאיפה מגיעים לאתר ומה עושים בו" },
  { key: "meta", logo: "facebook-instagram", title: "פייסבוק ואינסטגרם", benefit: "אילו פוסטים מעניינים את הקהל שלך" },
] as const;

/** Read saved connection readiness only. Consent and source selection remain in the connection hub. */
export function ConnectionPreparation({ mock }: { mock: boolean }) {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (mock) return;
    let live = true;
    endpoints.integrations().then(value => { if (live) setData(value); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [mock]);
  return <div className={styles.connections}>
    {SOURCES.map(source => {
      const item = data?.integrations.find(value => value.provider === source.key);
      const offered = source.key === "ga4" ? data?.ga4_ready : data?.meta_ready;
      const label = mock ? "לבחירה" : failed ? "המצב לא נטען" : !data ? "בודקים את החיבור…"
        : item?.connected || item?.source_readiness ? sourcePresentation(item.source_readiness).label || "עוד לא נבדק"
        : item?.status?.startsWith("select_") ? "נשאר לבחור חשבון" : offered ? "לבחירה" : "אפשר להוסיף בהמשך";
      return <div key={source.key}>
        <ProviderLogo provider={source.logo} size={30} />
        <div><strong><Copy text={source.title} /></strong><p><Copy text={source.benefit} /></p><span><Copy text={label} /></span></div>
        <Link href={`/integrations#${source.key}`}><Copy text="לבדוק חיבור" /></Link>
      </div>;
    })}
  </div>;
}
