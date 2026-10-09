/** The selected day follows the actual current date only in the current month. */
export function initialCalendarDay(year: number, month: number, today = new Date()): number {
  return year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : 1;
}

/** Horizontal keys follow the displayed grid direction; vertical keys remain weeks. */
export function calendarDayForKey(key: string, day: number, year: number, month: number, rtl: boolean): number | null {
  const weekday = new Date(year, month - 1, day).getDay();
  const next = key === "ArrowLeft" ? day + (rtl ? 1 : -1) : key === "ArrowRight" ? day + (rtl ? -1 : 1) : key === "ArrowDown" ? day + 7 : key === "ArrowUp" ? day - 7 : key === "Home" ? day - weekday : key === "End" ? day + 6 - weekday : null;
  return next === null ? null : Math.max(1, Math.min(new Date(year, month, 0).getDate(), next));
}
