# Internal navigation — issue #229

Verified locally on 7 November 2026 with a disposable SQLite fixture, fictional populated
shop persona and local assets. No real provider connection, publication, paid generation,
customer data mutation or production deployment was performed.

## Result

- Desktop and mobile share four destinations in the same logical order: week, campaign,
  plan, results. Posts and their assets belong to campaign; calendar remains under plan.
- At 390 × 844 the header is 56px high, one language selector is visible and root content
  has no horizontal overflow. The gift has a visible label and retains its unread color.
- Switching Hebrew → English → Arabic → Russian retained selected week 3 and did not
  translate the fictional business's Hebrew content. The final compact plan label reuses
  the existing Plan / الخطة / План translations, avoiding the longer old mobile label.
- Campaign week 3 → actual post → editor return retained week 3, interface language and
  the actual post UID as the focused card.
- Create-own-post → type a Hebrew draft → leave → reopen retained the draft and week.
  Reload also restored the draft. No generation or save-to-server action was submitted.
- Calendar → select 2 November → open its post → reload editor → return opened calendar.
- A legacy populated `/posts?week=3&lang=he` entry resolved to campaign with week/language
  retained. Direct editors, recommendations, calendar and creation remain separate paths.
- The final captured tab had no captured browser console errors. This is local evidence,
  not a claim that production hydration or all platform flows have been verified.

## Automated checks

- 65 connection/route/continuity/navigation tests passed, including five new navigation
  ownership, compatibility and return tests.
- 15 campaign navigation/selection/manual-channel checks passed.
- Campaign recovery and caption draft/conflict/storage recovery checks passed.
- Typecheck, lint and four-language catalog validation passed: 9,848 messages per locale;
  synchronization made zero translation-provider calls.
- Production Next.js build passed, including prerendering.

## Captures and limits

`before-desktop.png` and `before-phone.png` show the original navigation. The final
implementation is `final-desktop-he.png` and `final-phone-he.png`. The other captures and
`phone-checks.json` record the intermediate multilingual test before the plan-label
shortening; they are not the final translation/label reference.

This is a bounded implementation and functional verification pass, not an independent
40/40 certification. Claude's design-lane review, reconciliation of shared files with
Claude's active front-page branch, exact-head CI, merge and deployed-path verification
remain release gates. The broader #227/#228/#231 recovery/provider gates remain open;
the deferred Tazizi reconnect is still deferred at the user's request.
