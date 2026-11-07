# Guided connections and independent Search Console

Implementation/recovery review for #203, #205, #178 and the TikTok part of #161.
Branch `codex/integration-recovery` preserves the current campaign/recovery branch and
brings forward the existing #200/#204 work. This document does not certify deployment,
public provider approval or a fresh real-provider read.

## Customer behavior

- On a phone, six compact choices show each connection's status. One selected connection
  is visible at a time. Desktop retains the multi-card view. Changing the selected card
  does not disconnect or clear another source.
- Cards distinguish permission, account/site selection and actual data reads. A completed
  consent return never says data was received. Empty successful reads are distinct from
  failures and unknown measurements.
- Direct connection links preserve the provider through sign-in. Desktop scrolls to the
  requested card after it has loaded; phone keeps the connection picker available above it.
- Onboarding uses the actual next action, including missing-site/account selection and
  renewal, rather than asking for consent again after it was granted.
- Public website URLs are research inputs, not account permission or verified analytics.

## Google sources

Analytics requests `analytics.readonly` plus identity. Search Console requests
`webmasters.readonly` plus identity, through `/integrations/search-console/start`.
Both reuse the existing registered `/integrations/ga4/callback`; signed state routes the
return to the correct source. No new administrative permissions or callback registration
are needed. Both consent flows bind the browser, owner, business, session and one-use
attempt; newer attempts and disconnects supersede old returns. The chosen language returns
with the flow.

Search Console has an independent encrypted Integration row, permission state, matching
site list, selection and dated data. It can work without an Analytics property. Only
authorized sites covering the saved business website are selectable; URL-prefix properties
must cover its scheme, host and path. No parent/child-host substitution, domain verification
or website installation is performed.

The source uses read-only [Sites/list](https://developers.google.com/webmaster-tools/v1/sites/list)
and [Search Analytics/query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
The query window covers 28 inclusive days, ending three days ago, with final data and up
to 100 query rows. A page filter confines broader properties to the saved business URL;
stored results remain bound to that original website. Website/grant changes invalidate
keyword caches. Rows/limits and original read dates stay attached to the response.
Clicks are search-result clicks, not Analytics sessions, customers or sales. Search data
feeds the existing promotion keyword findings and the research/plan input chain.

Legacy combined Google grants are copied once into their own Search Console record,
without assuming a successful read. Reconnecting or removing one source does not remove
the other's local grant/data. Search Console disconnect leaves a credential-free marker
so the old combined grant cannot silently reconnect it. Google remote revocation is not
called for a single source because it would revoke the same account/client's Analytics
grant as well. Owners can remove the entire Google app grant in Google account settings.

Failures retain successful data with its original date. Partial scopes, missing sites,
empty successful queries, expiry and transient read failure have different recovery states.
Late provider responses cannot restore a disconnected source or replace a newer selection.

## Verified locally

- API suite: isolated SQLite, mocked provider transports and model calls disabled. Covers
  consent, first reads, partial scope, wrong account/site, empty/zero data, expiry, retry,
  replay, wrong owner, tenant isolation, disconnect and in-flight recovery races.
- TikTok's existing lifecycle suite covers account confirmation, public-video counts,
  refresh rotation, stale reads and local-first disconnect when remote revoke fails.
- Actual application browser checks used an isolated disposable QA server with synthetic
  provider responses. Search Console consent → selection → first read and TikTok consent
  → account confirmation → empty successful read were exercised through the customer UI.
- Phone checks at 390px in HE/EN/AR/RU: six choices, one visible connection panel, no
  horizontal overflow. Ready, empty, expired-access and temporary-failure states checked;
  business search phrases retained their original language. Desktop keeps all connection
  cards and the requested card visible. Screenshots and raw QA observations stay local.
- Typecheck, lint, build, connection/resume tests and four-language checks are release
  checks. Catalog updates use reviewed text; no customer data is sent for translation.

## Genuine-provider gates remain open

The last recorded genuine first reads are on #178 (17 October): Google Analytics,
Search Console, and an allowlisted TikTok sandbox profile. They do not verify this branch.
Fresh grant/read/refresh/revoke/reconnect evidence is still required for the reviewed
revision and owner-authorized test identities. Google public verification (#42), Meta
approval (#41) and the paused Facebook-manager login recovery (#104) are separate gates.
TikTok stays off or explicitly sandbox-allowlisted until its public review and live
lifecycle checks are complete. No ads, publishing, fake conversion events or customer
tracking installation are part of these read-only checks. Claude's customer-facing design
pass and deployment verification remain required; none of these issues is Done yet.
