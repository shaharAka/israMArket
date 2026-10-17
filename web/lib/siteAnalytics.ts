/** IsraMarket's own website measurement. Never use customer Analytics credentials here. */
export const SITE_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-69V3DVX098";
export const CONSENT_COOKIE = "isramarket_analytics";
export const SIGNUP_COOKIE = "isramarket_signup_event";
const INTERNAL_KEY = "isramarket.analytics.internal";
const CHOICE_EVENT = "isramarket:analytics-choice";
type Choice = "granted" | "denied" | null;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean };
let lastPage = "";
let previousPage = "";
let initialized = false;
let memoryChoice: Choice = null;
let preferencesOpen = false;
export const analyticsPreferencesOpen = () => preferencesOpen;
export function openAnalyticsPreferences() { preferencesOpen = true; window.dispatchEvent(new Event(CHOICE_EVENT)); }
export function closeAnalyticsPreferences() { preferencesOpen = false; window.dispatchEvent(new Event(CHOICE_EVENT)); }

export function cookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  try { return document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || ""; }
  catch { return ""; }
}
export function analyticsChoice(): Choice {
  const value = cookieValue(CONSENT_COOKIE);
  return value === "granted" || value === "denied" ? value : memoryChoice;
}
function writeCookie(name: string, value: string, age: number, domain = "") {
  try { document.cookie = `${name}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`; }
  catch { /* Optional measurement cannot interrupt signup or navigation. */ }
}
export function pauseAnalytics() {
  if (typeof window !== "undefined") (window as unknown as AnalyticsWindow)[`ga-disable-${SITE_MEASUREMENT_ID}`] = true;
  lastPage = "";
}
export function chooseAnalytics(choice: Exclude<Choice, null>) {
  memoryChoice = choice;
  writeCookie(CONSENT_COOKIE, choice, 180 * 86400);
  if (choice === "denied") {
    pauseAnalytics();
    let cookies = "";
    try { cookies = document.cookie; } catch { /* Cookie access may be blocked. Measurement is already disabled. */ }
    for (const part of cookies.split(";")) {
      const name = part.trim().split("=")[0];
      if (name === "_ga" || name.startsWith("_ga_")) {
        for (const domain of ["", location.hostname, ".isramarket.co.il"]) writeCookie(name, "", 0, domain);
      }
    }
    writeCookie(SIGNUP_COOKIE, "", 0);
  }
  try { localStorage.setItem("isramarket.analytics.choice-change", String(Date.now())); } catch { /* The current visit still works. */ }
  window.dispatchEvent(new Event(CHOICE_EVENT));
}
export function subscribeAnalytics(callback: () => void) {
  const changed = () => { if (analyticsChoice() !== "granted") pauseAnalytics(); callback(); };
  window.addEventListener(CHOICE_EVENT, changed);
  window.addEventListener("storage", changed);
  window.addEventListener("focus", changed);
  return () => { window.removeEventListener(CHOICE_EVENT, changed); window.removeEventListener("storage", changed); window.removeEventListener("focus", changed); };
}

/** Only fixed marketing paths. No business names, post IDs, auth codes or query strings. */
export function publicAnalyticsPath(path: string): string | null {
  return ["/", "/start", "/signup", "/login", "/security", "/terms"].includes(path)
    || /^\/for\/(products|services|saas|nonprofit)$/.test(path)
    || /^\/connections\/(google-analytics|facebook-instagram|ads-pixel|whatsapp|google-business|linkedin|tiktok)$/.test(path) ? path : null;
}
export function safeReferrer(referrer: string) {
  try { const url = new URL(referrer); return /^https?:$/.test(url.protocol) ? url.origin + "/" : ""; } catch { return ""; }
}
export function analyticsExcluded(allowLocalUi = false) {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_DRAFT_MOCK === "1") return true;
  const params = new URLSearchParams(location.search);
  try {
    if (params.get("internal") === "1") localStorage.setItem(INTERNAL_KEY, "1");
    if (params.get("internal") === "0") localStorage.removeItem(INTERNAL_KEY);
    if (localStorage.getItem(INTERNAL_KEY) === "1" || localStorage.getItem("isramarket_demo") === "1") return true;
  } catch { /* Still apply host, route, consent and bot guards. */ }
  return (location.hostname !== "www.isramarket.co.il" && !(allowLocalUi && ["localhost", "127.0.0.1"].includes(location.hostname))) || params.has("mock") || params.has("review_step")
    || params.has("composition") || params.has("demo") || params.get("phase") === "after"
    || /bot|crawler|spider|headless|lighthouse|preview/i.test(navigator.userAgent);
}
function begin(path: string) {
  try {
    if (!/^G-[A-Z0-9]+$/.test(SITE_MEASUREMENT_ID) || analyticsExcluded() || analyticsChoice() !== "granted") { pauseAnalytics(); return false; }
    const w = window as unknown as AnalyticsWindow;
    w[`ga-disable-${SITE_MEASUREMENT_ID}`] = false;
    w.dataLayer ||= [];
    // Google's command queue expects Arguments objects, as in its standard snippet.
    // eslint-disable-next-line prefer-rest-params
    w.gtag ||= function () { w.dataLayer!.push(arguments); };
    if (!initialized) {
      w.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      w.gtag("js", new Date());
      initialized = true;
    }
    w.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    // These overrides also cover automatic session/engagement metadata. Enhanced
    // measurement must stay OFF on this stream (including history/form tracking).
    w.gtag("set", { page_location: `https://www.isramarket.co.il${path}`, page_referrer: previousPage || safeReferrer(document.referrer), page_title: "IsraMarket", allow_google_signals: false, allow_ad_personalization_signals: false });
    w.gtag("config", SITE_MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 180 * 86400, cookie_domain: "www.isramarket.co.il" });
    if (!document.getElementById("isramarket-ga")) {
      const script = document.createElement("script"); script.id = "isramarket-ga"; script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${SITE_MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }
    return true;
  } catch { pauseAnalytics(); return false; }
}
function parameters(path: string) {
  const locale = document.documentElement.lang;
  return { page_location: `https://www.isramarket.co.il${path}`, page_referrer: previousPage || safeReferrer(document.referrer), page_title: "IsraMarket", ...( ["he", "en", "ar", "ru"].includes(locale) ? { language: locale } : {}), ...(new URLSearchParams(location.search).get("analytics_test") === "1" ? { debug_mode: true, traffic_type: "internal" } : {}) };
}
export function trackWebsitePage(pathname: string) {
  const path = publicAnalyticsPath(pathname);
  if (!path || !begin(path)) { pauseAnalytics(); return; }
  if (lastPage === path) return;
  (window as unknown as AnalyticsWindow).gtag!("event", "page_view", parameters(path));
  previousPage = `https://www.isramarket.co.il${path}`; lastPage = path;
}
export function trackInterviewStart() {
  if (location.pathname !== "/start" || !begin("/start")) return;
  try { if (sessionStorage.getItem("isramarket.analytics.interview")) return; sessionStorage.setItem("isramarket.analytics.interview", "1"); } catch { return; }
  (window as unknown as AnalyticsWindow).gtag!("event", "begin_interview", parameters("/start"));
}
/** Server marks actual new accounts only; a login or failed signup never counts. */
export function consumeSignupEvent() {
  const method = cookieValue(SIGNUP_COOKIE);
  if (method !== "email" && method !== "google") return;
  writeCookie(SIGNUP_COOKIE, "", 0);
  if (!begin("/signup")) return;
  const privatePage = !publicAnalyticsPath(location.pathname);
  (window as unknown as AnalyticsWindow).gtag!("event", "sign_up", { ...parameters("/signup"), method, ...(privatePage ? { event_callback: pauseAnalytics } : {}) });
  if (privatePage) window.setTimeout(pauseAnalytics, 2000);
}
