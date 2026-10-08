"use client";

import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProviderLogo } from "./ProviderLogo";
import { CONNECTION_EXAMPLES, type ConnectionExampleKey } from "./connectionExamples";

/** Recognisable vendor logos open concrete benefits, setup and screenshot pages. */
export function ConnectionShowcase() {
  const t = useCopy();
  const { locale } = useLanguage();
  return <nav className="lv2-connector-logos" aria-label={t("לבחור תוכנה ולקרוא על החיבור")}>
    {Object.entries(CONNECTION_EXAMPLES).map(([key, item]) => <Link key={key} href={`/connections/${key}?lang=${locale}`} className="lv2-connector-link">
      <ProviderLogo provider={key as ConnectionExampleKey} size={48} />
      <span><Copy text={item.short} /></span>
      {"availability" in item ? <small><Copy text={item.availability} /></small> : null}
    </Link>)}
  </nav>;
}
