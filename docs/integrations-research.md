# Measurement integrations: what we need, what we can do for the owner, simplest route

Updated 2026-10-01: [Meta measurement implementation and approval plan](meta-approval-plan.md)
contains the current scope, customer flow, approval drafts and remaining live tests.
The research below includes proposals; it is not an implementation-status checklist.

Research as of 2026-09-30, against official docs (links inline). "Not verified" means the
official docs were silent, contradictory or did not render; treat those as open questions,
not facts. Our own tests on live sites are marked **(tested)**.

Owner brief: "we must have integrations… we need to explain this to the user, and then
understand what's the simplest route for us and him to get access to these tools." Second
brief: social data matters even more than the website, so it is an analytical route of its
own and may come first.

---

## 0. Bottom line

1. **Social comes first.** Almost every owner has Instagram; not every owner has a site with
   analytics. Instagram insights need no website at all.
   - Make **Instagram API with Instagram Login** the default connection. It needs no Facebook
     Page, only a professional account. This remains a future route; the current combined
     Page/Instagram/Ads flow uses Facebook Login.
   - Keep **Facebook Login** as an optional second step. Competitor data (Business
     Discovery, hashtag search) and the Story insights webhook exist only there.
2. **Day 1 needs no integration at all:**
   - tracked links on every post (already built);
   - **our own WhatsApp redirect**, with a source code in the prefilled text;
   - a coupon code per channel;
   - "איך שמעתם עלינו";
   - manager access to the owner's Google Business Profile.
3. **Website: detect before asking.** Our scan already fetches the raw HTML. It can read
   `G-`/`GT-`/`GTM-`/`AW-` IDs, a hand-pasted `fbq('init')`, Shopify's web-pixel config and
   the Site Kit marker **(tested)**. The exception is Wix's *native* Meta pixel: it is
   injected at runtime, so its absence in raw HTML means "unknown", not "missing"
   **(tested)**.
4. **One Google grant reads site data and Search Console (implemented).** Automatic GA
   property creation, `analytics.edit` and Search Console ownership verification are
   future proposals, not current capabilities. The current grant is read-only.
5. **Meta pixel: use the platform's own app, not our API.** That means Wix Marketing
   Integrations, the Shopify "Facebook & Instagram" app, or the Meta plugin on WordPress.
   The current delivery discovers existing Pixels and reads receipt/domain evidence.
   Creating Pixels or sending Conversions API events is outside its scope. Requirements
   for those writes must be verified before proposing them; no volume threshold is
   assumed from this earlier research.
6. **GTM is not the default.** It only wins on developer-built sites.
7. **Submit these THIS WEEK.** Every one has a lead time we cannot compress (table in §6):
   - Meta Business Verification, then App Review;
   - Google OAuth brand and sensitive-scope verification;
   - the Google Business Profile API access form;
   - the TikTok company developer profile, then the Accounts API form.

---

## 1. Where the app is today (read, not modified)

- `api/app/services/ga4.py`: Google OAuth with `analytics.readonly` + `webmasters.readonly`.
  It lists properties through Admin API `accountSummaries` and runs 3 Data API reports.
  Search Console reads use the same grant (`include_granted_scopes`).
- `api/app/services/meta.py`: Facebook Login (Graph `v25.0`) with `pages_show_list`,
  `pages_read_engagement`, `pages_read_user_content`, `instagram_basic`,
  `instagram_manage_insights` and `business_management`. It reads IG insights through the
  Page-linked IG account and has helpers for Business Discovery and hashtag search.
- `api/app/services/publish.py`: publishing is honestly blocked on App Review
  (`instagram_content_publish`, `pages_manage_posts`). Posts carry UTMs
  (`strategy.py` builds `tracking_url`), and `routers/performance.py` matches them to GA4
  campaign rows.
- `api/app/services/scraper.py`: fetches raw HTML with httpx and never runs JavaScript.
  It detects the platform (`colors.detect_platform`: wix, shopify or wordpress) but **no
  tracking tags yet**. `screenshot.py` can render with Chrome, but production ships no Chrome.
- `web/components/help/guides.ts`: guides already exist for GA access, Instagram business,
  Business Profile and the WhatsApp link. They are the natural home for the paste guides
  below.
- **Unknown, check in the dashboards:**
  - Whether the Meta app already has **Advanced Access** for its scopes. Without it, only
    people with a role on the app can connect ([access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)).
  - Whether the Google OAuth app is **verified**. See the 100-user cap in §6.

---

## 2. Per tool: by hand, via API after one consent, and what still touches the site

### 2.1 Google Analytics 4
- **By hand today:**
  - analytics.google.com › Start measuring › account › property › Web stream › copy the `G-` ID;
  - paste it into the site builder;
  - add our Gmail as Viewer, or connect via our OAuth.
- **Via API after consent:**
  - Create a property: `properties.create`, scope `analytics.edit` ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties/create)).
  - Create a web data stream: `properties.dataStreams.create`. The `measurementId` (`G-…`)
    comes back in the response ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.dataStreams)).
  - Create key events such as a WhatsApp click or a form submit: `properties.keyEvents.create` ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents/create)).
  - Link Google Ads later: `googleAdsLinks.create`.
- **Account creation is only half automatic.** `accounts.provisionAccountTicket` returns a
  ticket, but the **owner must accept Google's terms in the browser**, and the redirect URI must
  be registered ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accounts/provisionAccountTicket)).
  - So the flow is: list accounts; if there are none, show one "לאשר את התנאים של גוגל" step;
    then create the property and stream.
- **Adding users** (`accessBindings`) is v1alpha only, with the extra scope
  `analytics.manage.users` ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create)).
  We don't need it: the OAuth grant is enough to read.
- **Enhanced measurement** (outbound clicks, forms): the default for streams created through
  the API is not verified. Set it explicitly with v1alpha `updateEnhancedMeasurementSettings`
  ([ref](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/EnhancedMeasurementSettings)).
  This matters because outbound clicks is how a wa.me click from the site shows up.
- **Quotas:** 600 writes per minute per project. Not a concern ([quotas](https://developers.google.com/analytics/devguides/config/admin/v1/quotas)).
- **Still touches the site:** pasting the `G-` ID once (§3).

### 2.2 Google tag / Google Tag Manager
- **The Google tag.** One `G-`/`GT-` tag can carry several destinations, such as Google Ads,
  added in Google's UI (Admin › Manage Google tag › +Destination) with no retagging
  ([help](https://support.google.com/google-ads/answer/12329709)). Wix explicitly relies on
  this: one tag per site ([Wix](https://support.wix.com/en/article/google-tag-unification)).
  **So the owner pastes one `G-` ID, once, and we never need them in the site again for
  Google.**
- **GTM API v2** ([overview](https://developers.google.com/tag-platform/tag-manager/api/v2)):
  - **Cannot create a GTM account.** The owner does that in the UI and accepts the terms ([ref](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts)).
  - Can create containers (`tagmanager.edit.containers`), workspaces, tags and triggers.
  - Can create versions (`tagmanager.edit.containerversions`) and publish (`tagmanager.publish`).
  - `containers.snippet` returns the install code.
  - The exact tag `type` keys for the Google tag and Custom HTML are not verified; the tag
    dictionary page returned 404.
- **Still touches the site:** the container snippet, or the `GTM-` ID on Wix and WordPress
  (Site Kit). The API cannot install it ([help](https://support.google.com/tagmanager/answer/14847097)).
- **Verdict:** GTM adds a second Google account and a second product for the owner. Use it
  only for developer-built sites, where one snippet from the developer lets us add future
  tags through the API without calling them again (§3.4).

### 2.3 Google Search Console
- **By hand today:** add the property, verify it (DNS, meta tag, file, GA or GTM), submit the sitemap.
- **Via API after consent:**
  - The Site Verification API (`getToken` / `webResource.insert`) supports `ANALYTICS` and
    `TAG_MANAGER` methods.
  - **If the site already has the owner's GA tag in `<head>` and the owner has Edit on that
    property, verification succeeds with no site edits** ([verification](https://support.google.com/webmasters/answer/9008080), [API](https://developers.google.com/site-verification/v1/getting_started)).
  - Then `sites.add` (full `webmasters` scope) creates the URL-prefix property ([ref](https://developers.google.com/webmaster-tools/v1/sites/add)).
  - Use `siteverification.verify_only`, the narrowest scope.
  - Not verified: whether a Wix-injected `gtag` passes the `ANALYTICS` check; test it on a
    real Wix site.
- **Platform shortcuts:**
  - Wix's SEO Setup Checklist "Connect to Google" verifies the site and submits the sitemap
    (Premium plus domain; usable once) ([Wix](https://support.wix.com/en/article/connecting-your-site-to-google-in-the-wix-seo-setup-checklist)).
  - Site Kit verifies automatically ([Site Kit](https://sitekit.withgoogle.com/documentation/supported-services/search-console/)).
  - Shopify: the owner pastes the meta tag in `theme.liquid` ([Shopify](https://help.shopify.com/en/manual/promoting-marketing/seo/find-site-map)).
- A Domain property needs DNS. Not for our owners; URL-prefix is enough.
- **Signal in HTML:** a `<meta name="google-site-verification">` means *someone* verified
  the site, not necessarily the owner **(tested: present on several sites)**.

### 2.4 Meta Pixel and Conversions API
- **By hand today:**
  - Events Manager › create a dataset (the pixel);
  - install it through the platform app (§3);
  - optionally verify the domain on Facebook (Wix needs this).
- **Via API:**
  - Create: `POST /act_{ad_account_id}/adspixels` needs an **ad account** and allows one pixel
    per ad account there ([ref](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adspixels)).
    The permission is likely `ads_management` (not verified).
  - Read and health check: `last_fired_time` and the `/stats` edge ([ref](https://developers.facebook.com/docs/marketing-api/reference/ads-pixel/)).
    The FBL4B Conversions API template reaches pixels with `ads_read` + `business_management`.
- **Conversions API as a platform** sending for clients ([ref](https://developers.facebook.com/documentation/ads-commerce/conversions-api/set-up-conversions-api-as-a-platform)) needs:
  - App Review for `ads_management`, `ads_read` and `pages_read_engagement`;
  - the Marketing API Access Tier, Full Access (at least 500 calls in 15 days, under 15% errors) ([ref](https://developers.facebook.com/docs/marketing-api/overview/authorization));
  - user consent.

  **Not for now.**
- **The platforms already do this.** Wix "Meta Pixel & CAPI" (Facebook login inside Wix),
  the Shopify "Facebook & Instagram" app (Enhanced/Maximum sharing adds CAPI) and Meta's
  WordPress plugin all send server-side events for free (§3).
- **Recommendation:** we guide, detect and optionally read health later with `ads_read`. We
  don't create pixels.

### 2.5 Google Business Profile
Details in §5. In short:
- The API needs a **separate access application**: 14-day review; prerequisites are our own
  verified profile, 60+ days old, plus a website.
- Until then, the owner adds our Google account as **Manager**, a 1-minute UI step. We can then
  read and download Performance data.

### 2.6 Meta Business: Instagram and Facebook insights
Details in §4. Already built via Facebook Login. **Recommendation:** add Instagram Login as the
default and keep Facebook Login for competitors, Page insights and Story webhooks.

---

## 3. Per website platform: simplest install path

| Platform | Site data (`G-`) | Meta pixel | Search Console | Plan needed | Owner time |
|---|---|---|---|---|---|
| **Wix** | Dashboard › Marketing Integrations › **Google Tag** › Connect › paste `G-` ([Wix](https://support.wix.com/en/article/tracking-events-on-your-wix-site-with-a-google-analytics-property)) | Marketing Integrations › **Meta Pixel & CAPI** › Connect: a Facebook login, not an ID paste. Domain must be verified on Facebook ([Wix](https://support.wix.com/en/article/connecting-a-facebook-pixel-and-the-conversions-api-to-your-wix-site-7351813)) | SEO Setup Checklist › Connect to Google (automatic, once), or our `ANALYTICS` verification | **Premium + connected domain** for all of these, and for Custom Code ([Wix](https://support.wix.com/en/article/embedding-custom-code-on-your-site)) | about 2 min per item (estimate) |
| **Shopify** | **Google & YouTube** app › connect Google › "only GA4" › pick or create the property. No ID paste ([Shopify](https://help.shopify.com/en/manual/online-sales-channels/marketplaces/google/getting-setup/connect)) | **Facebook & Instagram** app › Share data settings › Enhanced (adds CAPI) ([Shopify](https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/meta-data-sharing)). Store can't be in private mode; needs a published Page in a business portfolio ([req.](https://help.shopify.com/en/manual/online-sales-channels/facebook-instagram-by-meta/requirements)) | Meta tag in `theme.liquid`, or our `ANALYTICS` verification | Plan requirement not stated in the docs (not verified) | about 5 min per app |
| **WordPress (self-hosted)** | **Site Kit by Google** does it in one flow: creates or reuses the GA4 property, places the tag, and avoids duplicates ([Site Kit](https://sitekit.withgoogle.com/documentation/supported-services/analytics/)) | **Meta Pixel for WordPress**: official, free, has CAPI, updated Jul 2026, rated 2.7/5 ([wp.org](https://wordpress.org/plugins/official-facebook-pixel/)). WooCommerce: Meta for WooCommerce | Automatic in Site Kit | Free. Needs an Administrator role and a public site ([Site Kit](https://sitekit.withgoogle.com/documentation/getting-started/install/)) | about 10 min in total |
| **WordPress.com** | Jetpack › Traffic › "Google Analytics Measurement ID". **Premium plan or higher** ([wp.com](https://wordpress.com/support/google-analytics/)) | Plugins on any paid plan ([wp.com](https://wordpress.com/support/plugins/install-a-plugin/)) | Jetpack › Site verification, paste the meta tag (all plans) ([wp.com](https://wordpress.com/support/site-verification-services/)) | Premium | about 5 min |
| **Custom / developer-built** | The developer pastes the `gtag` snippet in `<head>`. Or one GTM container that we then manage through the API | Meta base code in `<head>` ([Meta](https://developers.facebook.com/docs/meta-pixel/get-started/)) | Our `ANALYTICS` verification once the tag is live, otherwise the meta tag | n/a | One message to the developer (we write it) |
| **No website** | Nothing to install | Nothing to install | n/a | n/a | Measure through Instagram/TikTok insights, the Business Profile, the WhatsApp redirect, coupons and "how did you hear" |

**Is "one ID to paste" GTM simpler?**
- Wix: the same for the owner, but you lose Wix's automatic store and lead events, and double
  counting can follow if the presets stay on ([Wix](https://support.wix.com/en/article/setting-up-google-tag-manager-with-wix)).
- Shopify: worse. GTM runs only as an "unsupported" custom pixel with hand-coded events ([Shopify](https://help.shopify.com/en/manual/promoting-marketing/pixels/custom-pixels/gtm-tutorial)).
- WordPress: the same, because Site Kit already covers Google.
- Custom sites: better.

**The simplest single paste is the `G-` ID**, plus the platform's Meta app.

**Detecting what is already installed, from raw HTML (tested 2026-09-30):**

| Site (platform) | Visible in plain `curl` HTML | Visible only after JavaScript |
|---|---|---|
| tazizi.co.il (Wix, native integrations) | `G-` and `GTM-` IDs inside Wix's consent-mode block (`promoteAnalyticsChannels`, channel names `googleAnalyticsConsentMode` and `googleTagManagerConsentMode`); `google-site-verification` and `facebook-domain-verification` meta tags | The **native Meta pixel** (fbq with a 15-digit ID, loaded by Wix at runtime; `fbq.getState()` shows it). Wix also posts events to `/_serverless/analytics-reporter/facebook/event`, which is its server-side relay. An `AW-` ID loaded through the GTM container |
| Wix sites using **Custom Code** | `gtag`/`fbq('init', …)` snippets, both as scripts and in the embeds JSON (`"embedType":"custom"`, e.g. name "Google Analytics (G-…)") | — |
| max-brenner.co.il (Shopify, apps) | `webPixelsConfigList`: `{"pixel_id":"…","pixel_type":"facebook_pixel"}` from the Meta app and `google_tag_ids: [G-…, AW-…]` from the Google & YouTube app | — |
| rulers.co.il (WordPress) | `<meta name="generator" content="Site Kit by Google 1.188.0">`, a `GT-` ID, `GTM-` | — |

- **Scanner rule:** found means installed. Not found on Wix, for Meta, means "unknown":
  offer an optional rendered check (Chrome, when available) or ask the owner.
- Wix wraps Google tags in consent mode. With a cookie banner on, data flows only after
  consent, so expect undercounting. That is honest to say.
- Scanner patterns: `\bG-[A-Z0-9]{8,12}\b`, `\bGT-…`, `\bGTM-[A-Z0-9]{5,9}\b`,
  `\bAW-\d+`, `fbq\(\s*['"]init['"]\s*,\s*['"]?(\d+)`, Shopify `"pixel_type":"facebook_pixel"`
  / `google_tag_ids`, `Site Kit by Google`, `google-site-verification`,
  `facebook-domain-verification`, and TikTok `ttq.load('…')` (seen on a Wix site).

---

## 4. Social analytics (the main route)

### 4.1 Instagram: Instagram Login vs Facebook Login

| | **Instagram API with Instagram Login** (recommended default) | **Instagram API with Facebook Login** (what we have) |
|---|---|---|
| Owner needs | A professional IG account (Business or Creator). **No Facebook Page** ([overview](https://developers.facebook.com/docs/instagram-platform/overview)) | A professional IG account **linked to a Facebook Page**, plus the Page picker, sometimes Business Manager |
| Scopes for insights | `instagram_business_basic`, `instagram_business_manage_insights` (plus `_manage_comments` for mentions) ([IG Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)) | `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` (plus `business_management`) |
| Token | Long-lived, 60 days; refreshable after 24 h ([refresh](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token)) | Long-lived user or Page token (current code) |
| Only here | — | **Business Discovery** (competitors' public counts), **hashtag search** (Public Content Access feature), the **`story_insights` webhook**, ads/tagging ([overview](https://developers.facebook.com/docs/instagram-platform/overview), [BD](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)) |

For a non-technical owner, Instagram Login is simpler: one Instagram sign-in, and the most
common failure in our guide ("לא מצאנו דפי פייסבוק") disappears.

**Account metrics** (`/{ig-user-id}/insights`, v25) ([ref](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights)):
- Available: `reach`, `views` (replaced `impressions`), `accounts_engaged`,
  `total_interactions`, `likes`, `comments`, `saves`, `shares`, `reposts`, `replies`,
  `profile_links_taps` (by button: call, email, address, text), `follows_and_unfollows`,
  `online_followers`, `follower_demographics` / `engaged_audience_demographics` (age, gender,
  city, country; top 45).
- Deprecated in v21 (Jan 2025): `profile_views`, `website_clicks`, `email_contacts`,
  `phone_call_clicks`, `get_directions_clicks`, `text_message_clicks`.
- Deprecated in v22 (Apr 2025): `impressions` and `plays` ([changelog](https://developers.facebook.com/docs/instagram-platform/changelog)).

**Media metrics** ([ref](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights)):
- Feed and Reels: views, reach, likes, comments, saves, shares, reposts, total_interactions.
- Feed and Stories: profile_visits and follows.
- Reels: average watch time, total watch time, `reels_skip_rate`.
- Stories: navigation, link_clicks, replies.
- Carousels: parent post only.

**Retention and limits** (why we must store daily snapshots):
- Account metrics are kept **90 days** ([insights](https://developers.facebook.com/docs/instagram-platform/insights/)).
- `online_followers` covers **the last 30 days** only.
- Media metrics are kept 2 years.
- **Stories: 24 hours.** Poll before they expire on Instagram Login; Facebook Login gets the webhook.
- Data can arrive up to 48 h late.
- Demographics, `online_followers` and follows/unfollows need **100 or more followers**.
- Rate limit: 4,800 × impressions per 24 h (business use case). Business Discovery and hashtags:
  200 × users per hour ([limits](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)).
- Hashtag search: **30 unique hashtags per 7 days** per account, and `recent_media` covers 24 h only
  ([hashtag](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search)).
- Mentions work with Instagram Login; Story mentions are not supported.

### 4.2 Facebook Pages
- Permissions: `pages_read_engagement` + `read_insights` ([Page insights](https://developers.facebook.com/docs/platforminsights/page/)).
- Metrics deprecated on 15 Nov 2025 ([deprecated](https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics)):
  - `page_impressions` → `page_media_view`
  - `page_fans` → `page_follows`
  - `post_impressions` → `post_media_view`
  - `page_fans_city` → `page_follows_city`
  - removed with no replacement: `page_fan_adds`/`_removes`
- The `*_impressions_unique` → `*_total_media_view_unique` change is dated "June 15, 2025" on
  one page and "2026" on another (not verified).
- Still usable: `page_media_view`, `page_total_media_view_unique`, `page_follows`,
  `page_daily_follows_unique`/`unfollows`, `page_post_engagements`, `page_total_actions`,
  `page_views_total`, video views. Per post: `post_media_view`, `post_clicks`, reactions.
- For most Israeli SMBs the Page matters less than Instagram. It's still worth reading
  because it's cheap once Facebook Login is connected.

### 4.3 TikTok
- **Accounts API**, TikTok API for Business: the right one ([overview](https://business-api.tiktok.com/portal/docs/accounts-api-overview/v1.3)).
  - Profile, daily: video views, reach, profile views, likes, comments, shares, follower
    gains/losses, hourly audience activity, age/gender/country/city (100+ followers).
  - Bio-link and phone clicks: Verified Business accounts only ([profile](https://business-api.tiktok.com/portal/docs/get-profile-data-of-a-tiktok-account/v1.3)).
  - Per video: reach, watch time, full-watch rate, retention, traffic source, audience,
    website clicks ([posts](https://business-api.tiktok.com/portal/docs/get-post-data-of-a-tiktok-account/v1.3)).
  - **Look-back is 60 days**, so we store daily. The owner must have posted once and turned
    on Analytics.
  - Access steps:
    1. **Company** developer profile: company email and website, about 3 business days.
    2. App: 2–3 business days.
    3. **Accounts API Access Application Form**: mandatory since 2026-03-20, review time not published ([app](https://business-api.tiktok.com/portal/docs/create-a-developer-app/v1.3)).
  - No Israel restriction found (not verified either way).
- **Login Kit + Display API** is a fallback: follower, like and video counts, plus per-video
  views, likes, comments and shares. App review takes "several days to two weeks" ([FAQ](https://developers.tiktok.com/doc/getting-started-faq)).
  The extra launch approval applies to the US/UK/EU only.
- **Research API:** academics only, not usable ([Research API](https://developers.tiktok.com/products/research-api/)).
- **Creative Center:** public UI and Israel is selectable **(the agent loaded region=IL)**.
  The Discovery API needs an advertiser token; whether it accepts IL is not verified.
  The Commercial Content Library covers the EU/EEA/UK/CH only.

### 4.4 Competitor and market data without scraping
- **Business Discovery** (Facebook Login): a competitor's followers, post count, and per-post
  likes, comments and views. Views include paid views. Nothing for age-gated accounts.
- **Hashtag search** (Facebook Login plus Public Content Access): the limits in §4.1.
- **Meta Ad Library API:** commercial ads delivered **only in Israel are not in the API**. The
  API covers political and social-issue ads worldwide, plus ads delivered in the EU ([ref](https://developers.facebook.com/docs/graph-api/reference/ads_archive/)).
  The **public UI shows all active ads in any country**. Link out to
  `facebook.com/ads/library/?active_status=active&country=IL&q=<name>` ([tools](https://transparency.meta.com/researchtools/ad-library-tools/)).
- **TikTok:** Creative Center UI (trends, top ads by region). Link out.
- **Rule:** we don't scrape Instagram, Facebook or TikTok (their terms). Only official APIs and links to public UIs.

### 4.5 WhatsApp Business
- **The free WhatsApp Business app** ([stats](https://faq.whatsapp.com/826765711858732)):
  - The Help Center documents sent, delivered, read and received counts; whether current
    versions still show them is not verified.
  - Ad metrics shown in the app include "Conversations started".
  - **No API reads the plain app.**
- **Coexistence** (the app number connected to the Cloud API through Embedded Signup)
  ([ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)):
  - 180 days of history, plus live mirroring of new chats.
  - Requires us to be a **Meta Tech Provider**: business verification plus App Review for
    `whatsapp_business_management`/`_messaging` ([ref](https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers)).
  - Turns off broadcast lists and a few other app features.
  - A later phase, and only if owners ask for it.
- **Click-to-WhatsApp ads:** Ads Manager reports "Messaging conversations started" natively
  ([help](https://www.facebook.com/business/help/1210106579540881)). CAPI for Business
  Messaging sends lead and purchase events back, but needs the WhatsApp permissions above.
- **Our wa.me redirect** is the day-1 tool (§5.2).

### 4.6 What the social data lets the plan do
- **When to post:** `online_followers` for the last 30 days, and TikTok `audience_activity`.
  Build a weekday × hour heatmap from our snapshots, not from Meta's 30-day window.
- **Which content works:** saves, shares and reposts per reach, by format (Feed, Reel,
  Story, carousel), plus Reels watch time and skip rate. This ranks the content pillars for next month.
- **Audience fit:** follower and engaged-audience age, gender and city against the plan's
  target audiences. Hidden under 100 followers.
- **A funnel for shops with no site analytics:** reach → profile visits (per post) →
  `profile_links_taps` (call, email, address) plus our WhatsApp redirect clicks → sent
  chats (codes). This can be a KPI with no website at all.
- **Benchmark:** competitor follower growth and posting cadence (Business Discovery),
  alongside links to their active ads.

---

## 5. Business Profile and measurement with no integration

### 5.1 Google Business Profile
- **API access** ([prereqs](https://developers.google.com/my-business/content/prereqs), [FAQ](https://developers.google.com/my-business/content/faq)):
  - A Google Cloud project, then the "Application for Basic API Access" form.
  - Eligibility: **we** must manage a profile that has been verified and active for 60+
    days, plus a website for the business. Apply from an owner or manager email, ideally on
    our own domain.
  - Review within 14 days.
  - Quota is 0 until approved, then 300 QPM.
  - Scope `business.manage`; its sensitive/non-sensitive classification is not verified.
- **Performance API** ([ref](https://developers.google.com/my-business/reference/performance/rest)):
  - Daily: `BUSINESS_IMPRESSIONS_{DESKTOP,MOBILE}_{MAPS,SEARCH}`, `CALL_CLICKS`,
    `WEBSITE_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`, `BUSINESS_CONVERSATIONS`, `BUSINESS_BOOKINGS`.
  - Monthly: search keywords, with thresholds for low volume.
  - Reviews are still on v4.
  - The Q&A API was discontinued on 3 Nov 2025 ([changelog](https://developers.google.com/my-business/content/qanda/change-log)).
- **Simplest owner flow** ([claim](https://support.google.com/business/answer/2911778), [verify](https://support.google.com/business/answer/7107242)):
  - Claim: Maps › Claim this business › Manage now, or business.google.com/add.
  - Verify: Google chooses the method (phone, SMS, email, video, video call, postcard).
    Review takes up to 5 business days.
  - Israel is supported ([countries](https://support.google.com/business/answer/6270107)).
  - Our existing guide covers this.
- **Before API approval:**
  - The owner adds our Google account as **Manager**: Business Profile › ⋮ › Business Profile settings › People and access › Add ([help](https://support.google.com/business/answer/3403100)).
  - Managers can download insights. Some sensitive functions wait 7 days.
  - Owners can also download Performance reports themselves ([help](https://support.google.com/business/answer/9918094)).

### 5.2 Day-1 measurement (no integration)

| Method | What it measures | What it can't | Owner effort |
|---|---|---|---|
| **Tracked links on posts** (built) | Visits per post and campaign, **once the site has analytics** | Anything if the site has no analytics; clicks that skip the site | None |
| **Our WhatsApp redirect** (`isramarket…/w/abc` → `wa.me/9725…?text=…`) | Clicks per post, time, device; referrer sometimes (in-app browsers often drop it) | Whether a message was actually sent, or whether a sale happened ([wa.me FAQ](https://faq.whatsapp.com/5913398998672934)). Link-preview crawlers inflate counts: filter `facebookexternalhit` and similar ([Meta crawlers](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers)) | None |
| **Source code in the prefilled text** (e.g. "(קוד: פוסט 3)") | Which post each **sent** chat came from, visible to the owner in the chat | Chats where the customer deletes the text; sales | Glance at the code (a one-tap "סמנו פנייה" in our app would count them) |
| **Coupon code per channel** | Sales per channel | Buyers who skip the code; codes that leak between channels | Record it at checkout |
| **"איך שמעתם עלינו"** | The customer's own answer, **including word of mouth** | Precision (people remember badly) | Ask each new customer; log it in our app |
| **Business Profile manager access** | Views, calls, directions, website clicks, keywords | Sales, where the traffic came from | 1 minute |
| **Click-to-WhatsApp ads** (if they advertise) | Conversations started, cost per conversation (native) | Sales | None |

### 5.3 Israeli privacy: flagged for legal review
- **Amendment 13** to the Privacy Protection Law has been in force since 14 Aug 2025 ([Pearl Cohen](https://www.pearlcohen.com/israel-significant-amendment-to-the-privacy-law-takes-effect/)).
- On 25 Feb 2026 the Privacy Protection Authority published a consent position: consent must
  be active and informed, and marketing or profiling needs separate active consent ([Gornitzky](https://www.gornitzky.com/israeli-privacy-protection-authority-publishes-new-guidance-on-obtaining-consent/)).
- **Our inference, not legal advice:** the Google tag or Meta pixel on an Israeli SMB site
  likely needs opt-in consent, so recommend the platform's cookie banner.
- Wix already gates Google tags behind consent mode **(tested)**.
- Our redirect logs IP addresses and user agents. Keep that minimal (hash or drop IPs) and
  mention it in our privacy policy.
- **Get a lawyer to confirm before we tell owners what they must do.**

---

## 6. Permissions and review requirements

| Provider / scope or feature | Used for | Review needed | Lead time (official) | Status / notes |
|---|---|---|---|---|
| **Google OAuth app** (all scopes below) | — | **Brand verification + sensitive-scope verification**: privacy policy on our domain, a demo video, a justification per scope ([sensitive](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)) | Brand 2–3 business days; sensitive "3–5 business days" per the developer page, **10 business days** per the Cloud FAQ ([FAQ](https://support.google.com/cloud/answer/13463817)) | **Unverified production apps are capped at 100 new users for the project's lifetime, and the cap cannot be reset.** Testing mode allows 100 test users, **and their tokens expire after 7 days**, which breaks daily sync ([help](https://support.google.com/cloud/answer/7454865)). None of these scopes is restricted, so no CASA assessment ([restricted list](https://support.google.com/cloud/answer/13464325)). Sensitive or non-sensitive per scope: check the Console "Data Access" page (not verified). **Submit every scope we will ever want in one review.** |
| `analytics.readonly` | Read site data | In the review above | | In use |
| `webmasters.readonly` | Read Search Console | In the review above | | In use |
| `analytics.edit` | Create the property, stream and key events | In the review above | | New |
| `siteverification.verify_only` + `webmasters` | Verify and add the Search Console property | In the review above | | New |
| `tagmanager.edit.containers` / `.edit.containerversions` / `.publish` | GTM for developer-built sites | In the review above | | Optional, later |
| `business.manage` + **GBP API access form** | Business Profile performance and reviews | The Google review above, **plus** the GBP application (we need our own verified profile, 60+ days old) | 14 days | **Apply now.** If our own profile is under 60 days old, start the clock today |
| **Meta Business Verification** | Prerequisite for any Advanced Access | Documents for IsraMarket's legal entity | "Up to 14 business days" (Help Center, via search snippet) | **Start now** |
| `instagram_business_basic`, `instagram_business_manage_insights` (+ `_manage_comments`) | Instagram Login (default) | App Review (Advanced Access) + Business Verification ([access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)) | App Review "less than one week, often 2–3 days" ([App Review](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction)); plan 2–4 weeks with a rejection round | New |
| `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_insights`, `business_management`, `read_insights` | Facebook Login: Page insights, Business Discovery, Story webhook | App Review + Business Verification; `business_management` needs a screencast | Same | In use: **check the current access level** |
| Instagram Public Content Access (feature) | Hashtag search | App Review | Same | Optional |
| `ads_read` | Campaign results, pixel health | App Review + Marketing API access tier | Same | Phase 3, only for owners who advertise |
| `ads_management` (Full) | Creating pixels, CAPI as a platform | App Review + 500 calls in 15 days | Weeks | **Don't** |
| `instagram_content_publish`, `pages_manage_posts` | Publishing (see `publish.py`) | App Review | Same | Separate track; bundle it into the same submission if we're ready |
| **TikTok company developer profile → app → Accounts API form** | TikTok insights | Company email and website; app review; the mandatory Accounts API form ([dev](https://business-api.tiktok.com/portal/docs/register-as-a-developer/v1.3)) | about 3 + 2–3 business days + unpublished | **Start the profile now** |
| TikTok Login Kit / Display API | Fallback counts | App review with demo videos ([guidelines](https://developers.tiktok.com/doc/app-review-guidelines)) | Several days to 2 weeks | Optional |
| **WhatsApp Tech Provider** (`whatsapp_business_management`, `_messaging`) | Coexistence, chat counts | Business Verification + App Review | Not published | Later, on demand |

---

## 7. Recommended phased route

### This week: applications (lead times cannot be compressed)
1. **Meta Business Verification** for IsraMarket. Then **one App Review submission** covering:
   - the Instagram Login scopes;
   - the Facebook Login set we already request, plus `read_insights`;
   - optionally Public Content Access and the publishing scopes.

   Record the screencasts on the current flows.
2. **Google OAuth verification**, with every scope at once:
   - `analytics.readonly`, `webmasters.readonly`, `analytics.edit`,
     `siteverification.verify_only`, `webmasters`, `business.manage`;
   - privacy policy and homepage on our verified domain, and a demo video.

   **Until it passes, protect the 100-user lifetime cap.** Don't open Google sign-in to the
   public beta. Use it with design partners only.
3. **GBP API access form.** It needs our own profile, verified for 60+ days.
4. **TikTok company developer profile**, then the app, then the Accounts API form.

### Phase 1 (ship first; no new approvals)
- **Tag detection in the scan** (§3 patterns): show "found: site data / Meta pixel /
  Search Console / Site Kit". Wix without a visible Meta pixel shows "לא ידוע", never "אין".
- **WhatsApp tracked redirect** per post:
  - a source code in the prefilled text;
  - bot filtering;
  - minimal logs;
  - a one-tap "סמנו פנייה" for the owner.
- **Coupon code per channel** and **"איך שמעתם עלינו"** as plan KPIs with a simple log in the app.
- **Business Profile:** the "add us as Manager" guide. Read Performance manually or by
  download until the API is approved.
- Keep the existing Facebook Login and Google read connections working.

### Phase 2 (social first; after Meta review)
- **Instagram Login as the default "לחבר את האינסטגרם"**, with Facebook Login as the
  optional "גם להשוות למתחרים".
- **Daily snapshot job** for IG account metrics, `online_followers`, media metrics, and
  Stories before 24 h.
- Plan features from §4.6: posting-time heatmap, pillar ranking, audience fit, and the
  no-website funnel.

### Phase 3 (website; after Google verification)
- **One Google sign-in:**
  1. List properties.
  2. If there are none, create the property and stream (plus the terms step if there is no account).
  3. Show the **`G-` ID with the platform guide** chosen by `detect_platform`.
  4. Rescan the site until the tag appears.
  5. Enable enhanced measurement and create key events (WhatsApp click, form).
  6. Verify Search Console through `ANALYTICS` and `sites.add`.
- **Meta pixel via the platform app** (Wix, Shopify, WordPress guides). Detect it; don't create it.
  Show it only to owners who advertise, or who will.
- Optional `ads_read` for campaign results.

### Phase 4 (on demand)
- TikTok Accounts API with daily snapshots (60-day window).
- The Business Profile API.
- GTM via the API for developer-built sites.
- WhatsApp coexistence (Tech Provider).

---

## 8. Explanation copy for the owner (Hebrew drafts, per `web/HEBREW-COPY.md`)

These use plural "אתם", infinitive buttons, no acronyms and no exclamation marks. We keep
the honesty lines.

| Integration | Draft |
|---|---|
| **Instagram (default)** | נכנסים עם האינסטגרם של העסק, בלי דף פייסבוק. נראה אילו פוסטים נשמרו ושותפו, כמה נכנסו לפרופיל, ובאילו שעות העוקבים שלכם באינסטגרם. אנחנו רק קוראים נתונים, לא מפרסמים ולא רואים הודעות. · Button: `לחבר את האינסטגרם` · If it's not a professional account: צריך חשבון עסקי או חשבון יוצר. מעבירים בהגדרות של אינסטגרם, בדקה. |
| **Facebook (optional)** | רוצים לראות מה עובד אצל עסקים דומים? חברו גם את דף הפייסבוק שמקושר לאינסטגרם. כך נראה כמה עוקבים ותגובות יש להם, מהמידע הפומבי בלבד, וגם את הנתונים של הסטוריז שלכם. · Button: `לחבר גם את פייסבוק` |
| **TikTok** | מחברים את הטיקטוק של העסק. נראה כמה צפו בכל סרטון, כמה צפו עד הסוף, ומאיפה הגיעו הצופים. צריך חשבון עסקי בטיקטוק. · Button: `לחבר את הטיקטוק` |
| **WhatsApp link (day 1)** | כל פוסט מקבל קישור וואטסאפ משלו. נדע כמה לחצו על כל קישור, וההודעה שהלקוח שולח תכלול קוד קצר, כך תדעו מאיזה פוסט הוא הגיע. לא נדע אם נסגרה עסקה, את זה תסמנו אתם. |
| **Site data: connect** | נכנסים עם חשבון הגוגל שרואה את נתוני האתר. נראה כמה אנשים הגיעו לאתר מכל פוסט ומה עשו שם. אנחנו רק קוראים נתונים, ולא מקבלים סיסמה. · Button: `לחבר את נתוני האתר` |
| **Site data: create when missing** | לאתר שלכם עוד אין נתוני אתר בגוגל. נפתח לכם חשבון בחינם, על שמכם, וניתן לכם קוד אחד להדביק בהגדרות האתר. זה לוקח 2 דקות. · Button: `לפתוח את נתוני האתר` · If there's no Google account: גוגל יבקש מכם לאשר את התנאים שלו. זה חלק מהפתיחה. |
| **Paste guide (Wix)** | בוויקס: לוח הבקרה › **Marketing Integrations** › **Google Tag** › **Connect**, ומדביקים את הקוד. אפשר רק באתר בתשלום עם דומיין משלכם. |
| **Google searches** | באותה כניסה לגוגל נראה גם מה אנשים חיפשו לפני שנכנסו לאתר, ובאיזה מקום אתם מופיעים. אם צריך, נאשר מול גוגל שהאתר שלכם, בלי לגעת באתר. |
| **Facebook's code on the site (pixel)** | כדי לדעת מי הגיע לאתר מפרסומת באינסטגרם או בפייסבוק, ומה עשה שם, צריך להוסיף לאתר את הקוד של פייסבוק. בוויקס ובשופיפיי זה חיבור של כמה לחיצות, ונראה לכם בדיוק איפה. · Only shown to owners who advertise. |
| **Business Profile in Google** | הכרטיס של העסק בגוגל מראה כמה ראו אתכם בחיפוש ובמפות, כמה התקשרו וכמה ביקשו הוראות הגעה. הוסיפו אותנו כמנהלים בכרטיס כדי שנוכל לקרוא את המספרים. אתם נשארים הבעלים, ואפשר להסיר אותנו מתי שתרצו. |
| **Coupon code** | קוד הנחה אחר לכל ערוץ, למשל אחד לאינסטגרם ואחד לוואטסאפ, מראה מאיפה הגיעו הקונים. |
| **"איך שמעתם עלינו"** | שאלה אחת לכל לקוח חדש: ״איך שמעתם עלינו?״. רק ככה אפשר לספור גם המלצות מפה לאוזן. רשמו את התשובה כאן, בלחיצה. |
| **Cookie consent** (after legal review) | אם באתר יש את הקוד של גוגל או של פייסבוק, כדאי להפעיל באנר הסכמה לעוגיות. בוויקס ובשופיפיי יש אחד מובנה. |
| **What we can't measure** | בלי נתוני אתר לא נדע מה קרה אחרי הכניסה לאתר. במקום זה נמדוד לחיצות לוואטסאפ, קודי הנחה ומה שהלקוחות מספרים לכם. |

---

## 9. Open risks
- **Google's 100-user lifetime cap** if we launch before verification. Testing mode's
  **7-day token expiry** breaks daily sync.
- **Meta access level for the current app is unknown.** If it's Standard, real owners can't
  connect today. Business Verification plus review is a 2–4 week path.
- **GBP API eligibility:** our own profile must be 60+ days old. The review can refuse.
- **TikTok Accounts API form:** approval time and Israel eligibility are unpublished.
- **Wix native Meta pixel is invisible in raw HTML** **(tested)**. Detection needs rendering
  or the owner's word.
- Whether Wix's injected `gtag` passes Search Console's `ANALYTICS` verification (not verified).
- **Retention windows force us to store history daily:**
  - IG account metrics: 90 days;
  - `online_followers`: 30 days;
  - Stories: 24 h;
  - TikTok: 60 days.

  A missed sync is lost data.
- Accounts under 100 followers get no demographics or online hours on IG or TikTok. Say "לא נמדד".
- **Privacy (Amendment 13 and the Feb 2026 consent position):** pixel consent and our
  redirect logs need legal review.
- The Page-insights deprecation date conflicts between Meta pages; re-check before relying
  on `*_impressions_unique`.
- WhatsApp: the only machine-readable "message sent" comes from coexistence (Tech Provider).
  Until then, chats are counted by the owner.
