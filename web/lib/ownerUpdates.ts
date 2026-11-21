/**
 * "מה חדש" for the owner (`/updates`): the last five changes an owner can use inside the
 * app, newest first, in plain Hebrew, each with a link to the screen where it lives.
 *
 * `lib/releases.ts` stays the full changelog (landing, infrastructure and internal notes).
 * Add an entry here only when an owner can try the change in their own account, keep at
 * most five, and link to an app route, never a landing anchor (`/#…`). Text budget
 * (DESIGN-STANDARD.md §6): a title and one line of at most two lines on a phone.
 */
export type OwnerUpdate = {
  id: string;
  /** Asia/Jerusalem calendar date. */
  date: string;
  title: string;
  summary: string;
  href: string;
  action: string;
};

export const OWNER_UPDATES: readonly OwnerUpdate[] = [
  {
    id: "2026-10-24-signal-campaign", date: "2026-10-24",
    title: "הקמפיין הוא מקום העבודה",
    summary: "מטרות החודש, התקציב המתוכנן והפוסטים של כל שבוע, בעמוד אחד.",
    href: "/campaign", action: "לפתוח את הקמפיין",
  },
  {
    id: "2026-10-24-research-creative-result-reveals", date: "2026-10-24",
    title: "רואים מתי תמונה או סרטון מוכנים",
    summary: "החומר החדש מופיע כשהוא מוכן. עד אז, הגרסה השמורה נשארת מולכם.",
    href: "/campaign", action: "לחומרי הקמפיין",
  },
  {
    id: "2026-10-11-outcome-based-findings", date: "2026-10-11",
    title: "בתוצאות: צעד אחד לנסות",
    summary: "פעולה אחת, המספרים שמאחוריה ואיך נבדוק אם היא הצליחה.",
    href: "/performance", action: "לראות את התוצאות",
  },
  {
    id: "2026-10-10-creative-brief-and-allowance", date: "2026-10-10",
    title: "ליד הפוסט: למי הוא מיועד",
    summary: "בעורך רואים את הקהל, המטרה ומה למדנו, וכמה תמונות AI נשארו.",
    href: "/posts", action: "לפתוח את הפוסטים",
  },
  {
    id: "2026-10-10-post-tracking-links", date: "2026-10-10",
    title: "קישור לוואטסאפ ליד כל פוסט",
    summary: "מכינים את הקישור ישר מפרסום הפוסט, כדי לדעת מאיזה פוסט הגיעו פניות.",
    href: "/posts", action: "לפתוח את הפוסטים",
  },
];

/** The newest owner update: the "unread" mark on the updates icon follows it. */
export const LATEST_OWNER_UPDATE = OWNER_UPDATES[0].id;
