/** Owner- and post-scoped interrupted work. Never a saved/approved post. */
export type CaptionDraft = { version: 1; base: string; text: string; updated: number };
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PREFIX = "isramarket:caption-draft:";
const TTL = 7 * 24 * 60 * 60 * 1000;
const memory = new Map<string, CaptionDraft>();
export function captionDraftKey(owner: string, plan: number, uid: string, outlet: string): string {
  return PREFIX + [owner, String(plan), uid, outlet].map(encodeURIComponent).join(":");
}
export function forgetCaptionDraft(storage: DraftStorage | null, key: string) {
  memory.delete(key);
  try { storage?.removeItem(key); } catch { /* A blocked store must not break editing. */ }
}
export function readCaptionDraft(storage: DraftStorage | null, key: string, saved: string, now = Date.now()): CaptionDraft | null {
  let candidate: unknown = memory.get(key);
  try { const raw = storage?.getItem(key); if (raw) candidate = JSON.parse(raw); } catch { /* Memory remains available. */ }
  const value = candidate as CaptionDraft | undefined;
  if (!value || value.version !== 1 || typeof value.text !== "string" || typeof value.base !== "string" || value.text.length > 12000 || value.base.length > 12000 || !Number.isFinite(value.updated) || value.updated > now + 60000 || now - value.updated > TTL || value.text === saved) {
    forgetCaptionDraft(storage, key); return null;
  }
  memory.set(key, value);
  return value;
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
export function clearCaptionDrafts() {
  memory.clear();
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key); } catch { /* Sign-out remains available. */ }
}
