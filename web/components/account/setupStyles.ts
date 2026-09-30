/**
 * Class strings shared by the setup and account pages (/integrations, /account, /billing,
 * /baseline, and the forms they hold). DESIGN-STANDARD.md §3–4: fields are 46px with a
 * 10px radius, and focus is a primary border with a 3px soft ring instead of the app's
 * offset outline; cards are depth, not frames.
 */

/** A text input, select or textarea. Add a height or `resize` on textareas yourself. */
export const FIELD =
  "block min-h-[46px] w-full min-w-0 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3.5 py-2.5 text-[15px] leading-6 text-[color:var(--ink)] transition-[border-color,box-shadow] duration-200 ease-out hover:border-[var(--ink-faint)] focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_var(--primary-soft)] focus-visible:outline-none! disabled:cursor-not-allowed disabled:bg-[var(--soft)] disabled:text-[color:var(--ink-muted)]";

/** The label above a field. */
export const LABEL = "mb-2 block text-[13px] font-semibold text-[color:var(--ink)]";

/** A card: paper and a soft layered shadow, no border. */
export const CARD = "rounded-[16px] bg-[var(--paper)] shadow-[var(--shadow-card)]";

/** The quiet label that sits above a group of rows, outside its card. */
export const GROUP_LABEL = "mb-2.5 px-1 text-[13px] font-semibold text-[color:var(--ink-muted)]";

/** A row inside a card list: full width, hairlines come from the list's `divide-y`. */
export const LIST_ROW =
  "flex min-h-14 w-full items-center gap-4 px-4 py-3 text-start transition-colors duration-200 hover:bg-[var(--soft)] active:bg-[var(--primary-soft)] focus-visible:-outline-offset-2! sm:px-5";

/** The icon tile at the start of a row. */
export const ROW_ICON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--soft)] text-[color:var(--ink-soft)]";

/** The chevron at the end of a row: faint, and a step forward (leftward, RTL) on hover. Needs `group` on the row. */
export const ROW_CHEVRON =
  "h-5 w-5 shrink-0 text-[color:var(--ink-faint)] transition-[color,translate] duration-200 group-hover:-translate-x-0.5 group-hover:text-[color:var(--ink-muted)]";

/** A text action (DESIGN-STANDARD.md §4): primary, 600, underline only on hover. */
export const TEXT_ACTION =
  "inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--primary)] underline-offset-4 transition-colors hover:text-[color:var(--primary-dark)] hover:underline";
