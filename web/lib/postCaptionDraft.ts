/** Owner- and post-scoped interrupted work. Never a saved/approved post. */
export type CaptionDraft = { version: 1; base: string; text: string; updated: number };
export type QuickPostDraftValue = {
  version: 1;
  text: string;
  destination: "instagram" | "facebook" | "whatsapp" | "tiktok" | "linkedin";
  language: "he" | "en" | "ar" | "ru";
  changedLanguage: boolean;
  requestId: string;
  pending: { client_ref: string; text: string; destination: QuickPostDraftValue["destination"]; content_language: QuickPostDraftValue["language"] } | null;
  updated: number;
};
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const CAPTION_PREFIX = "isramarket:caption-draft:";
const QUICK_PREFIX = "isramarket:quick-post-draft:";
const TTL = 7 * 24 * 60 * 60 * 1000;
const memory = new Map<string, CaptionDraft>();
const quickMemory = new Map<string, QuickPostDraftValue>();
const destinations = ["instagram", "facebook", "whatsapp", "tiktok", "linkedin"];
const languages = ["he", "en", "ar", "ru"];
export function fallbackDraftStorage(primary: DraftStorage | null, fallback: DraftStorage | null): DraftStorage | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    getItem(key) {
      let first: string | null = null, second: string | null = null;
      try { first = primary.getItem(key); } catch { /* Try the second browser store. */ }
      try { second = fallback.getItem(key); } catch { /* The primary may still be readable. */ }
      const updated = (raw: string | null) => { try { const value = JSON.parse(raw || "null")?.updated; return typeof value === "number" && Number.isFinite(value) && value <= Date.now() + 60000 ? value : -Infinity; } catch { return -Infinity; } };
      return updated(second) > updated(first) ? second : first ?? second;
    },
    setItem(key, value) {
      // A quota failure may leave an older primary copy behind. Give successive
      // snapshots a monotonic timestamp even when two edits share a millisecond.
      let stored = value;
      try {
        const next = JSON.parse(value);
        if (typeof next.updated === "number" && Number.isFinite(next.updated)) {
          let newest = next.updated - 1;
          for (const storage of [primary, fallback]) {
            try {
              const previous = JSON.parse(storage.getItem(key) || "null")?.updated;
              if (typeof previous === "number" && Number.isFinite(previous) && previous <= next.updated + 60000) newest = Math.max(newest, previous);
            } catch { /* One unavailable store cannot prevent a save to the other. */ }
          }
          stored = JSON.stringify({ ...next, updated: Math.max(next.updated, newest + 1) });
        }
      } catch { /* Storage still accepts non-JSON callers unchanged. */ }
      let firstSaved = false, secondSaved = false;
      try { primary.setItem(key, stored); firstSaved = true; } catch { /* Fall back to session storage. */ }
      try { fallback.setItem(key, stored); secondSaved = true; } catch { /* The primary may still be durable. */ }
      if (!firstSaved && !secondSaved) throw new Error("Draft storage is unavailable");
      if (firstSaved && !secondSaved) { try { fallback.removeItem(key); } catch { /* Newest timestamp wins if an old copy cannot be removed. */ } }
      if (secondSaved && !firstSaved) { try { primary.removeItem(key); } catch { /* Newest timestamp wins if an old copy cannot be removed. */ } }
    },
    removeItem(key) {
      try { primary.removeItem(key); } catch { /* Remove from the other store too. */ }
      try { fallback.removeItem(key); } catch { /* Best effort when both stores are blocked. */ }
    },
  };
}
export function browserDraftStorage(): DraftStorage | null {
  let primary: DraftStorage | null = null;
  let fallback: DraftStorage | null = null;
  try { primary = window.localStorage; } catch { /* Private mode can block this store. */ }
  try { fallback = window.sessionStorage; } catch { /* The caller will use the memory-only guard. */ }
  return fallbackDraftStorage(primary, fallback);
}
export function captionDraftKey(owner: string, plan: number, uid: string, outlet: string): string {
  return CAPTION_PREFIX + [owner, String(plan), uid, outlet].map(encodeURIComponent).join(":");
}
export function quickPostDraftKey(owner: string, plan?: number): string {
  return QUICK_PREFIX + [owner, plan === undefined ? "unplanned" : String(plan)].map(encodeURIComponent).join(":");
}
export function quickPostRequest(draft: Pick<QuickPostDraftValue, "text" | "destination" | "language" | "requestId" | "pending">, newId: () => string) {
  const pending = draft.pending ?? {
    client_ref: draft.requestId || newId(),
    text: draft.text,
    destination: draft.destination,
    content_language: draft.language,
  };
  return { requestId: pending.client_ref, pending };
}
export function forgetCaptionDraft(storage: DraftStorage | null, key: string) {
  memory.delete(key);
  quickMemory.delete(key);
  try { storage?.removeItem(key); } catch { /* A blocked store must not break editing. */ }
}
export function readCaptionDraft(storage: DraftStorage | null, key: string, saved: string, now = Date.now()): CaptionDraft | null {
  let candidate: unknown;
  let foundStorage = false;
  try { const raw = storage?.getItem(key); if (raw) { candidate = JSON.parse(raw); foundStorage = true; } } catch { /* Memory remains available. */ }
  if (!foundStorage) candidate = memory.get(key);
  const value = candidate as CaptionDraft | undefined;
  if (!value || value.version !== 1 || typeof value.text !== "string" || typeof value.base !== "string" || value.text.length > 12000 || value.base.length > 12000 || !Number.isFinite(value.updated) || value.updated > now + 60000 || now - value.updated > TTL || value.text === saved) {
    forgetCaptionDraft(storage, key); return null;
  }
  memory.set(key, value);
  return value;
}
export function readQuickPostDraft(storage: DraftStorage | null, key: string, now = Date.now()): QuickPostDraftValue | null {
  let candidate: unknown;
  let foundStorage = false;
  try { const raw = storage?.getItem(key); if (raw) { candidate = JSON.parse(raw); foundStorage = true; } } catch { /* Memory remains available. */ }
  if (!foundStorage) candidate = quickMemory.get(key);
  const value = candidate as QuickPostDraftValue | undefined;
  const validPending = value?.pending === null || (value?.pending && typeof value.pending.client_ref === "string" && typeof value.pending.text === "string" && destinations.includes(value.pending.destination) && languages.includes(value.pending.content_language));
  if (!value || value.version !== 1 || typeof value.text !== "string" || value.text.length > 4000 || !destinations.includes(value.destination) || !languages.includes(value.language) || typeof value.changedLanguage !== "boolean" || typeof value.requestId !== "string" || !validPending || !Number.isFinite(value.updated) || value.updated > now + 60000 || now - value.updated > TTL) {
    forgetCaptionDraft(storage, key); return null;
  }
  quickMemory.set(key, value);
  return value;
}
export function writeQuickPostDraft(storage: DraftStorage | null, key: string, draft: Omit<QuickPostDraftValue, "version" | "updated">, now = Date.now()): boolean {
  if (!draft.text && !draft.pending) { forgetCaptionDraft(storage, key); return true; }
  const value: QuickPostDraftValue = { ...draft, version: 1, updated: now };
  quickMemory.set(key, value);
  if (quickMemory.size > 32) quickMemory.delete(quickMemory.keys().next().value!);
  try { if (!storage) return false; storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
/** False means memory-only: the UI then protects navigation/refresh. */
export function writeCaptionDraft(storage: DraftStorage | null, key: string, base: string, text: string, now = Date.now()): boolean {
  if (text === base) { forgetCaptionDraft(storage, key); return true; }
  const value: CaptionDraft = { version: 1, base, text, updated: now };
  memory.set(key, value);
  // Bound fallback memory even if a tab is used for months.
  if (memory.size > 64) memory.delete(memory.keys().next().value!);
  try { if (!storage) return false; storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
/** Rebase only after the owner explicitly keeps local wording; reload means discard. */
export function resolveCaptionDraftConflict(draft: CaptionDraft, latestSaved: string, choice: "keep" | "reload", now = Date.now()): CaptionDraft | null {
  return choice === "reload" ? null : { ...draft, base: latestSaved, updated: now };
}
export function clearCaptionDrafts() {
  memory.clear();
  quickMemory.clear();
  for (const candidate of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = candidate();
      for (const key of Object.keys(storage)) if (key.startsWith(CAPTION_PREFIX) || key.startsWith(QUICK_PREFIX)) storage.removeItem(key);
    } catch { /* Sign-out remains available if a browser store is blocked. */ }
  }
}
