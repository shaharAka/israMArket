const KEY = "isramarket.workspace";
let documentScope: string | null | undefined;

/** Freeze selection for this document so a switch can't redirect an in-flight save. */
export function workspaceScope(): string | null {
  if (typeof window === "undefined") return null;
  if (documentScope === undefined) {
    try {
      const saved = sessionStorage.getItem(KEY);
      documentScope = saved && /^[1-9][0-9]{0,15}$/.test(saved) ? saved : null;
    } catch {
      documentScope = null;
    }
  }
  return documentScope;
}

export function workspaceStorageKey(key: string): string {
  const workspace = workspaceScope();
  return workspace ? `${key}:workspace:${workspace}` : key;
}

export function openWorkspace(id: number | null, ready: boolean, locale: string) {
  if (id === null) sessionStorage.removeItem(KEY);
  else sessionStorage.setItem(KEY, String(id));
  // Clear React state, requests and the router cache when changing businesses.
  window.location.replace(`${ready ? "/dashboard" : "/start"}?lang=${encodeURIComponent(locale)}`);
}

export function clearWorkspace() {
  try { sessionStorage.removeItem(KEY); } catch { /* Browser storage unavailable. */ }
  documentScope = null;
}
