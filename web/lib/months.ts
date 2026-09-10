export const GREGORIAN_MONTHS = [
  { number: 1, en: "January", he: "ינואר" },
  { number: 2, en: "February", he: "פברואר" },
  { number: 3, en: "March", he: "מרץ" },
  { number: 4, en: "April", he: "אפריל" },
  { number: 5, en: "May", he: "מאי" },
  { number: 6, en: "June", he: "יוני" },
  { number: 7, en: "July", he: "יולי" },
  { number: 8, en: "August", he: "אוגוסט" },
  { number: 9, en: "September", he: "ספטמבר" },
  { number: 10, en: "October", he: "אוקטובר" },
  { number: 11, en: "November", he: "נובמבר" },
  { number: 12, en: "December", he: "דצמבר" },
] as const;

export const WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

export function monthLabel(year: number, month: number) {
  const info = GREGORIAN_MONTHS[month - 1];
  return `${info.he} ${year}`;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
