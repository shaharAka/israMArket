"use client";
import { useEffect, useRef, useState } from "react";
import { endpoints, isDemo } from "./api";
import { captionDraftKey, forgetCaptionDraft, readCaptionDraft, writeCaptionDraft } from "./postCaptionDraft";

function store(): Storage | null { try { return window.localStorage; } catch { return null; } }

export function usePostCaptionDraft(plan: number | undefined, uid: string | undefined, outlet: string, saved: string) {
  const [value, setValue] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [durable, setDurable] = useState(false);
  const [base, setBase] = useState(saved);
  const key = useRef<string | null>(null);
  const draft = useRef<string | null>(null);
  const latestSaved = useRef(saved);
  useEffect(() => { latestSaved.current = saved; }, [saved]);
  useEffect(() => {
    let live = true;
    if (!plan || !uid) return;
    // Only a server-verified owner (or explicit demo owner) may read a local draft.
    endpoints.me().then(owner => {
      if (!live) return;
      key.current = captionDraftKey(`${isDemo() ? "demo" : "account"}:${owner.id}`, plan, uid, outlet);
      if (draft.current !== null) {
        setDurable(writeCaptionDraft(store(), key.current, latestSaved.current, draft.current));
        return;
      }
      const previous = readCaptionDraft(store(), key.current, latestSaved.current);
      if (previous) {
        draft.current = previous.text; setValue(previous.text); setBase(previous.base); setRestored(true);
        setDurable(writeCaptionDraft(store(), key.current, previous.base, previous.text));
      }
    }).catch(() => { /* Editing remains possible; unsaved work gets a leave guard. */ });
    return () => { live = false; key.current = null; };
  }, [plan, uid, outlet]);
  const dirty = value !== null && value !== saved;
  useEffect(() => {
    if (!dirty || durable) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, durable]);
  function change(next: string | null) {
    draft.current = next; setValue(next); setRestored(false);
    if (next === null || next === saved) {
      if (key.current) forgetCaptionDraft(store(), key.current);
      setBase(saved); setDurable(false); return;
    }
    const original = value === null ? saved : base;
    setBase(original);
    setDurable(Boolean(key.current && writeCaptionDraft(store(), key.current, original, next)));
  }
  return { value, change, dirty, restored, durable, changedElsewhere: dirty && base !== saved };
}
