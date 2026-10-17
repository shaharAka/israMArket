# IsraMarket website measurement

Tracking task: [#211](https://github.com/shaharAka/israMArket/issues/211).
This measures IsraMarket's public website. Customer Analytics connectors read a
customer's property and remain a separate feature.

## Owned configuration

The dedicated **IsraMarket website** GA4 property belongs to the support-owned
IsraMarket Analytics account. Its **IsraMarket public website** web stream uses
public measurement ID `G-69V3DVX098`, URL `https://www.isramarket.co.il`, Israel
timezone and ILS reporting. Optional account data sharing and enhanced measurement
are off. Keep enhanced measurement off: automatic form/history collection could
send data outside the explicit event allowlist.

`web/lib/siteAnalytics.ts` loads Google's standard command queue and script only
after a visitor agrees. Before a choice, after refusal, on localhost, on private
app/design/demo routes, and for an excluded internal browser, it loads no tag and
sends no events. Advertising consent, Google signals and ad personalization stay
off. Public paths, titles and referrers are sanitized; query strings, account IDs,
business answers and content are never event parameters.

The four-language choice offers equally styled allow/refuse controls. Preferences
can be reopened at `/security#website-analytics`. The first-party choice and Google
cookies last up to 180 days. Withdrawal disables further measurement and removes
browser GA cookies without touching the login session. It does not remove events
already received by Google.

## Events and interpretation

- `page_view`: allowlisted public paths, once per actual route transition.
- `begin_interview`: the first real pre-signup interview answer update per browser
  session; no question or answer content accompanies the event.
- `sign_up`: an actual new email/Google account, after the server commits it. A
  short-lived non-identifying receipt contains only `email` or `google` and is
  consumed once. Returning logins and failed registrations do not count.

These are consented browser events, not an audit ledger. Blocking extensions,
network loss, refusal and the short receipt lifetime can reduce counts. Google
cannot reconstruct visits from before installation. Automatic events such as
session starts/engagement may accompany the explicit events; do not equate them
with different visitors or signups. Internal/bot exclusions are useful controls,
not a guarantee that every remaining visitor is a new human customer.

## Owner and QA use

Bookmark `https://www.isramarket.co.il/?internal=1` in each owner/test browser
profile to persistently exclude its activity. `?internal=0` clears that local
exclusion. The setting is browser-local and does not exclude other people.

For a deliberate Google receipt test, use `?internal=0&analytics_test=1` and agree
through the normal UI. The explicit test events carry `debug_mode: true` and
`traffic_type: internal`; inspect them in DebugView/Realtime and distinguish them
from outside traction. Restore `?internal=1` afterward. Never create production
accounts simply to manufacture signup conversion evidence.

Local regression coverage: `node web/scripts/test-site-analytics.mjs`; API tests
cover consented new signup receipts, existing users and duplicate registrations.
Browser QA covers refusal/reload, settings/withdrawal, local host exclusion, and
all four languages at a 390px mobile viewport. Deployment is complete only after
recording the exact deployed revision and actual Google event receipt in #211.

Primary references: [Google tag installation](https://developers.google.com/tag-platform/gtagjs),
[basic consent mode](https://developers.google.com/tag-platform/security/guides/consent),
[recommended signup event](https://support.google.com/analytics/answer/9267735).
