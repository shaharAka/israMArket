"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import { ApiError, endpoints, isDemo, type StrategyPayload } from "@/lib/api";
import { CONTENT_LANGUAGES, CONTENT_LANGUAGE_NAMES, contentDirection, type ContentLanguage } from "@/lib/content-language";
import { browserDraftStorage, quickPostDraftKey, quickPostRequest, readQuickPostDraft, writeQuickPostDraft } from "@/lib/postCaptionDraft";
import { foundations } from "@/lib/trial";
import ui from "./chrome.module.css";

// English purpose: turn the owner's timely idea/text into a saved draft, then edit it.
// Main message: choose a channel and prepare its format for manual publishing. Main action: open the editor.
export type QuickPostDraft = {
  text: string; destination: "instagram" | "facebook" | "whatsapp" | "tiktok" | "linkedin"; language: ContentLanguage;
  changedLanguage: boolean; requestId: string; pending: Parameters<typeof endpoints.createPost>[0] | null;
};
export function QuickPost({ open, onCancel, onCreated, draft, onDraftChange, plan }: {
  open: boolean; onCancel: () => void;
  onCreated: (strategy: StrategyPayload, index: number) => void;
  draft: QuickPostDraft | null; onDraftChange: (value: QuickPostDraft | null) => void;
  plan?: number;
}) {
  const t = useCopy();
  const id = useId();
  const [text, setText] = useState(() => draft?.text ?? "");
  const [destination, setDestination] = useState<QuickPostDraft["destination"]>(() => draft?.destination ?? "instagram");
  const [language, setLanguage] = useState<ContentLanguage>(() => draft?.language ?? "he");
  const changedLanguage = useRef(draft?.changedLanguage ?? false);
  const requestId = useRef(draft?.requestId ?? "");
  const pending = useRef<Parameters<typeof endpoints.createPost>[0] | null>(draft?.pending ?? null);
  const touched = useRef(false);
  const languageLocked = useRef(Boolean(draft));
  const verifiedAccount = useRef<string | null>(null);
  const lastPlan = useRef<number | undefined>(plan);
  const draftKey = useRef<string | null>(null);
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(Boolean(draft?.pending));
  const [draftDurable, setDraftDurable] = useState<boolean | null>(null);
  const scope = String(plan ?? "unplanned");
  const draftReady = readyScope === scope;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedConflict, setSavedConflict] = useState(false);
  useEffect(() => {
    onDraftChange({ text, destination, language, changedLanguage: changedLanguage.current,
      requestId: requestId.current, pending: pending.current });
  }, [text, destination, language, busy, onDraftChange]);
  useEffect(() => {
    let active = true;
    draftKey.current = null;
    endpoints.me().then(owner => {
      if (!active) return;
      const ownerScope = `${isDemo() ? "demo" : "account"}:${owner.id}`;
      const key = quickPostDraftKey(ownerScope, plan);
      if (verifiedAccount.current && verifiedAccount.current !== ownerScope) {
        touched.current = false;
        changedLanguage.current = false;
        languageLocked.current = false;
        requestId.current = "";
        pending.current = null;
        setHasPending(false);
        setDraftDurable(null);
        setText(""); setDestination("instagram"); setLanguage("he");
      } else if (verifiedAccount.current === ownerScope && lastPlan.current !== undefined && lastPlan.current !== plan) {
        touched.current = false;
        changedLanguage.current = false;
        languageLocked.current = false;
        requestId.current = "";
        pending.current = null;
        setHasPending(false);
        setDraftDurable(null);
        setText(""); setDestination("instagram"); setLanguage("he");
      }
      verifiedAccount.current = ownerScope;
      lastPlan.current = plan;
      draftKey.current = key;
      const storage = browserDraftStorage();
      const stored = readQuickPostDraft(storage, key);
      if (!touched.current && stored) {
        changedLanguage.current = stored.changedLanguage;
        languageLocked.current = true;
        requestId.current = stored.requestId;
        pending.current = stored.pending;
        setHasPending(Boolean(stored.pending));
        setDraftDurable(null);
        setText(stored.text); setDestination(stored.destination); setLanguage(stored.language);
      }
      setReadyScope(scope);
    }).catch(() => {});
    return () => { active = false; };
  }, [plan, scope]);
  useEffect(() => {
    if (!draftReady || !draftKey.current) return;
    const key = draftKey.current;
    const durable = writeQuickPostDraft(browserDraftStorage(), key, { text, destination, language,
      changedLanguage: changedLanguage.current, requestId: requestId.current, pending: pending.current });
    queueMicrotask(() => setDraftDurable(durable));
  }, [text, destination, language, busy, hasPending, draftReady]);
  useEffect(() => {
    if (draftDurable || (!text && !hasPending)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftDurable, text, hasPending]);
  useEffect(() => {
    let active = true;
    foundations.contentLanguage().then(prefs => {
      if (active && !changedLanguage.current && !languageLocked.current) {
        setDraftDurable(null);
        setLanguage(prefs.default_language);
      }
    }).catch(() => { /* A local language choice remains available without preferences. */ });
    return () => { active = false; };
  }, []);
  if (!open) return null;
  return <section className="mt-6 max-w-2xl" aria-label={t("פוסט משלכם")}>
    <form className="space-y-5" onSubmit={async event => {
      event.preventDefault();
      if (busy || !text.trim()) return;
      const request = quickPostRequest({ text, destination, language, requestId: requestId.current, pending: pending.current }, () => crypto.randomUUID());
      requestId.current = request.requestId;
      pending.current = request.pending;
      setDraftDurable(null);
      setHasPending(true);
      setBusy(true); setError(""); setSavedConflict(false);
      try {
        const result = await endpoints.createPost(pending.current);
        requestId.current = ""; pending.current = null; setHasPending(false); setText(""); onDraftChange(null);
        if (window.location.pathname === "/posts" && new URLSearchParams(window.location.search).get("create") === "1") onCreated(result.strategy, result.post_index);
      } catch (err) {
        setSavedConflict(err instanceof ApiError && err.code === "draft_already_saved");
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.code !== "draft_already_saved") {
          pending.current = null; requestId.current = ""; setHasPending(false);
        }
        setError(err instanceof ApiError && err.status > 0 && err.status < 500 ? err.message : "לא הצלחנו לשמור את הטיוטה. הטקסט כאן, אפשר לנסות שוב.");
      } finally { setBusy(false); }
    }}>
      <div>
        <label htmlFor={`${id}-text`} className="mb-2 block text-[15px] font-medium">{t("מה תרצו לכתוב בפוסט?")}</label>
        <textarea id={`${id}-text`} required maxLength={4000} rows={6} disabled={busy || hasPending} value={text}
          dir={contentDirection(language)} lang={language} className={ui.field}
          placeholder={t("למשל, הודעה על סדנה חדשה. אפשר גם להדביק טקסט שכבר כתבתם.")}
          onChange={event => { touched.current = true; setDraftDurable(null); setText(event.target.value); }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`${id}-destination`} className="mb-2 block text-sm font-medium">{t("איפה הפוסט יופיע?")}</label>
          <select id={`${id}-destination`} className={ui.field} disabled={busy || hasPending} value={destination} onChange={event => { touched.current = true; setDraftDurable(null); setDestination(event.target.value as QuickPostDraft["destination"]); }}>
            <option value="instagram">{t("אינסטגרם")}</option><option value="facebook">{t("פייסבוק")}</option>
            <option value="whatsapp">{t("וואטסאפ")}</option><option value="tiktok">{t("טיקטוק")}</option>
            <option value="linkedin">{t("לינקדאין")}</option>
          </select></div>
        <div><label htmlFor={`${id}-language`} className="mb-2 block text-sm font-medium">{t("שפת הפוסט")}</label>
          <select id={`${id}-language`} className={ui.field} disabled={busy || hasPending} value={language} dir="auto" onChange={event => { touched.current = true; setDraftDurable(null); changedLanguage.current = true; languageLocked.current = true; setLanguage(event.target.value as ContentLanguage); }}>
            {CONTENT_LANGUAGES.map(code => <option key={code} value={code} lang={code}>{CONTENT_LANGUAGE_NAMES[code]}</option>)}
          </select></div>
      </div>
      <p className="text-sm text-[var(--ink-soft)]">{t(destination === "tiktok"
        ? "הטיוטה תישמר כסרטון. בעורך תוכלו לצרף סרטון שלכם ולהוריד אותו לפרסום ידני בטיקטוק."
        : destination === "linkedin"
          ? "הטיוטה תישמר כפוסט תמונה. בעורך תוכלו להוסיף תמונה, לערוך את הנוסח ולהוריד את החומרים לפרסום ידני בלינקדאין."
          : "בעורך תוכלו להוסיף תמונה, לערוך את הנוסח ולהוריד את החומרים לפרסום.")}</p>
      {draftDurable === false && draftReady && (text || hasPending) ? <p role="status" className="text-sm text-[var(--ink-soft)]">{t("הדפדפן לא שומר את הטיוטה. פתחו אותה בעורך כדי לשמור בחשבון.")}</p> : null}
      {draftDurable && (text || hasPending) ? <p role="status" className="text-sm text-[var(--ink-soft)]">{t("הטיוטה נשמרה במכשיר הזה")}</p> : null}
      {error ? <p role="alert" className={ui.error}>{t(error)}</p> : null}
      {savedConflict ? <button type="button" className={`${ui.link} min-h-11`} disabled={busy} onClick={async () => {
        if (!pending.current) return;
        setBusy(true);
        try {
          const result = await endpoints.createPost(pending.current);
          requestId.current = ""; pending.current = null; setHasPending(false); setSavedConflict(false); setError(""); setText(""); touched.current = false;
          onDraftChange(null);
          if (window.location.pathname === "/posts" && new URLSearchParams(window.location.search).get("create") === "1") onCreated(result.strategy, result.post_index);
        } catch { setError("לא הצלחנו לפתוח את הטיוטה. אפשר לנסות שוב."); }
        finally { setBusy(false); }
      }}>{t("לפתוח את הטיוטה שנשמרה")}</button> : null}
      <div className="flex flex-wrap items-center gap-4">
        <button className={ui.button} type="submit" disabled={busy || !text.trim()}>{t(busy ? "שומרים את הטיוטה…" : hasPending ? "לנסות שוב" : "לפתוח בעורך")}</button>
        <button type="button" className={`${ui.link} min-h-11`} disabled={busy} onClick={onCancel}>{t("לחזור לקמפיין")}</button>
      </div>
    </form>
  </section>;
}
