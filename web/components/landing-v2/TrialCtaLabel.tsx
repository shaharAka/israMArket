"use client";
import {Copy,useLanguage} from "@/components/language/LanguageProvider";
import {TRIAL_LABEL} from "@/lib/pricing";
/** Keep the month-long offer in supporting copy; compact translated action labels fit buttons. */
export function TrialCtaLabel(){const {locale}=useLanguage();return <Copy text={locale==="en"||locale==="ru"?"להתחיל בחינם":TRIAL_LABEL}/>;}
