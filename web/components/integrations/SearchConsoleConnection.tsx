"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { UIAction } from "@/components/design/Controls";
import { ErrorNote } from "@/components/AppShell";
import { FIELD, LABEL, TEXT_ACTION } from "@/components/account/setupStyles";
import { endpoints, type IntegrationsPayload } from "@/lib/api";
import { dateRange } from "@/lib/dates";
import { checkedDate } from "./SourceReadState";
import { LOCALE_META } from "@/lib/i18n/locales";

/** מטרה: לראות מה מביא אנשים מחיפוש בגוגל. מסר: חיבור נפרד מנתוני האתר.
 * פעולה: לאשר גישה, לבחור את האתר או לנסות שוב לפי המצב בפועל. */
export function SearchConsoleConnection({ item, ready, website, demo, primary, onChanged }: {
  item?: IntegrationsPayload["integrations"][number]; ready: boolean; website: string; demo: boolean;
  primary: boolean; onChanged: () => Promise<void>;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const state = item?.source_readiness;
  const sites = item?.sites || [];
  const selected = selection || (sites.length === 1 ? sites[0].site_url : "");
  const permitted = Boolean(item && !["disconnected", "pending"].includes(item.status));
  const choosing = state?.status === "choose_site" || item?.status === "select_site" && sites.length > 0;
  const renew = ["reconnect", "permission", "no_sites"].includes(state?.status || "");
  const data = item?.search_data;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("search_result");
    if (!result) return;
    const note = ({ cancelled: "האישור לגוגל לא הושלם. החיבור הקודם נשמר; אפשר לנסות שוב.",
      expired: "החיבור הזה כבר לא בתוקף. התחילו שוב את החיבור לגוגל.",
      permission: "נשאר לאשר קריאה של Search Console בחשבון הגוגל של האתר.",
      unavailable: "לא הצלחנו להשלים את החיבור לגוגל. אפשר לנסות שוב." } as Record<string, string>)[result] || "";
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setReturnNote(note);
      params.delete("search_result");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    });
    return () => { active = false; };
  }, []);

  async function act(action: "connect" | "read" | "select" | "disconnect") {
    if (busy || demo) return;
    setBusy(true); setError(""); setReturnNote("");
    const params = new URLSearchParams(window.location.search);
    params.delete("search_result");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}#search_console`);
    try {
      if (action === "connect") {
        const { url } = await endpoints.searchConsoleStart(locale);
        window.location.assign(url);
        return;
      }
      if (action === "select") await endpoints.searchConsoleSite(selected);
      if (action === "read") await endpoints.searchConsoleRead();
      if (action === "disconnect") await endpoints.disconnectIntegration("search_console");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו לבדוק את הנתונים. נסו שוב."));
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <p className="text-[15px] leading-6 text-[var(--ink-soft)]"><Copy text="נראה באילו חיפושים האתר מופיע ומה מביא אליו אנשים. החיבור הזה נפרד מגוגל אנליטיקס." /></p>
    {returnNote ? <p role="status" className="text-[14px] leading-6 text-[var(--ink-soft)]">{t(returnNote)}</p> : null}
    {error ? <ErrorNote message={error} /> : null}
    {!website ? <Link href={`/integrations?lang=${locale}#website`} className={TEXT_ACTION}><Copy text="להוסיף את כתובת האתר" /></Link> : <>
      {item?.account_email ? <p dir="auto" className="break-words text-[14px] text-[var(--ink-soft)]">{item.account_email}</p> : null}
      {state ? <p role="status" aria-live="polite" className="text-[14px] leading-6 text-[var(--ink-soft)]">{t(busy ? "קוראים את החיפושים שבהם האתר מופיע בגוגל." : state.note_he)}</p> : null}
      {choosing ? <div className="space-y-3">
        <label htmlFor="search-console-site" className={LABEL}><Copy text="האתר של העסק בחיפוש בגוגל" /></label>
        <select id="search-console-site" value={selected} onChange={event => setSelection(event.target.value)} className={FIELD} disabled={busy} dir="ltr">
          <option value="">{t("בחרו את האתר מהרשימה")}</option>
          {sites.map(site => <option key={site.site_url} value={site.site_url}>{site.site_url}</option>)}
        </select>
        <UIAction variant={primary ? "primary" : "secondary"} disabled={busy || !selected || demo} onClick={() => act("select")}><Copy text="לבחור את האתר ולקרוא חיפושים" /></UIAction>
      </div> : <UIAction variant={primary ? "primary" : "secondary"} disabled={busy || !ready || demo} onClick={() => act(!permitted || renew ? "connect" : "read")}>
        <Copy text={!ready ? "החיבור עדיין לא זמין" : !permitted ? "לחבר את החיפושים בגוגל" : state?.status === "no_sites" ? "לבחור חשבון גוגל אחר" : renew ? "לחדש את הגישה" : "לעדכן את נתוני החיפוש"} />
      </UIAction>}
      {permitted ? <div className="flex flex-wrap gap-x-5 gap-y-1">
        {!renew ? <button type="button" disabled={busy || demo} onClick={() => act("connect")} className={TEXT_ACTION}><Copy text="להחליף חשבון" /></button> : null}
        <button type="button" disabled={busy || demo} onClick={() => act("disconnect")} className="min-h-11 text-[14px] text-[var(--ink-muted)] hover:underline"><Copy text="לנתק" /></button>
      </div> : null}
    </>}
    {data ? <div className="border-t border-[var(--rule)] pt-4">
      <p className="mb-2 text-[13px] text-[var(--ink-muted)]"><Copy text="התקופה שנקראה" />: <bdi>{dateRange(data.period.start, data.period.end, locale)}</bdi> · {checkedDate(data.read_at, LOCALE_META[locale].formatLocale)}</p>
      <ul className="divide-y divide-[var(--rule)]">{data.queries.slice(0, 3).map(row => <li key={row.query} className="flex flex-wrap justify-between gap-3 py-2 text-[14px]"><span dir="auto">{row.query}</span><span className="tabular-nums text-[var(--ink-soft)]">{t("{arg_0} לחיצות מהחיפוש", { arg_0: row.clicks.toLocaleString(LOCALE_META[locale].formatLocale) })}</span></li>)}</ul>
      <Link href={`/promotion?lang=${locale}#google`} className={TEXT_ACTION}><Copy text="לראות את החיפושים והמסקנות" /></Link>
    </div> : null}
    {!item?.connected || state?.status === "no_sites" ? <details className="border-t border-[var(--rule)] text-[14px] leading-6 text-[var(--ink-soft)]">
      <summary className="min-h-11 cursor-pointer py-2 font-medium"><Copy text="האתר לא מופיע?" /></summary>
      <p><Copy text="בקשו ממי שמנהל את האתר לתת לחשבון הגוגל שלכם גישה ב-Search Console. אם האתר עוד לא נוסף, מוסיפים ומאמתים אותו בגוגל, ואז חוזרים לבדוק כאן." /></p>
      <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className={TEXT_ACTION}><Copy text="לפתוח את Search Console בגוגל" /></a>
      {permitted ? <button type="button" disabled={busy || demo} onClick={() => act("read")} className={`${TEXT_ACTION} ms-5`}><Copy text="לבדוק שוב את הגישה לאתר" /></button> : null}
    </details> : null}
  </div>;
}
