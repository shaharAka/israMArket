# Meta measurement and customer approval plan — updated 2 October 2026

## Facebook Page post reader — 9 October 2026

PR #173 adds a separate Page post reader, gated on the selected owner's existing
`pages_read_engagement` and `read_insights` grants and current Page ANALYZE task.
The app's OAuth request does **not** yet ask for `read_insights`: add it to the public
review scope and genuine permission-specific pilot evidence before enabling that request.
Implementation, app approval and successful customer consent/read are separate gates.

The reader uses the selected Page token, reads at most 100 recent published posts,
and retains up to 200 post records on owner-scoped snapshots. It requests
`post_total_media_view_unique` (people) and `post_media_view` (views), accepting only
returned lifetime scalar counts. Retired impressions metrics are not requested.
Individual successful counts retain their own capture dates after partial failure.
Exact Facebook links match Page/post identities; Instagram or caption similarity
cannot supply a Facebook result. Different lifetime exposure ages do not produce
winner badges or post-writer comparisons. Analysis receives individual post counts,
not a sum of overlapping unique audiences.

Primary references checked in-browser on 9 October:
[Page Insights](https://developers.facebook.com/documentation/pages-api/platforminsights/page),
[retired metrics and replacements](https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics).
Public approvals and live-read proof remain in #41/#104; offline tests do not satisfy them.

## Customer rollout and console progress — 2 October 2026

Tazizi is one pilot customer. Every business uses its own encrypted Meta grant,
authorised Page/ad account/Pixel choices, website and verification result. There is no
global customer Pixel or app-admin token fallback. Three additional two-customer
regressions prove separate asset lists, reject cross-customer selection/reads, use each
customer's token and website for verification, isolate cached Pixel lists, and preserve
the first customer's connection when the second disconnects.

The customer setup now offers short, collapsed instructions for Wix, Shopify,
WordPress/WooCommerce and other website systems. Existing Pixels are reused, and the
customer can refresh their authorised list after website installation. The verification
screen identifies the selected Pixel and the business website being checked. The current
route discovers Pixels through an authorised ad account; a customer with a standalone
dataset must arrange account association/access in Meta before it can appear here.
Selecting a Pixel does not install it, and missing Pixel access does not block the plan.

Official installation references checked on 2 October:
- [Wix Meta Pixel & CAPI](https://support.wix.com/en/article/connecting-a-facebook-pixel-and-the-conversions-api-to-your-wix-site)
- [Shopify Meta Pixel](https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/meta-pixel)
- [Meta pixel for WordPress, published by Facebook](https://wordpress.org/plugins/official-facebook-pixel/)

After the owner completed Facebook sign-in, the Meta app console was accessible:
- Saved `https://34-165-93-157.sslip.io/data-deletion` as the **Data deletion instructions
  URL**, then reloaded the form and confirmed it persisted. It replaces an unrelated
  Facebook homepage value. This remains an instructions page, not a deletion callback.
- Added the Website platform with `https://34-165-93-157.sslip.io/` and uploaded a
  transparent 1024px PNG export of the existing blue storefront/sun brand mark.
  Reload confirmed both settings persisted and the missing-icon eligibility notice
  disappeared. Saved the Web testing walkthrough with the live login URL and explicitly
  pending reviewer credentials, demonstration assets, API tests and screencasts.
  This is a truthful draft, not proof that reviewers can yet exercise all permissions.
- Identified IsraMarket as a **Tech Provider**. The dashboard now exposes Review →
  Testing, Verification and App Review. Identification is not access-verification approval.
- Added the **Create & manage ads with Marketing API** use case. Its permissions table
  shows `ads_read` **Ready for testing**, API calls **0**, and Marketing API Access Tier
  **Limited access**. No public approval is inferred. The console also offers write
  permissions; our application still requests only the four social scopes and optional
  `ads_read`, and does not manage ads or send conversion events.
- Verification requires an attached business portfolio. Attempting to create one still
  returns **“You've reached the limit of Meta Business Suite accounts that you can
  create.”** No unrelated portfolio was connected, renamed or deleted. A valid IsraMarket
  portfolio and the owner's actual entity details are still required to proceed.
- Narrowed the unsubmitted App Review draft from 28 requests to the five application
  permissions (`pages_show_list`, `pages_read_engagement`, `instagram_basic`,
  `instagram_manage_insights`, `ads_read`), the automatic `public_profile` permission,
  and Marketing API Access Tier. Removed 21 unused requests from the draft, including
  messaging, publishing, ad management and alternative Instagram Login permissions.
  This does not revoke existing grants or remove features from the app. Meta's form
  still requires complete permission evidence, actual screencasts/API tests,
  reviewer access, data-handling answers and business/access verification.
- Saved partial allowed-usage explanations for the five application permissions and
  Marketing API Access Tier. The Page-list explanation was reopened and confirmed
  persisted. For `ads_read`, selected the custom dashboards/data analytics use, not
  sending web events. No permission agreement checkbox was accepted and no review was
  submitted; real recordings and test evidence remain missing.
- The current console requires one successful test API call for `ads_read`,
  `pages_read_engagement`, `instagram_manage_insights` and `instagram_basic` (all show
  0 of 1). Marketing API Access Tier shows 0 of 500 required calls, with at least 85%
  success. These need genuine authorised pilot activity, not fabricated calls or
  labelled demo receipts presented as real measurements.
- Data handling correctly declares that processors/service providers have access:
  Google Cloud hosts the service and Gemini receives selected Meta report context in
  `diagnostics.py`. Processor countries are not assumed to be Israel merely because
  the VM is in Tel Aviv: Gemini's API-key client has no regional endpoint configured.
  Confirm the actual provider contracts, processing locations and paid Gemini project
  before completing that list. The controller identity, authority-disclosure history
  and existing request-handling procedures await the owner's factual answers.

Local validation: all 30 Meta measurement/connection tests, web typecheck, lint and
production build passed. Browser checks cover all four installation guides, refreshing
the Pixel list, skipping a Pixel and returning to select it, verification identity/site,
keyboard Escape and a 390px dialog without horizontal overflow. UI checks use explicitly
labelled demo fixtures; they do not prove that a real Meta grant can read Pixel stats.

Owner requested ads reporting, Pixel verification and a simple customer connection. This
explicitly authorises the API and flow changes in this delivery; it is a scoped exception
to the earlier Codex visuals / Claude behaviour division. Landing and Google flows are
preserved. The console changes above affect the app and its review draft; no customer's
consent or business assets were changed. No ads are created, budgets changed, or
conversion events submitted.

## What the customer does

1. In Connections, choose **Connect Meta**. We explain that the data improves their plan.
   Ad data is optional. Meta's own consent opens in a separate secure window; no iframe,
   API key, developer account or manually copied account ID is required.
2. Back in IsraMarket, select a named Facebook Page and/or ad account from the assets
   this customer's token actually authorised. Instagram is derived from the Page. Select
   the Pixel offered by that ad account if available. Confirm the business names.
3. Continue to Results. If a Pixel was selected, check receipt and site matching here.
   A missing account, declined permission or uninstalled Pixel never blocks using the
   plan. Reconnect with the manager account or use the website platform's native Meta
   installer, then return to check. The selected measurement can be revisited later.

The current Facebook Login route requires a professional Instagram account linked to a
Page. Direct Instagram Login (professional account without a Page) remains a separate
future connection; it is not part of this release. No claim that every user can connect
before Advanced Access is approved. App roles are for development testers, not a workaround
for onboarding paying customers.

## What is implemented

- Browser-bound, authenticated OAuth state with expiry, nonce cookie and callback owner
  checks; same-origin/window-checked popup return, same-window fallback if popup blocked.
  A returned grant must match this connection attempt; a closed/severed popup is not
  taken as proof of approval.
- Optional `ads_read` plus social measurement scopes. Not requested: `ads_management`,
  publishing, messaging, `business_management`, `pages_read_user_content`.
- Cursor pagination for Pages, ad accounts, Pixels and reports; truncation is a failure,
  not a complete result. Membership validation on selections, Instagram association from
  Meta, encrypted user and Page credentials. No credentials returned to the frontend.
- Account totals and campaign-level Insights: spend, currency, reach, impressions, link
  clicks, website purchases/value and leads where Meta returns them. Account reach is
  not summed across campaigns. Purchase aliases are not added together.
- Explicit attribution: 7-day click / 1-day view, conversion report time. Meta-attributed
  purchases are not verified paid orders and are not added to Google's conversion count.
  Missing fields remain unknown. Today may be incomplete. Currency belongs to the account.
- Pixel metadata and previous 48-hour event/host evidence. `receiving` requires recent
  `last_fired_time` and matching website hostname. Unknown host access, wrong domain,
  no recent events and permission failures have different recovery messages.
- Receipt is not a certification of CAPI, purchase values/currency, deduplication or full
  purchase capture. Those checks remain unknown; no fake Purchase events are sent.
- Persist report/evidence in performance snapshots and pass them into diagnosis and weekly
  recommendation. Recommend a small creative/offer/landing-page test; never automatically
  change ad budgets. Show a plain-language summary with detail folded below it.

## Approval work, in order

1. **Own domain:** purchase a domain in Shahar's account and point it to the existing VM.
   Keep HTTPS. Switch homepage, `/security`, `/terms`, data-deletion instructions,
   OAuth callbacks and Google/Meta branding together; preserve the old callback through
   migration. Domain purchase itself is not approval. Google production branding requires
   ownership verification of associated domains.
2. **IsraMarket business:** resolve the personal account's portfolio-limit block. Use an
   actual IsraMarket entity/sole-trader record and its matching details, not AKA Foods or
   unrelated assets. Owner must confirm which legal entity represents IsraMarket and
   provide required evidence directly in Meta. No legal details or documents invented.
3. **Business and Tech Provider verification:** inspect the app's current verification
   requirements in its dashboard, complete the business verification and the separate
   access verification for handling other businesses' data when Meta requires it. These
   are distinct from permission review. Meta's docs currently return errors through our
   web reader; the actual console requirements remain the authoritative checklist.
4. **Advanced Access / App Review:** submit only the permission set used by the final
   flow. Supply a working reviewer login to IsraMarket, suitable authorised demonstration
   assets, concise instructions and recorded consent → selection → results for each use.
   Demonstrate reconnect, disconnect, missing accounts, privacy and deletion. A developer
   console permission saying “Ready for testing” is not public Advanced Access approval.
5. **Publish and test:** after required approvals, verify a non-app-role customer can
   connect their own assets, denied permissions recover, tokens expire gracefully and no
   other customer's assets can be selected. Record approval states; do not infer them.

## Draft permission justifications for the review

- `pages_show_list`: list the Pages the customer manages so they can explicitly select
  their own business. Demonstrate the named selector and a manager account with a Page.
- `pages_read_engagement`: read the selected Page's identity/fan count and support
  discovery of its linked professional Instagram. Demonstrate the Page metadata and
  the linked Instagram in Results; Facebook post-engagement reporting is not implemented.
- `instagram_basic`: identify the professional Instagram linked to the selected Page and
  read its media for the same user-controlled content analysis.
- `instagram_manage_insights`: read that account's/media's reach and engagement; show
  customer Results with a Hebrew explanation, unavailable metrics and actionable advice.
- `ads_read`: let the authorised customer select their ad account, read Ads Insights and
  read Pixel evidence where their token permits it. Show spend/clicks/attributed outcomes,
  campaign detail and tracking status. We do not create/manage ads or send events.

Confirm the app's Facebook Login public-access prerequisites and any Marketing API access
feature requested by the console before submission. Pixel stats availability with the
customer's grant must be proven on a real authorised account; SDK availability alone is
not proof that every token can read the edge. No broader write permission is requested
as a shortcut if read access fails.

## Console check — 1 October 2026

- IsraMarket app `1598367401696233` remains **unpublished**. The Publish page says
  required basic settings are complete; that does not establish Advanced Access.
- The dashboard says **Become a Tech Provider** is required to submit to App Review
  and request other businesses' data. Its access-verification application has not
  been submitted. No verified IsraMarket portfolio or legal entity is available yet.
- Existing contact, privacy, terms and callback settings use the working SSLip origin.
  The basic-settings tab rejects the attempted `/security` data-deletion URL as
  invalid. A dedicated public `/data-deletion` page is being prepared; acceptance in
  the Meta console must be checked after deployment. This is an instructions page,
  not a signed-request deletion callback.
- `/security` is being corrected to the actual four social scopes plus optional
  `ads_read`. Old references to `business_management` and `pages_read_user_content`
  are removed. It now describes ads reports and Pixel evidence.
- No authorised Tazizi dataset or ad account is available in this login's Events Manager
  account selector. An entry named IsraMarket uses the **app ID** and is not evidence
  of an installed store Pixel. Nothing was created or changed in Events Manager.
  Unrelated account names, identifiers and event activity stay out of this review packet.
- Final review submission still needs actual authorised store consent and evidence,
  usable reviewer access and the entity/portfolio prerequisites. No demo screenshots
  or fabricated successful event receipts are submitted as real integration proof.
- Native Chrome's dashboard subsequently remained blank/loading. The connected Chrome
  profile reaches Facebook's sign-in page and has no authenticated Meta session;
  it can be used for the forms once the owner signs in there. No credentials are copied
  between browser profiles.

## Data-handling answers prepared for verification

Provider details need checking against the current [Gemini API terms](https://ai.google.dev/gemini-api/terms)
and [Google Cloud subprocessors](https://cloud.google.com/terms/subprocessors). The paid
Gemini API terms allow transient storage/caching wherever Google or its agents maintain
facilities; do not declare Israel-only processing. Paid status depends on the API key's
Cloud project having an active billing account, not merely on the VM project being paid.
The owner's confirmation remains pending in the shared plan.

IsraMarket helps the customer understand their marketing data and improve an ongoing
marketing plan. They initiate the Meta connection in Connections, approve in Meta's
own consent screen, and select named assets returned by that grant. Optional ads access
is clearly separated. Access tokens are encrypted on the server and never returned
to the browser. Reports and content belong to that customer's business; API endpoints
check the signed-in owner before returning data or accepting asset selections.

The requested permissions are read-only. We do not create/manage ads, change budgets,
publish posts, install tracking code, or send conversion events. Meta-attributed
outcomes are labelled with attribution settings; unavailable metrics and unverified
tracking quality remain unknown. Data supports customer analysis, recommendations and
their plan, rather than being sold to advertisers.

Disconnect removes stored connection tokens and stops future access through that
connection. Previously stored analyses remain until account deletion. The existing
account-deletion flow removes the account, its businesses, imported data, reports,
content, tokens and media from the live system. Local backup snapshots expire after
30 days; the cloud lifecycle schedules deletion at 30 days, followed by a seven-day
soft-delete recovery period. Automatic cloud deletion follows the provider's processing
schedule; do not promise complete backup disappearance within 30 days.
The public instructions include help through the owner's supplied contact email.
This describes current behaviour; it does not claim an audited certification or
an implemented automatic signed-request deletion/deauthorisation callback.

## Reviewer walkthrough (draft, no credentials in this file)

1. Sign in to the provided IsraMarket reviewer account and open `/integrations`.
2. Click Connect Meta, leave read-only ad data selected, approve using the provided
   test manager/authorised test assets in Meta's window. Return to IsraMarket.
3. Select the demonstrated Page, linked professional Instagram, ad account and Pixel;
   confirm. Open Results, refresh and inspect both social and Ads summaries.
4. Open campaign details. Explain the specific marketing decision prompted by the
   measured data and demonstrate the link to the ongoing marketing plan.
5. Open Connections, manage the connection, run the Pixel check. Demonstrate that
   received events from the correct domain do not claim purchase/CAPI quality.
6. Repeat with optional ads declined. Continue with social data; show reconnect guidance.
   Show the privacy/contact/deletion pages and the disconnect/account-deletion controls.

Do not submit this draft until a real test grant proves the endpoints and the domain,
entity, portfolio and required approval prerequisites are ready. Reviewer access must
remain usable throughout review. The draft contains no fabricated account or success.

## Release checks and remaining work

- Validation passed: 809 backend tests (27 new), web typecheck/lint/production build,
  desktop and 390px consent/selection preview and keyboard Escape/focus return.
- Offline regression coverage: nonce/owner/replay/cancellation, failed reconnect preserves
  grant, asset boundaries, pagination, missing values, attribution and Pixel unknown states.
- Web typecheck/lint/build; UI check desktop + narrow screen, keyboard modal/Escape,
  blocked-popup fallback, consent cancellation and severed-opener recovery.
- Real store pilot is pending Meta consent inside IsraMarket and manager access to the
  Tazizi site. This login currently has no accessible Tazizi Wix site. An unrelated site
  is not used. No Meta connection exists in the live database yet.
- Installation stays in Wix/Shopify/WordPress native Meta integration. A read-only app
  token cannot install code on a customer's website. Later platform-specific routes can
  reduce that step; selecting a Pixel is not the same as installing it.
- Full CAPI/dedup/value/currency QA and all lifecycle/revocation/deletion review questions
  must be completed before claiming paid-user readiness. Disconnect removes the app's
  stored grant; customers can separately revoke consent in Meta. Account deletion removes
  their local data through the existing deletion flow.

## Primary sources

- [Meta Marketing API collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi): other businesses' ad accounts need Advanced Access.
- [Meta Pixel details](https://www.postman.com/meta/facebook-marketing-api/request/l6td9zh/getpixeldetails).
- [Meta's Python SDK Pixel object](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adspixel.py) and [stats result](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adspixelstatsresult.py): read-only fields/edges and aggregation shape.
- [Meta Instagram with Facebook Login](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login).
- [Meta access verification](https://developers.facebook.com/docs/development/release/access-verification/) and [business verification](https://developers.facebook.com/docs/development/release/business-verification/): linked reference, web retrieval currently unavailable; verify current requirements in the app console.
- [Google production OAuth policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance): domain ownership/branding.
- [Wix native Pixel and Conversions API guide](https://support.wix.com/en/article/connecting-a-facebook-pixel-and-the-conversions-api-to-your-wix-site).
