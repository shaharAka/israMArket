"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import { ApiError, endpoints, type StrategyPayload } from "@/lib/api";
import { CONTENT_LANGUAGES, CONTENT_LANGUAGE_NAMES, contentDirection, type ContentLanguage } from "@/lib/content-language";
import { foundations } from "@/lib/trial";
import ui from "./chrome.module.css";

// English purpose: turn the owner's timely idea/text into a saved draft, then edit it.
// Main message: write what this post should say. Main action: open the existing editor.
export type QuickPostDraft = {
  text: string; destination: "instagram" | "facebook" | "whatsapp"; language: ContentLanguage;
  changedLanguage: boolean; requestId: string; pending: Parameters<typeof endpoints.createPost>[0] | null;
};
export function QuickPost({ open, onCancel, onCreated, draftRef }: {
  open: boolean; onCancel: () => void;
  onCreated: (strategy: StrategyPayload, index: number) => void;
  draftRef: RefObject<QuickPostDraft | null>;
}) {
  const t = useCopy();
  const id = useId();
  const [text, setText] = useState(() => draftRef.current?.text ?? "");
  const [destination, setDestination] = useState<"instagram" | "facebook" | "whatsapp">(() => draftRef.current?.destination ?? "instagram");
  const [language, setLanguage] = useState<ContentLanguage>(() => draftRef.current?.language ?? "he");
  const changedLanguage = useRef(draftRef.current?.changedLanguage ?? false);
  const requestId = useRef(draftRef.current?.requestId ?? "");
  const pending = useRef<Parameters<typeof endpoints.createPost>[0] | null>(draftRef.current?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedConflict, setSavedConflict] = useState(false);
  useEffect(() => {
    // Kept only in this mounted workspace: returning from the editor preserves a
    // different, unsaved idea without storing it across sign-outs or accounts.
    draftRef.current = { text, destination, language, changedLanguage: changedLanguage.current,
      requestId: requestId.current, pending: pending.current };
  }, [text, destination, language, busy, draftRef]);
  useEffect(() => {
    let active = true;
    foundations.contentLanguage().then(prefs => {
      if (active && !changedLanguage.current) setLanguage(prefs.default_language);
    }).catch(() => { /* A local language choice remains available without preferences. */ });
    return () => { active = false; };
  }, []);
  if (!open) return null;
  return <section className="mt-6 max-w-2xl" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="text-xl font-semibold">{t("פוסט משלכם")}</h2>
    <form className="mt-5 space-y-5" onSubmit={async event => {
      event.preventDefault();
      if (busy || !text.trim()) return;
      requestId.current ||= crypto.randomUUID();
      pending.current ||= { client_ref: requestId.current, text, destination, content_language: language };
      setBusy(true); setError(""); setSavedConflict(false);
      try {
        const result = await endpoints.createPost({ client_ref: requestId.current, text, destination, content_language: language });
        requestId.current = ""; pending.current = null; setText(""); draftRef.current = null;
        if (window.location.pathname === "/posts" && new URLSearchParams(window.location.search).get("create") === "1") onCreated(result.strategy, result.post_index);
      } catch (err) {
        setSavedConflict(err instanceof ApiError && err.code === "draft_already_saved");
        setError(err instanceof ApiError && err.status > 0 && err.status < 500 ? err.message : "לא הצלחנו לשמור את הטיוטה. הטקסט כאן, אפשר לנסות שוב.");
      } finally { setBusy(false); }
    }}>
      <div>
        <label htmlFor={`${id}-text`} className="mb-2 block text-[15px] font-medium">{t("מה תרצו לכתוב בפוסט?")}</label>
        <textarea id={`${id}-text`} required maxLength={4000} rows={6} disabled={busy} value={text}
          dir={contentDirection(language)} lang={language} className={ui.field}
          placeholder={t("למשל, הודעה על סדנה חדשה. אפשר גם להדביק טקסט שכבר כתבתם.")}
          onChange={event => setText(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`${id}-destination`} className="mb-2 block text-sm font-medium">{t("איפה הפוסט יופיע?")}</label>
          <select id={`${id}-destination`} className={ui.field} disabled={busy} value={destination} onChange={event => setDestination(event.target.value as typeof destination)}>
            <option value="instagram">{t("אינסטגרם")}</option><option value="facebook">{t("פייסבוק")}</option>
            <option value="whatsapp">{t("וואטסאפ")}</option>
          </select></div>
        <div><label htmlFor={`${id}-language`} className="mb-2 block text-sm font-medium">{t("שפת הפוסט")}</label>
          <select id={`${id}-language`} className={ui.field} disabled={busy} value={language} dir="auto" onChange={event => { changedLanguage.current = true; setLanguage(event.target.value as ContentLanguage); }}>
            {CONTENT_LANGUAGES.map(code => <option key={code} value={code} lang={code}>{CONTENT_LANGUAGE_NAMES[code]}</option>)}
          </select></div>
      </div>
      <p className="text-sm text-[var(--ink-soft)]">{t("בעורך תוכלו להוסיף תמונה, לשפר את הטקסט ולבחור מתי לפרסם.")}</p>
      {error ? <p role="alert" className={ui.error}>{t(error)}</p> : null}
      {savedConflict ? <button type="button" className={`${ui.link} min-h-11`} disabled={busy} onClick={async () => {
        if (!pending.current) return;
        setBusy(true);
        try {
          const result = await endpoints.createPost(pending.current);
          requestId.current = ""; pending.current = null; setSavedConflict(false); setError("");
          // Keep any newly typed text available when the owner returns to this form.
          draftRef.current = { text, destination, language, changedLanguage: true, requestId: "", pending: null };
          if (window.location.pathname === "/posts" && new URLSearchParams(window.location.search).get("create") === "1") onCreated(result.strategy, result.post_index);
        } catch { setError("לא הצלחנו לפתוח את הטיוטה. אפשר לנסות שוב."); }
        finally { setBusy(false); }
      }}>{t("לפתוח את הטיוטה שנשמרה")}</button> : null}
      <div className="flex flex-wrap items-center gap-4">
        <button className={ui.button} type="submit" disabled={busy || !text.trim()}>{t(busy ? "שומרים את הטיוטה…" : "לפתוח בעורך")}</button>
        <button type="button" className={`${ui.link} min-h-11`} disabled={busy} onClick={onCancel}>{t("לחזור לפוסטים")}</button>
      </div>
    </form>
  </section>;
}
