/**
 * Company details the public pages (/security, the landing FAQ) need.
 *
 * OPEN DECISIONS (owner) — every value below is a placeholder until you set it:
 * - CONTACT_EMAIL: a real, monitored mailbox for privacy and deletion questions.
 * - HOSTING_NOTE: where the servers are. Not decided, so no country, region or provider is
 *   named anywhere. Keep it null until it is, then write one plain sentence.
 * - BACKUP_NOTE: whether backups exist and how long a deleted account's data can survive
 *   in them (DEPLOY.md asks for volume backups but sets no retention). Null = not stated.
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

/** PLACEHOLDER. Replace with the real address before launch. */
export const CONTACT_EMAIL = "privacy@isramarket.example";

/** Null until the owner decides where the data is hosted. */
export const HOSTING_NOTE: string | null =
  "השרתים והגיבויים נמצאים בגוגל קלאוד, באזור תל אביב (me-west1).";

/** Null until the owner sets a backup retention policy. */
// deploy/gcp/backup.sh + backup-lifecycle.json: nightly copy, objects deleted after 30 days.
export const BACKUP_NOTE: string | null =
  "כל לילה נשמר גיבוי. גיבוי נמחק אחרי 30 יום, כך שמידע של חשבון שנמחק נעלם גם מהגיבויים תוך 30 יום.";
