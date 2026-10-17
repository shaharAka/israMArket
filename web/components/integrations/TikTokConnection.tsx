"use client";

import { useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { UIAction } from "@/components/design/Controls";
import { ErrorNote } from "@/components/AppShell";
import { TEXT_ACTION } from "@/components/account/setupStyles";
import { endpoints, type IntegrationsPayload } from "@/lib/api";
import { LOCALE_META } from "@/lib/i18n/locales";
import { checkedDate } from "./SourceReadState";

/** מטרה: לחבר את החשבון הנכון ולראות אילו סרטונים זוכים לתגובה.
 * מסר: נלמד מהסרטונים שלכם כדי לדייק את הפוסטים הבאים.
 * פעולה: לחבר, לאשר את החשבון, או לרענן נתונים — בהתאם למצב האמיתי.
 */
export function TikTokConnection({ item, ready, demo, primary = false, onChanged }: {
  item?: IntegrationsPayload["integrations"][number]; ready: boolean; demo: boolean; primary?: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [revokeNote, setRevokeNote] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("tiktok_result");
    if (!result) return;
    const note = ({
      cancelled: "האישור בטיקטוק לא הושלם. אפשר לחבר שוב.",
      expired: "החיבור הזה כבר לא בתוקף. לחצו שוב על חיבור הטיקטוק.",
      failed: "לא הצלחנו להשלים את החיבור לטיקטוק. נסו שוב.",
      permission: "הגישה לסרטונים לא אושרה. חברו שוב ואשרו אותה בטיקטוק.",
    } as Record<string, string>)[result] || "";
    // Consume the external consent return after mounting; do not cascade render
    // synchronously from the effect while the Connections page is loading.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setReturnNote(note);
      params.delete("tiktok_result");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}#tiktok`);
    });
    return () => { active = false; };
  }, []);
  const data = item?.tiktok_data;
  const status = data?.source_readiness.status || "unchecked";
  const renew = ["reconnect", "permission"].includes(status);
  const selected = item?.status === "select_account";
  const connected = Boolean(item?.connected);

  async function act(action: "connect" | "confirm" | "read" | "disconnect") {
    if (demo || busy) return;
    setBusy(true); setError(""); setReturnNote(""); setRevokeNote(false);
    try {
      if (action === "connect") {
        const { url } = await endpoints.tiktokStart(locale);
        window.location.assign(url);
        return;
      }
      if (action === "confirm") await endpoints.tiktokAccount(item?.connection_attempt || "");
      if (action === "read") await endpoints.tiktokRead();
      if (action === "disconnect") {
        const result = await endpoints.disconnectIntegration("tiktok");
        setRevokeNote(result.remote_revoked === false);
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("לא הצלחנו לעדכן את החיבור לטיקטוק. נסו שוב."));
    } finally { setBusy(false); }
  }
  const numbers = new Intl.NumberFormat(formatLocale);
  return <div className="space-y-4 pb-5 pt-1">
    {!primary ? <p className="max-w-[42em] text-[15px] leading-6 text-[var(--ink-soft)]"><Copy text="נלמד אילו סרטונים מושכים צפיות ותגובות, ונשתמש בזה לתכנון הפוסטים הבאים." /></p> : null}
    {returnNote ? <p role="status" className="text-[14px] leading-6 text-[var(--ink-soft)]">{t(returnNote)}</p> : null}
    {error ? <ErrorNote message={error} /> : null}
    {revokeNote ? <p role="status" className="text-[14px] leading-6 text-[var(--ink-soft)]"><Copy text="החיבור אצלנו נותק. כדי להסיר גם את ההרשאה בטיקטוק, פתחו את הגדרות האפליקציות המחוברות בטיקטוק." /></p> : null}
    {selected ? <div className="space-y-2">
      <p className="text-[15px] text-[var(--ink)]"><strong>{item?.display_name}</strong> — <Copy text="זה חשבון הטיקטוק של העסק?" /></p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <UIAction variant={primary ? "primary" : "secondary"} disabled={busy || !ready || demo} onClick={() => act("confirm")}>
          {busy ? t("קוראים את נתוני הסרטונים…") : t("כן, לקרוא את הסרטונים")}
        </UIAction>
        <button type="button" className={TEXT_ACTION} disabled={busy || !ready || demo} onClick={() => act("connect")}><Copy text="לבחור חשבון אחר" /></button>
      </div>
    </div> : connected ? <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <UIAction variant={primary ? "primary" : "secondary"} disabled={busy || !ready || demo} onClick={() => act(renew ? "connect" : "read")}>
          {busy ? t("קוראים את נתוני הסרטונים…") : renew ? t("לחבר שוב את הטיקטוק") : t("לעדכן את נתוני הסרטונים")}
        </UIAction>
        <button type="button" className={TEXT_ACTION} disabled={busy || demo} onClick={() => act("disconnect")}><Copy text="לנתק" /></button>
      </div>
      <p role="status" className="text-[14px] leading-6 text-[var(--ink-soft)]">{t(data?.source_readiness.note_he || "נשאר לקרוא את נתוני הסרטונים.")}</p>
      {data?.checked_at ? <>
        <p className="text-[12px] leading-5 text-[var(--ink-muted)]"><Copy text="מצטבר מאז פרסום כל סרטון · נקרא ב־" />{checkedDate(data.checked_at, formatLocale)}</p>
        <ul className="divide-y divide-[var(--rule)]">
          {data.videos.slice(0, 3).map(video => <li key={video.id} className="py-3">
            {video.url ? <a href={video.url} target="_blank" rel="noopener noreferrer" dir="auto" className="block truncate text-[14px] font-medium text-[var(--ink)] hover:underline">{video.title || t("סרטון ללא כותרת")}</a> : <p dir="auto" className="truncate text-[14px] font-medium text-[var(--ink)]">{video.title || t("סרטון ללא כותרת")}</p>}
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--ink-soft)]">
              <span><Copy text="צפיות בסרטון" />: <bdi>{video.view_count === null ? t("לא נמדד") : numbers.format(video.view_count)}</bdi></span>
              <span><Copy text="תגובות" />: <bdi>{video.comment_count === null ? t("לא נמדד") : numbers.format(video.comment_count)}</bdi></span>
              <span><Copy text="שיתופים" />: <bdi>{video.share_count === null ? t("לא נמדד") : numbers.format(video.share_count)}</bdi></span>
            </div>
          </li>)}
        </ul>
      </> : null}
    </> : <UIAction variant={primary ? "primary" : "secondary"} disabled={!ready || busy || demo} onClick={() => act("connect")}><Copy text="לחבר את הטיקטוק" /></UIAction>}
    {!ready ? <p className="text-[13px] text-[var(--ink-muted)]"><Copy text="החיבור לטיקטוק עדיין לא זמין." /></p> : null}
  </div>;
}
