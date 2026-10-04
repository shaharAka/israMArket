/**
 * The private beta (#98): the invite that reaches /beta, and where "להתחיל" takes it.
 *
 * An invitation link looks like `/beta?invite=<code>`. The page reads the code with
 * `readInvite` and passes it on to the start flow (`betaStartHref`), or, when the link has
 * no code, asks for one in a plain GET form to `START_PATH` with the field `INVITE_PARAM`.
 *
 * Until #103 (invite-only access) exists, nothing checks the code: the start flow is the
 * normal one and `?invite=` simply rides along in the address (StartFlow keeps unknown
 * query parameters). For #103 to plug in:
 * - read the code on /start (or at signup) with `readInvite(searchParams[INVITE_PARAM])`,
 *   and validate or revoke it on the API, never in the browser;
 * - keep it across the Google sign-in round trip, which returns to `/start?resume=save`
 *   without it;
 * - if a code should be checked before the flow starts, change `betaStartHref` and
 *   `START_PATH` only: the /beta page builds both of its actions from them.
 */

/** The query parameter that carries an invite from the invitation link onwards. */
export const INVITE_PARAM = "invite";

/** Where the beta's one action goes. */
export const START_PATH = "/start";

/** Codes are short and typed by hand: letters, digits, `-` and `_`, at most 64. */
const INVITE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The invite from a search parameter or a typed code, or null when there is no usable one. */
export function readInvite(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = (raw ?? "").trim();
  return INVITE_PATTERN.test(code) ? code : null;
}

/** "להתחיל" with an invite: the normal start flow, the code passed through. */
export function betaStartHref(invite: string | null): string {
  if (!invite) return START_PATH;
  return `${START_PATH}?${new URLSearchParams({ [INVITE_PARAM]: invite }).toString()}`;
}

/**
 * OPEN DECISIONS (owner) — the beta's promises, read by /beta and /beta/terms. Every line
 * below is a draft until Shahar approves it (docs/beta/invitation.md lists what to confirm).
 */

/** Days of email notice before the beta ends. The same 30 days /terms promises for any change. */
export const BETA_NOTICE_DAYS = 30;

/** About how long the weekly feedback takes. */
export const BETA_FEEDBACK_MINUTES = 15;
