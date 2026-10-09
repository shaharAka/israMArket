/** One browser context on phones/tablets; desktop may keep the workspace open. */
export function prefersFullPageConsent(matchMedia: (query: string) => { matches: boolean }): boolean {
  return matchMedia("(max-width: 767px)").matches || matchMedia("(pointer: coarse)").matches;
}
