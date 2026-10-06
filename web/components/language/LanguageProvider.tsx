"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LOCALE_META, isLocale, type Locale } from "@/lib/i18n/locales";
import { formatMessage, loadCatalog, type Catalog, type MessageArgs } from "@/lib/i18n/messages";
import { messageId } from "@/lib/i18n/message-id";

const STORAGE_KEY = "isramarket.interface-language";
const cached = new Map<Locale, Promise<Catalog>>();
type Copy = (source: string, args?: MessageArgs) => string;
const sourceCopy: Copy = (source, args) => formatMessage(source, args);
const LanguageContext = createContext({ locale: "he" as Locale, busy: false, error: "", t: sourceCopy, choose: (_: Locale) => { void _; } });

/** UI copy only: no customer strings, business language, generation, navigation or draft writes. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<{ locale: Locale; catalog: Catalog }>({ locale: "he", catalog: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requests = useRef({ version: 0 });
  const choose = useCallback(async (locale: Locale, persist = true) => {
    const request = ++requests.current.version;
    setBusy(true);
    setError("");
    try {
      let catalog: Catalog = {};
      if (locale !== "he") {
        if (!cached.has(locale)) cached.set(locale, loadCatalog(locale));
        try { catalog = await cached.get(locale)!; }
        catch (failure) { cached.delete(locale); throw failure; }
      }
      if (request !== requests.current.version) return;
      setSelection({ locale, catalog });
      document.documentElement.lang = locale;
      document.documentElement.dir = LOCALE_META[locale].direction;
      if (persist) {
        try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* Choice still works for this visit. */ }
        const url = new URL(window.location.href);
        url.searchParams.set("lang", locale);
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      if (request === requests.current.version) setError("לא הצלחנו להחליף שפה. אפשר לנסות שוב.");
    } finally {
      if (request === requests.current.version) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const activeRequests = requests.current;
    const timer = window.setTimeout(() => {
      let saved: unknown;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Restricted storage is optional. */ }
      const requested = new URLSearchParams(window.location.search).get("lang");
      const locale = isLocale(requested) ? requested : isLocale(saved) ? saved : "he";
      void choose(locale, false);
    }, 0);
    return () => { window.clearTimeout(timer); activeRequests.version++; };
  }, [choose]);
  const value = useMemo(() => ({
    locale: selection.locale, busy, error,
    choose: (locale: Locale) => { void choose(locale); },
    t: ((source, args) => {
      const id = messageId(source);
      return formatMessage(selection.locale === "he" || !Object.hasOwn(selection.catalog, id) ? source : selection.catalog[id], args);
    }) as Copy,
  }), [selection, busy, error, choose]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useCopy = () => useLanguage().t;

/** Keep canonical copy visible to the extractor when a server-rendered page uses it. */
export function Copy({ text, args }: { text: string; args?: MessageArgs }) {
  const t = useCopy();
  return t(text, args);
}
