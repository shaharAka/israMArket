/**
 * "להמשיך עם Google": the browser leaves for Google through the API
 * (GET /auth/google/start, api/app/routers/auth.py) and comes back to `next` signed in, or
 * to `back` with `?google_error=<code>`.
 *
 * Always through the web tier's `/backend` proxy, never NEXT_PUBLIC_API_URL: the short-lived
 * PKCE cookie set at the start has to be on the same origin as the callback Google returns
 * to (`{WEB_ORIGIN}/backend/auth/google/callback`), and so does the session cookie.
 */
import { exitDemo } from "./api";

export function googleStartUrl(next: string, back: string): string {
  const params = new URLSearchParams({ next, back });
  return `/backend/auth/google/start?${params.toString()}`;
}

/** Leave for Google. The demo flag goes first: coming back signed in, it would win. */
export function continueWithGoogle(next: string, back: string) {
  exitDemo();
  window.location.assign(googleStartUrl(next, back));
}

const MESSAGES: Record<string, string> = {
  cancelled: "הכניסה עם Google בוטלה. אפשר לנסות שוב, או להמשיך עם אימייל וסיסמה.",
  denied: "Google לא אישר את הכניסה לחשבון הזה. נסו חשבון אחר, או אימייל וסיסמה.",
  misconfigured: "הכניסה עם Google עוד לא מוגדרת בשרת. בינתיים אפשר עם אימייל וסיסמה.",
  expired: "עבר יותר מדי זמן, או שהכניסה התחילה בדפדפן אחר. נסו שוב.",
  unverified: "כתובת האימייל בחשבון Google הזה לא מאומתת. אמתו אותה ב-Google, או הירשמו עם אימייל וסיסמה.",
  conflict: "האימייל הזה כבר מחובר לחשבון Google אחר. היכנסו עם החשבון ההוא, או עם אימייל וסיסמה.",
  failed: "לא הצלחנו להשלים את הכניסה עם Google. נסו שוב.",
  rate_limited: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.",
};

export function googleErrorMessage(code: string | null | undefined): string {
  if (!code) return "";
  return MESSAGES[code] ?? MESSAGES.failed;
}

/** The Hebrew sentence for `?google_error=` on the current URL, or "". Browser only. */
export function googleErrorFromLocation(): string {
  if (typeof window === "undefined") return "";
  return googleErrorMessage(new URLSearchParams(window.location.search).get("google_error"));
}
