# Meta measurement and customer approval plan — 1 October 2026

Owner requested ads reporting, Pixel verification and a simple customer connection. This
explicitly authorises the API and flow changes in this delivery; it is a scoped exception
to the earlier Codex visuals / Claude behaviour division. Landing and Google flows are
preserved. No Meta permissions or business assets were changed in the console by this
implementation. No ads are created, budgets changed, or conversion events submitted.

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

- Validation passed: 808 backend tests (26 new), web typecheck/lint/production build,
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
