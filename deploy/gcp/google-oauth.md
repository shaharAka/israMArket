# Google OAuth for IsraMarket (project `isramarket`)

One OAuth client covers two flows:

| Flow | Endpoint | Scopes | Google's class |
|---|---|---|---|
| **"להמשיך עם Google"** (sign in / sign up) | `GET /auth/google/start` → `/auth/google/callback` (`api/app/routers/auth.py`) | `openid` `email` `profile` | **Non-sensitive.** No verification needed to use them |
| **Site data** (Analytics + Search Console) | `GET /integrations/ga4/start` → `/integrations/ga4/callback` (`api/app/routers/integrations.py`) | `analytics.readonly`, `webmasters.readonly` (+ `openid` `email`) | **Sensitive.** Brand + sensitive-scope verification before public launch |

Sign-in stores nothing from Google except the account id (`sub`): no access or refresh
token. The site-data flow is **incremental**: it sends `login_hint` (the signed-in Google
account) and `include_granted_scopes=true`, so the owner sees their own account pre-selected
and only the new permissions. If they pick a different Google account, it is still connected,
and `/integrations` says which address it came from.

Nothing in this document creates cloud resources by script. Every step is a click in the
Console, done by a project owner.

---

## 1. Redirect URIs: all on the public web origin

In the documented deployment only the web tier is public; it proxies `/backend/*` to the API.
So Google must return the browser to the **web origin**, under `/backend`. That is also what
puts the session cookie on the origin the owner is using.

The API builds every Google redirect URI from `OAUTH_REDIRECT_BASE`, which defaults to
`{WEB_ORIGIN}/backend`:

| Environment | `WEB_ORIGIN` | Redirect URIs to register |
|---|---|---|
| Local dev (Next on :3000) | `http://localhost:3000` | `http://localhost:3000/backend/auth/google/callback`<br>`http://localhost:3000/backend/integrations/ga4/callback` |
| Local API only, no web proxy (optional) | set `OAUTH_REDIRECT_BASE=http://localhost:8000` | `http://localhost:8000/auth/google/callback`<br>`http://localhost:8000/integrations/ga4/callback` |
| First server (before a domain) | `https://<ip>.sslip.io` | `https://<ip>.sslip.io/backend/auth/google/callback`<br>`https://<ip>.sslip.io/backend/integrations/ga4/callback` |
| Production | `https://<domain>` | `https://<domain>/backend/auth/google/callback`<br>`https://<domain>/backend/integrations/ga4/callback` |

Rules Google enforces on these (from the Console's validation):
- The URI must match **exactly**: scheme, host, port, path, no trailing slash.
- `http://` is accepted only for `localhost`. Everything else must be `https://`.
- No raw IP addresses. `<ip>.sslip.io` is a hostname, so it is accepted as a URI.
- Changes can take a few minutes, occasionally hours, to apply.

`127.0.0.1:3000` is not listed on purpose. Open the dev app on `http://localhost:3000` when
testing Google, or add the `127.0.0.1` URIs as well.

> The Meta (Facebook/Instagram) redirect uses the same base:
> `{OAUTH_REDIRECT_BASE}/integrations/meta/callback` (dev: `http://localhost:3000/backend/integrations/meta/callback`).

---

## 2. Console steps

Console: https://console.cloud.google.com → project picker → **isramarket**.

### 2.1 APIs (only for the site-data flow)
APIs & Services → Library → enable:
- Google Analytics Data API
- Google Analytics Admin API
- Google Search Console API

Sign-in needs no API enabled.

### 2.2 Google Auth Platform: Branding
Menu → **Google Auth Platform** (older Consoles: APIs & Services → OAuth consent screen) →
**Get started** if the project has never had a consent screen.

1. **App name:** `IsraMarket`. Owners see it on Google's account picker.
2. **User support email:** a mailbox we own and read (a Google Group works). It is shown to
   owners on the consent screen.
3. **Audience:** **External**.
4. **Contact information:** the developer email that should receive Google's notices.
5. Accept the Google API Services User Data Policy → **Create**.

Later, before verification (not needed for testing):
- **App home page:** `https://<domain>/`
- **Privacy policy:** `https://<domain>/security` (or a dedicated privacy page), on the same
  verified domain.
- **Authorized domains:** `<domain>`. It must be a domain we can verify in Search Console.
  `sslip.io` cannot be verified by us, so the sslip.io origin is for testing only.
- A logo is optional. Uploading one triggers brand verification, so leave it until then.

### 2.3 Google Auth Platform: Audience
1. **Publishing status:** leave **Testing**.
2. **Test users → Add users:** the Google accounts that may sign in while in testing (the team
   and the design partners). Up to **100**.

In Testing, an account not on this list stops on Google's own "Access blocked" page and never
comes back to IsraMarket. Cancelling on Google's screen does come back, as
`google_error=cancelled`.

### 2.4 Google Auth Platform: Data Access
**Add or remove scopes**:
- Non-sensitive (sign-in): `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
- Sensitive (site data): `.../auth/analytics.readonly`, `.../auth/webmasters.readonly`.

Listing a sensitive scope here is what the verification review looks at. Add the future ones
from `docs/integrations-research.md` §6 in the same review (`analytics.edit`,
`siteverification.verify_only`, `webmasters`, `business.manage`), because each re-review
costs days.

### 2.5 Google Auth Platform: Clients
**Create client** → Application type **Web application** → name `IsraMarket web`.

**Authorized JavaScript origins.** The flows are server-side redirects, so Google does not
strictly need these. They are listed so a future client-side Google button also works:
- `http://localhost:3000`
- `http://localhost:8000`
- `https://<ip>.sslip.io`
- `https://<domain>`

**Authorized redirect URIs:** every row of the table in §1 for the environments in use:
- `http://localhost:3000/backend/auth/google/callback`
- `http://localhost:3000/backend/integrations/ga4/callback`
- `http://localhost:8000/auth/google/callback` (only with `OAUTH_REDIRECT_BASE=http://localhost:8000`)
- `http://localhost:8000/integrations/ga4/callback` (same)
- `https://<ip>.sslip.io/backend/auth/google/callback`
- `https://<ip>.sslip.io/backend/integrations/ga4/callback`
- `https://<domain>/backend/auth/google/callback`
- `https://<domain>/backend/integrations/ga4/callback`

**Create** → copy the **Client ID** and **Client secret**. The secret is shown in full only
once; download the JSON if you need it again. Store it as a secret, never in git.

### 2.6 Configure the API
```
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
WEB_ORIGIN=https://<domain>          # or https://<ip>.sslip.io, or http://localhost:3000
# OAUTH_REDIRECT_BASE=               # blank = WEB_ORIGIN + /backend
```
`JWT_SECRET` must be a real secret: it signs the session, the OAuth `state` and the
short-lived PKCE cookie.

### 2.7 Check it
1. `GET {WEB_ORIGIN}/backend/auth/google/start` should answer `303` to
   `accounts.google.com/...&scope=openid+email+profile&code_challenge_method=S256...`, with a
   `Set-Cookie: isramarket_google_login=...; HttpOnly`.
2. With a test user: `/login` → **להמשיך עם Google** → pick the account → back on `/dashboard`
   signed in. `/account` shows **מחובר עם Google**.
3. `redirect_uri_mismatch` on Google's page means §2.5 does not list the exact URI the API sent.
   Compare with the `redirect_uri` parameter in the Google URL from step 1.
4. `/integrations` → connect site data → Google pre-selects the same account and asks only
   for Analytics and Search Console.

---

## 3. Sensitive vs non-sensitive, and the 100-user cap

- **Sign-in scopes are non-sensitive.** `openid email profile` never needs sensitive-scope
  verification. On their own they could go to Production at any time without a user cap.
- **The site-data scopes are sensitive.** `analytics.readonly` and `webmasters.readonly`
  need brand verification plus sensitive-scope verification: the privacy policy and home page
  on our verified domain, a demo video, and a justification per scope. Lead time is 3–5
  business days per the developer page, and up to 10 per the Cloud FAQ. See
  `docs/integrations-research.md` §6.
- **The cap applies to the project, not to one flow.** Both flows share this client and
  project:
  - **Testing:** only listed test users (max 100) can sign in or connect. Refresh tokens for
    the sensitive scopes **expire after 7 days**, so a test user's site-data connection
    stops syncing weekly and must be reconnected. Sign-in is unaffected: it keeps no token.
  - **Production, unverified, with sensitive scopes requested:** owners see "Google hasn't
    verified this app", and the project is capped at **100 new users for its lifetime; the
    cap cannot be reset**.
- **Recommendation:** stay in **Testing** with design partners as test users until
  verification passes. Don't publish to Production just to open sign-in to everyone: the
  first 100 owners who connect site data would use up the lifetime cap.
- If sign-in must go public before verification, the clean option is a **second project**
  holding only the sign-in client, whose scopes are all non-sensitive. That needs its own
  `GOOGLE_CLIENT_ID` for sign-in. The code uses one client today.
