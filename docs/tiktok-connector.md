# TikTok read connector

Implementation scope under #161: customer Login Kit consent and Display API data.
The application remains off by default. Neither implementation nor simulator tests prove
sandbox enrollment, app/product approval or a genuine customer read. LinkedIn is separate.

## Provider contract (checked 12 October 2026)

- [Web Login Kit](https://developers.tiktok.com/docs/en/login-kit-web): static HTTPS redirect,
  anti-forgery state, code exchange on the server. Our callback is
  `https://www.isramarket.co.il/backend/integrations/tiktok/callback`.
- [Token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management):
  access-token refresh with rotation and remote revoke. Encrypted server storage only.
- [Display setup](https://developers.tiktok.com/docs/en/display-api-get-started): Login Kit
  and Display product/scopes require approval. Request only `user.info.basic,video.list`.
- [Video list](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list) and
  [video object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object): paginated
  public videos, cumulative views/likes/comments/shares. No reach, watch completion,
  demographics, website clicks, leads, purchases, ads or publishing scope in this connector.

The deeper TikTok Accounts API described in integrations-research.md is a separate future
product/access application, not an unannounced substitution for this Display API grant.

## Customer flow

Connections → TikTok → consent on TikTok → confirm the account displayed → first video read.
The same browser page is used on phone/desktop; no pop-up dependency and no customer API key.
The interface language survives the consent return. Setup and the trial guide add TikTok
only when the saved plan requires it; consent alone never completes that task. A verified
empty read completes the connection without claiming measured numbers. Disabled access
is excluded from actionable progress, and missing TikTok does not block usable posts.
After confirmation, show up to three recent videos with counts and the actual read date.
All available counts (up to 60 recent public videos, three pages) are retained for research;
missing counts stay unknown, zeros stay zero, and a capped/broken pagination is partial.

Browser nonce, provider, owner, current session epoch and a one-use database attempt must
match. A later attempt/disconnect/deletion cannot be overwritten by a late callback/read.
Failed reconnects preserve the old grant. Changing account clears the previous snapshot.
Refreshes are serialized and compare-and-written; returned refresh tokens replace old ones.

Research refreshes only an enabled, confirmed owner grant. It uses original read dates and
at most seven-day-old counts; statements cite video IDs/URLs and explicitly identify
cumulative measurements. These findings enter the existing evidence-grounded research,
plan and post prompt chain. They never manufacture sales, leads or period comparisons.

Disconnect removes local tokens/counts immediately and attempts remote revocation. If
revocation is unreachable, the customer is told how to remove the app in TikTok. Account
deletion also attempts revocation and removes stored business data. No provider bodies,
OAuth codes, grants or secrets are returned in URLs, logs or public integration payloads.

## Operator setup and genuine QA gate

On 12 October 2026 the owner completed developer registration. The individual app and
the "IsraMarket connector QA" sandbox exist. Production and sandbox credentials are
stored separately in Secret Manager, with only the existing VM service identity added
as a reader. Sandbox Login Kit, the two minimal scopes and the owned-domain callback
have been saved. The current portal exposes `video.list` in Add scopes, rather than a
separate Display API product tile. No target account or genuine read has passed yet.
The production URL prefix `https://www.isramarket.co.il/` has been verified using the
provider's public signature file (PR #201, deployed revision b8f0c83824e917aa63ac6756c277fb3bb1c9abfa).

Production review still requires the real sandbox demonstration. The portal currently
requires a demo video even when saving its production draft, so production setup remains
unfinished until that recording exists; do not supply a simulator recording as proof.

When preparing another environment, inspect the actual registration and associated app; account terms
and any sensitive permission approval belong to the owner at the submission stage.
Prepare app name IsraMarket, owned website, privacy/terms/deletion URLs and the callback
above. Obtain the provider's sandbox users and products/scopes; do not claim approval.

Store `tiktok-client-key` and `tiktok-client-secret` in Secret Manager and grant the existing
VM service identity read access to those secrets. render-env.sh loads optional values;
keys never belong in git, browser settings, customer forms or extra.env.
Sandbox uses `tiktok-sandbox-client-key` and `tiktok-sandbox-client-secret` instead.
render-env.sh chooses these when the configured mode is `sandbox`, with no fallback to
production credentials if either sandbox secret is absent.

Use `TIKTOK_ACCESS_MODE=sandbox` plus the explicit operator-managed
`TIKTOK_SANDBOX_EMAILS` allowlist in extra.env for genuine enrolled testers only. Others
see unavailable. `off` disables new consent/reads for everyone while disconnect remains
possible. Set `public` only after approval and actual connect/read/revoke QA evidence.

Before public activation (#178): use the dedicated QA customer and a genuinely enrolled
TikTok account with public videos. Verify profile match, scopes, metrics/source/read date,
refresh, cancellation, partial permission, wrong owner, expired/revoked grant, empty/private
videos, reconnect/account switch, disconnect and account deletion. Exercise desktop/phone
in Hebrew/English/Arabic/Russian and record only sanitized evidence. Record publishing and
business-analytics approvals separately; neither is requested here.
