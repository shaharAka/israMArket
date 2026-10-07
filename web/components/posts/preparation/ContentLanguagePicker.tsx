"use client";

import { useEffect, useId, useState } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import { foundations } from "@/lib/trial";
import { CONTENT_LANGUAGES, CONTENT_LANGUAGE_NAMES, DEFAULT_CONTENT_LANGUAGE, type ContentLanguage, type ContentLanguagePreferences } from "@/lib/content-language";
import ui from "../chrome.module.css";

/** A choice before writing, not another required onboarding task. */
export function ContentLanguagePicker({ onPendingChange, onBatchChange, allowBatchChoice = true }: { allowBatchChoice?: boolean; onPendingChange: (pending: boolean) => void; onBatchChange: (language?: ContentLanguage) => void }) {
  const t = useCopy();
  const id = useId();
  const [saved, setSaved] = useState<ContentLanguagePreferences>(DEFAULT_CONTENT_LANGUAGE);
  const [draft, setDraft] = useState<ContentLanguagePreferences>(DEFAULT_CONTENT_LANGUAGE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [batch, setBatch] = useState<ContentLanguage | "">("");
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => {
    let alive = true;
    foundations.contentLanguage().then(prefs => { if (alive) { setSaved(prefs); setDraft(prefs); setLoaded(true); setError(false); } }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [retry]);
  useEffect(() => { onPendingChange(saving || dirty); }, [saving, dirty, onPendingChange]);
  async function save() {
    if (saving) return;
    setSaving(true); setError(false); setConfirmed(false);
    try { const prefs = await foundations.saveContentLanguage(draft); setSaved(prefs); setDraft(prefs); setConfirmed(true); }
    catch { setError(true); }
    finally { setSaving(false); }
  }
  const changeDefault = (language: ContentLanguage) => {
    setConfirmed(false);
    setDraft(prefs => ({ ...prefs, default_language: language, audience_languages: Array.from(new Set([language, ...prefs.audience_languages])) }));
  };
  const changeAudience = (language: ContentLanguage, checked: boolean) => {
    setConfirmed(false);
    setDraft(prefs => {
      const audience_languages = checked ? CONTENT_LANGUAGES.filter(code => prefs.audience_languages.includes(code) || code === language) : prefs.audience_languages.filter(code => code !== language);
      return { ...prefs, audience_languages, allow_language_tests: prefs.allow_language_tests && audience_languages.length > 1 };
    });
  };
  return <div className="mb-6 border-y border-[var(--rule)] py-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label htmlFor={`${id}-default`} className="text-[15px] font-semibold">{t("שפת הפוסטים")}</label>
      <select id={`${id}-default`} value={draft.default_language} disabled={!loaded || saving} onChange={event => changeDefault(event.target.value as ContentLanguage)} className={`${ui.field} min-h-11 max-w-48`} dir="auto">
        {CONTENT_LANGUAGES.map(language => <option key={language} value={language} lang={language}>{CONTENT_LANGUAGE_NAMES[language]}</option>)}
      </select>
      {dirty ? <button type="button" onClick={() => void save()} disabled={saving} className={`${ui.link} min-h-11`}>{saving ? t("שומרים…") : t("לשמור את שפת הפוסטים")}</button> : null}
      {confirmed ? <span role="status" className="text-[13px] text-[var(--good)]">{t("נשמר לפוסטים הבאים")}</span> : null}
    </div>
    <p className={`${ui.help} mt-1`}>{t("זו השפה שבה נכתוב ללקוחות שלכם. היא נפרדת משפת האתר; פוסטים שכבר נכתבו יישארו כמו שהם.")}</p>
    {error ? <div role="alert" className="mt-2 text-[13px] text-[var(--danger)]"><p>{t("לא הצלחנו לשמור או לטעון את בחירת השפה. אפשר לנסות שוב; הכתיבה תשתמש בבחירה האחרונה שנשמרה.")}</p><button type="button" className={`${ui.link} min-h-11`} onClick={() => loaded ? void save() : setRetry(value => value + 1)}>{t("לנסות שוב")}</button>{dirty ? <button type="button" className={`${ui.link} ms-4 min-h-11`} onClick={() => { setDraft(saved); setError(false); }}>{t("להמשיך עם הבחירה שנשמרה")}</button> : null}</div> : null}
    <details className="mt-2">
      <summary className={`${ui.summary} min-h-11 text-[14px]`}>{t(allowBatchChoice ? "קהל בכמה שפות או בחירה רק לכתיבה הזו" : "לקהל שקורא בכמה שפות")}</summary>
      <div className="max-w-[38em] space-y-3 pt-2 text-[14px] leading-6">
        <fieldset disabled={!loaded || saving}><legend className="mb-2 font-medium">{t("באילו שפות הלקוחות שלכם קוראים?")}</legend><div className="flex flex-wrap gap-x-5 gap-y-1">{CONTENT_LANGUAGES.map(language => <label key={language} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.audience_languages.includes(language)} disabled={language === draft.default_language} onChange={event => changeAudience(language, event.target.checked)} />{CONTENT_LANGUAGE_NAMES[language]}</label>)}</div></fieldset>
        <label className="flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1.5" checked={draft.allow_language_tests} disabled={!loaded || saving || draft.audience_languages.length < 2} onChange={event => { setConfirmed(false); setDraft(prefs => ({ ...prefs, allow_language_tests: event.target.checked })); }} /><span>{t("להציע מדי פעם פוסט בשפה נוספת שהקהל שלי קורא")}</span></label>
        <p className={ui.help}>{t("נציע ניסוי קטן לפי הקהל, ההצעה וסוג העסק, ונראה את הסיבה ליד הטיוטה. לפני שיש תוצאות, לא נציג שפה מסוימת כטובה יותר.")}</p>
        {allowBatchChoice ? <>
          <label htmlFor={`${id}-batch`} className="block font-medium">{t("רק לפוסטים שנכתוב עכשיו")}</label>
          <select id={`${id}-batch`} value={batch} disabled={saving} dir="auto" className={`${ui.field} min-h-11 max-w-full`} onChange={event => { const value = event.target.value as ContentLanguage | ""; setBatch(value); onBatchChange(value || undefined); }}>
            <option value="">{t("לפי הבחירה הקבועה של העסק")}</option>
            {CONTENT_LANGUAGES.map(language => <option key={language} value={language} lang={language}>{CONTENT_LANGUAGE_NAMES[language]}</option>)}
          </select>
          {batch ? <p className={ui.help}>{t("הבחירה הזו לא תשנה את ברירת המחדל של העסק, ובכתיבה הזו לא ננסה שפות נוספות.")}</p> : null}
        </> : null}
      </div>
    </details>
  </div>;
}
