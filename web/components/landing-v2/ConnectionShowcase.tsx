"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { CONNECTION_EXAMPLES } from "./connectionExamples";

const LOGOS: Record<string, string[]> = {
  "google-analytics": ["googleanalytics"],
  "facebook-instagram": ["facebook", "instagram"],
  "ads-pixel": ["meta"],
  whatsapp: ["whatsapp"],
};

/** Recognisable vendor logos open concrete benefits, setup and screenshot pages. */
export function ConnectionShowcase() {
  const t = useCopy();
  return <nav className="lv2-connector-logos" aria-label={t("לבחור תוכנה ולקרוא על החיבור")}>
    {Object.entries(CONNECTION_EXAMPLES).map(([key, item]) => <Link key={key} href={`/connections/${key}`} className="lv2-connector-link">
      <span className="lv2-connector-logo" aria-hidden="true">{LOGOS[key] ? LOGOS[key].map(logo => <Image key={logo} src={`/connectors/${logo}.svg`} width={40} height={40} alt="" />) : <span className="lv2-website-wordmark" dir="ltr">www.</span>}</span>
      <span><Copy text={item.short} /></span><small><Copy text="מה מקבלים ואיך מחברים" /></small>
    </Link>)}
  </nav>;
}
