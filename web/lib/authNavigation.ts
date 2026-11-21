/** Sign-in may return only to a local page, never the API or another auth form. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://isramarket.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== "https://isramarket.invalid" || decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return null;
    const path = new URL(decoded, url.origin).pathname;
    if (["/backend", "/login", "/signup", "/reset"].some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

/** Keep an explicit destination language; otherwise keep the current interface choice. */
export function withInterfaceLanguage(path: string, locale: string): string {
  const url = new URL(path, "https://isramarket.invalid");
  if (!url.searchParams.has("lang")) url.searchParams.set("lang", locale);
  return url.pathname + url.search + url.hash;
}

export function signInUrl(returnPath: string, locale: string): string {
  const next = withInterfaceLanguage(safeReturnPath(returnPath) ?? "/dashboard", locale);
  // A fast 401 can arrive before the interface language has finished mounting.
  const explicit = new URL(next, "https://isramarket.invalid").searchParams.get("lang");
  const language = explicit && ["he", "en", "ar", "ru"].includes(explicit) ? explicit : locale;
  return `/login?${new URLSearchParams({ next, lang: language })}`;
}

export function signInDestination(requested: string | null, business: { onboarding_complete?: boolean; quarter_plan?: unknown } | null, locale: string): string {
  // Every destination checks its own access/setup requirements. Support must remain
  // reachable even before a business exists; no API read is required to return there.
  return withInterfaceLanguage(safeReturnPath(requested) ?? (!business ? "/start" : business.onboarding_complete || business.quarter_plan ? "/dashboard" : "/onboarding"), locale);
}
