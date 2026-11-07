"use client";
import { useEffect, useRef, useState } from "react";
import { endpoints, isDemo } from "./api";
import { browserDraftStorage, captionDraftKey, forgetCaptionDraft, readCaptionDraft, resolveCaptionDraftConflict, writeCaptionDraft } from "./postCaptionDraft";

export function usePostCaptionDraft(plan: number | undefined, uid: string | undefined, outlet: string, saved: string) {
  const [storedValue, setStoredValue] = useState<string | null>(null);
  const [restoredValue, setRestoredValue] = useState(false);
  const [durableValue, setDurableValue] = useState(false);
  const [base, setBase] = useState(saved);
  const [loadedScope, setLoadedScope] = useState("");
  const scope = JSON.stringify([plan ?? null, uid ?? null, outlet]);
  const active = loadedScope === scope;
  const value = active ? storedValue : null;
  const restored = active && restoredValue;
  const durable = active && durableValue;
  const activeBase = active ? base : saved;
  const key = useRef<string | null>(null);
  const draft = useRef<string | null>(null);
  const latestSaved = useRef(saved);
  useEffect(() => { latestSaved.current = saved; }, [saved]);
  useEffect(() => {
    let live = true;
    key.current = null;
    if (!plan || !uid) return;
    // Only a server-verified owner (or explicit demo owner) may read a local draft.
    endpoints.me().then(owner => {
      if (!live) return;
      key.current = captionDraftKey(`${isDemo() ? "demo" : "account"}:${owner.id}`, plan, uid, outlet);
      if (draft.current !== null) {
        setDurableValue(writeCaptionDraft(browserDraftStorage(), key.current, latestSaved.current, draft.current));
        setLoadedScope(scope);
        return;
      }
      const previous = readCaptionDraft(browserDraftStorage(), key.current, latestSaved.current);
      if (previous) {
        draft.current = previous.text; setStoredValue(previous.text); setBase(previous.base); setRestoredValue(true);
        setDurableValue(writeCaptionDraft(browserDraftStorage(), key.current, previous.base, previous.text));
      } else {
        setStoredValue(null); setBase(latestSaved.current); setRestoredValue(false); setDurableValue(false);
      }
      setLoadedScope(scope);
    }).catch(() => { /* Editing remains possible; unsaved work gets a leave guard. */ });
    return () => { live = false; key.current = null; };
  }, [plan, uid, outlet, scope]);
  const dirty = value !== null && value !== saved;
  useEffect(() => {
    if (!dirty || durable) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, durable]);
  function change(next: string | null) {
    draft.current = next; setStoredValue(next); setRestoredValue(false); setLoadedScope(scope);
    if (next === null || next === saved) {
      if (key.current) forgetCaptionDraft(browserDraftStorage(), key.current);
      setBase(saved); setDurableValue(false); return;
    }
    const original = value === null ? saved : activeBase;
    setBase(original);
    setDurableValue(Boolean(key.current && writeCaptionDraft(browserDraftStorage(), key.current, original, next)));
  }
  function resolveServerChange(choice: "keep" | "reload") {
    const current = value === null ? null : { version: 1 as const, base: activeBase, text: value, updated: Date.now() };
    const resolved = current ? resolveCaptionDraftConflict(current, saved, choice) : null;
    if (choice === "reload") {
      if (key.current) forgetCaptionDraft(browserDraftStorage(), key.current);
      draft.current = null; setStoredValue(null); setBase(saved); setRestoredValue(false); setDurableValue(false);
      return;
    }
    if (!resolved) return;
    setBase(resolved.base);
    setRestoredValue(false);
    setDurableValue(Boolean(key.current && writeCaptionDraft(browserDraftStorage(), key.current, resolved.base, resolved.text, resolved.updated)));
  }
  return { value, change, dirty, restored, durable, base: activeBase, changedElsewhere: dirty && activeBase !== saved, resolveServerChange };
}
