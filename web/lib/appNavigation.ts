/** One logical order, read top-to-bottom or from the locale's inline start. */
export const APP_TABS = [
  { href: "/dashboard", label: "השבוע", icon: "home", owns: ["/dashboard"] },
  { href: "/campaign", label: "קמפיין", icon: "campaign", owns: ["/campaign", "/posts", "/assets", "/featured", "/voice"] },
  { href: "/strategy", label: "תוכנית", icon: "plan", owns: ["/strategy", "/plan", "/decisions", "/calendar", "/promotion", "/instagram", "/baseline"] },
  { href: "/performance", label: "תוצאות", icon: "results", owns: ["/performance", "/recommendations"] },
] as const;

const utilities = ["/business", "/brand", "/integrations", "/account", "/billing", "/help", "/support", "/updates", "/onboarding", "/prepare"];
export function underAppRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}
export function appTabFor(pathname: string) {
  return APP_TABS.find(tab => tab.owns.some(route => underAppRoute(pathname, route))) ?? null;
}
export function usesAppShell(pathname: string) {
  return Boolean(appTabFor(pathname)) || utilities.some(route => underAppRoute(pathname, route));
}
