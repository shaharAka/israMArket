/** A fictional November 2026 campaign. Visits are tagged sessions in GA4. */
export const campaignWeek = [
  { day: 8, title: "פותחים הרשמה", platform: "Facebook", image: "/showcase/dyo-tari/feed.webp", position: "center 40%" },
  { day: 10, title: "הצצה לסדנה", platform: "Instagram", image: "/showcase/campaign-cuts/printmaker.webp", position: "center 46%" },
  { day: 12, title: "מזכירים בסטורי", platform: "Instagram", image: "/showcase/dyo-tari/story-offer.webp", position: "center 55%" },
] as const;

export const campaignVisits = [
  { channel: "Instagram", earlier: 12, later: 28 },
  { channel: "Facebook", earlier: 10, later: 11 },
] as const;

export function formatNovember(locale: string, day: number, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(Date.UTC(2026, 10, day));
}
