/**
 * Company details the public pages (/security, the landing FAQ) need.
 *
 * OPEN DECISIONS (owner) — every value below is a placeholder until you set it:
 * - CONTACT_EMAIL: a real, monitored mailbox for privacy and deletion questions.
 * - HOSTING_NOTE: where the servers are. Not decided, so no country, region or provider is
 *   named anywhere. Keep it null until it is, then write one plain sentence.
 * - BACKUP_NOTE: the deployed backup deletion and recovery policy, checked against GCP.
 */

/**
 * OPEN (owner): set to true only after confirming the Google Cloud project behind
 * GEMINI_API_KEY has billing enabled, i.e. the key is on Google's *Paid Services*.
 * Only then does /security say that Google does not use the prompts to improve its
 * products. The code cannot tell which tier a key is on.
 *
 * Source: Gemini API Additional Terms of Service, https://ai.google.dev/gemini-api/terms
 * (last modified April 28, 2026), section "How Google Uses Your Data":
 * - Paid Services: Google doesn't use prompts (incl. system instructions, cached content
 *   and files) or responses to improve its products; it logs prompts and responses for a
 *   limited period, solely to detect and prevent violations of the Prohibited Use Policy.
 * - Unpaid Services: content and responses are used to provide, improve and develop
 *   Google products, and human reviewers may read them.
 */
// Confirmed by the owner 2026-09-30: the key is on a paid (prepaid billing) account.
export const GEMINI_PAID_TIER = true;

/** The owner's address for now (2026-09-30); a dedicated mailbox comes with the domain. */
export const CONTACT_EMAIL = "shaharro@gmail.com";

/** Null until the owner decides where the data is hosted. */
export const HOSTING_NOTE: string | null =
  "השרתים והגיבויים נמצאים בגוגל קלאוד, באזור תל אביב (me-west1).";

/** Verified 2026-10-03: 30-day lifecycle rule, plus 7 days of cloud soft-delete recovery. */
// Local snapshots also expire by age. Cloud lifecycle execution is automatic;
// its age condition alone is not a guaranteed permanent-deletion deadline.
export const BACKUP_NOTE: string | null =
  "כל לילה נשמר גיבוי. הגיבויים מיועדים למחיקה אחרי 30 יום. אחרי המחיקה בגוגל קלאוד אפשר לשחזר אותם במשך 7 ימים נוספים. המחיקה מתבצעת אוטומטית, בהתאם לזמני העיבוד של גוגל.";

export const BACKUP_NOTE_EN =
  "Backups are scheduled for deletion after 30 days. Deleted cloud backups remain recoverable for 7 additional days before permanent deletion. Automatic deletion is subject to Google's processing time.";
