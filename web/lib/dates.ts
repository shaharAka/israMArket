/**
 * Dates as the owner reads them: day.month, the year once at the end. One format for every
 * measured period (Connections, the finding card, Results), so the same range never reads
 * in two orders on two screens. Render the result inside a `<bdi>`: it is a run of digits
 * and dots inside Hebrew text.
 */

type Day = { day: number; month: number; year: number };

/** A date-only value ("2026-09-02") is a calendar day; a timestamp is read in local time. */
function dayOf(value?: string | null): Day | null {
  if (!value) return null;
  const plain = /^(\d{4})-(\d\d)-(\d\d)$/.exec(value);
  if (plain) return { year: Number(plain[1]), month: Number(plain[2]), day: Number(plain[3]) };
  // The API's timestamps are UTC, with or without the zone mark.
  const instant = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(instant.valueOf())) return null;
  return { year: instant.getFullYear(), month: instant.getMonth() + 1, day: instant.getDate() };
}

/** "2.9 עד 29.9.2026"; both years only when the range crosses one ("28.12.2025 עד 3.1.2026"). */
export function dateRange(start?: string | null, end?: string | null): string {
  const from = dayOf(start);
  const to = dayOf(end);
  if (!from || !to) return "";
  const head = from.year === to.year ? `${from.day}.${from.month}` : `${from.day}.${from.month}.${from.year}`;
  return `${head} עד ${to.day}.${to.month}.${to.year}`;
}

/** "5.9": a read date beside a range that already carries the year. */
export function dayMonth(value?: string | null): string {
  const date = dayOf(value);
  return date ? `${date.day}.${date.month}` : "";
}
