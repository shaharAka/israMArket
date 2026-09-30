# Deploying IsraMarket

Read this before picking a host. The architecture constrains where this can run.

## The constraint that decides everything

**The API is stateful.** It keeps its data in SQLite (`api/data/isramarket.db`) and
writes every generated card image to `api/data/generated/`. Both live on the same
filesystem.

That means:

- **One instance only.** Two API containers cannot share a SQLite file safely over a
  network volume. Do not put this behind an autoscaling group.
- **The volume is the product.** If `api/data` is ephemeral, every restart destroys
  customer accounts, strategies and artwork.
- **Serverless does not work as-is.** Vercel/Lambda-style hosting gives you an
  ephemeral, per-invocation filesystem. The web tier can go there; the API cannot
  without first moving to Postgres and object storage.

If you need more than one instance, the migration order is: Postgres for the database,
then S3-compatible object storage for `generated/`, then the API becomes stateless.

## Recommended first deployment

On Google Cloud (one e2-medium VM in me-west1, Caddy HTTPS, Secret Manager, nightly GCS
backups), follow [`deploy/gcp/README.md`](deploy/gcp/README.md). The generic version:

One small VM running `docker-compose.yml`. Only the web tier publishes a port.

```bash
cp .env.example .env
# Fill in .env — see below.
docker compose up -d --build
```

`docker-compose.yml` deliberately keeps the API off the public network. That is not
cosmetic: the rate limiter trusts `X-Forwarded-For` (correct behind the Next.js proxy,
spoofable if the API is directly reachable), and the API's own docs are disabled in
production but it still has no TLS of its own.

## Required environment

| Variable | Why it matters |
|---|---|
| `JWT_SECRET` | Signs sessions. **The API refuses to boot with the default when `ENVIRONMENT=production`.** |
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored GA4/Meta OAuth tokens. Without it the key is derived from `JWT_SECRET` — acceptable only because a real `JWT_SECRET` is now mandatory. Rotating `JWT_SECRET` without setting this will make existing stored tokens undecryptable. |
| `GEMINI_API_KEY` | Strategy, extraction and image generation. |
| `WEB_ORIGIN` | Must be the browser-facing origin **including scheme**. It is used for OAuth redirects *and* the CSRF origin check, so a mismatch makes the connect buttons fail. |
| `API_ORIGIN` | Where the web tier proxies. Must match the registered OAuth redirect URI (`{API_ORIGIN}/integrations/ga4/callback`). |
| `PUBLIC_BASE_URL` | Optional. The origin printed on every WhatsApp tracked link, `{PUBLIC_BASE_URL}/r/{code}`. Blank means `WEB_ORIGIN`: only the web tier is public, and `web/app/r/[code]/route.ts` forwards `/r/{code}` to the API (not `API_ORIGIN`, which is an internal address in this compose file). **Set the final domain before owners post links**: a link already in an Instagram bio keeps pointing at the old origin. |

Generate secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"                       # JWT_SECRET
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"  # TOKEN_ENCRYPTION_KEY
```

## TLS

Terminate TLS at a reverse proxy (Caddy, nginx, or your platform's load balancer) in
front of the web tier, and set `WEB_ORIGIN` to the `https://` origin. The session cookie
sets `Secure` automatically once `WEB_ORIGIN` is https.

## Backups

Back up the `api-data` volume. It holds the SQLite database and every generated image;
there is no other copy. A plain file copy is consistent enough for SQLite if the API is
stopped, or use `sqlite3 isramarket.db ".backup"` for an online copy.

## Weekly research job

The ongoing research (competitors, Google searches, the Israeli calendar, the business's
own results and site — see `api/app/services/research.py`) runs once a week per business.
There is no scheduler inside the API; call the job from cron on the host:

```bash
# Sundays 06:00 (host time). Skips any business researched in the last 6 days.
0 6 * * 0  cd /srv/isramarket && docker compose exec -T api python -m app.jobs.weekly_research >> /var/log/isramarket-research.log 2>&1
```

Locally: `cd api && .venv/bin/python -m app.jobs.weekly_research` (`--business-id 1`,
`--force`, `--dry-run`). Each run makes one strategy-model call per business, a few Google
autocomplete requests and one small homepage read per site. Scheduled runs do not use the
owner's 3 manual runs a day (`POST /research/run`). Exit code 1 means at least one business
failed; the others still ran.

## Cost note

Image generation defaults to `gemini-3-pro-image` at 2K — roughly 20-30s and the
expensive tier per image. `REAL_PHOTO_FIRST=true` means most cards reuse the
business's own scraped photograph and cost nothing. Set
`GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image` and `GEMINI_IMAGE_SIZE=1K` to cut cost
and latency at a visible quality cost.

Nothing in the app generates an image while browsing — only an explicit click does.

## Before you call it live

- [ ] `ENVIRONMENT=production` set (otherwise the default-secret guard is inactive).
- [ ] `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` set to real random values.
- [ ] `WEB_ORIGIN` is the real https origin.
- [ ] GA4/Meta apps configured with redirect URIs pointing at your real `API_ORIGIN`.
- [ ] `api-data` volume mounted and covered by backups.
- [ ] Only the web port published.
- [ ] `curl -fsS https://your-host/backend/health` returns `{"ok":true,...}`.
