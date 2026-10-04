# IsraMarket on Google Cloud: first production deployment

This deploys one `e2-medium` VM in `me-west1-a` (Tel Aviv) running the stack in
Docker Compose. Caddy terminates HTTPS on port 443, Next.js serves the web app, and the
FastAPI API sits behind it on a private Docker network. SQLite and every image live on a
separate persistent disk, which is backed up to Cloud Storage every night. Secrets come
from Secret Manager.

**Status:** these are files only. Nothing in this folder has been run against the cloud.
Every `gcloud` command below creates or changes a billable resource unless it says
otherwise. Pass `--project isramarket` every time, because the default project on this
Mac is still `signal2-479711`.

```
internet ──80/443──▶ caddy ──edge net──▶ web (Next.js :3000) ──backend net──▶ api (FastAPI :8000)
                     (TLS)                /backend/* proxy                       SQLite + images
                                                                                 on /mnt/disks/data
```

| File | What it is |
|---|---|
| `startup.sh` | The VM's startup-script. It runs on every boot and is idempotent. It mounts or formats the data disk, adds swap, installs Docker and the Compose plugin, sets up log rotation, clones the repo on first boot, renders the env, installs the timers and runs `compose up -d`. |
| `render-env.sh` | Builds `/run/isramarket/app.env` from instance metadata (host, e-mail) plus Secret Manager. It derives `WEB_ORIGIN`, `API_ORIGIN` and `PUBLIC_BASE_URL` from one host name. |
| `docker-compose.prod.yml` | The production stack: `api`, `web` and `caddy`. Only Caddy publishes ports. |
| `Caddyfile` | HTTPS for `{$SITE_HOST}` and the reverse proxy to `web:3000`. |
| `backup.sh` | Nightly online SQLite backup plus a files tar, uploaded to GCS. |
| `backup-lifecycle.json` | The bucket rule that deletes backups older than 30 days. |
| `update.sh` | Deploys a new version: pull, build, pre-update DB backup, `up -d`, health gate, rollback hint. |
| `secrets.md` | Which secrets exist and how to create them. |

## Decisions (and why)

- **Debian 13 (`debian-13` from `debian-cloud`), not Container-Optimized OS.**
  - COS has a read-only root, and `/etc` is reset on every reboot, so the cron or timers
    would have to be re-created on each boot.
  - COS ships without the Compose plugin and without `gcloud` or `sqlite3` on the host.
    Backups and secret rendering would then need helper containers.
  - Debian gives `apt`, systemd timers, `sqlite3`, and the preinstalled `google-cloud-cli`.
    Security patches apply automatically through `unattended-upgrades`.
  - The price is that we patch the OS ourselves. `unattended-upgrades` handles Debian
    security updates, and a reboot picks up a new kernel.
  - Debian 13 ("trixie") is the current stable. Debian 12 is oldstable, and its regular
    security support ends one year after trixie's release. If `debian-13` is missing from
    the image list, use `debian-12`.
- **A separate 20 GB persistent disk for data, not the boot disk.**
  - The database, the images, local backup copies and Caddy's certificates live on
    `isramarket-data`, created with `auto-delete=no`.
  - You can delete and recreate the VM to change the OS, the machine type or the zone
    image without touching the data.
  - You can snapshot or resize the data disk on its own.
  - A full boot disk (Docker images and build cache) cannot corrupt the database.
  - It costs about $2.20/month.
  - The compose file refuses to start the API if the disk is not mounted
    (`create_host_path: false`, and the mountpoint is `chattr +i`). So a missing disk can
    never produce a silent, empty database on the boot disk.
- **A standalone `docker-compose.prod.yml`, not an override of the root compose file.**
  - Production changes ports, storage and the source of the environment.
  - Removing the root file's published `3000` port would need `!reset` tricks.
- **systemd timers instead of crontab.** They play the same role as cron, but:
  - `Persistent=true` runs a missed job after downtime;
  - `OnCalendar` takes `Asia/Jerusalem` directly, so the host can stay on UTC;
  - output goes to the journal (`journalctl -u isramarket-research`);
  - failures show in `systemctl --failed`.
- **Secrets are rendered at boot to tmpfs**, because the API reads plain env vars. See
  `secrets.md`, including where they remain visible.
- **HTTPS host = one variable.** It is the instance metadata key `site-host`. When it is
  empty, the host is `<external-ip-with-dashes>.sslip.io`. `WEB_ORIGIN`, `API_ORIGIN`,
  `PUBLIC_BASE_URL` and Caddy's certificate all follow from it.
- **OAuth callbacks go through the web origin.**
  - The API builds every redirect URI from `WEB_ORIGIN` + `/backend` (`OAUTH_REDIRECT_BASE`
    overrides it): Google sign-in, GA4 and Meta.
  - Only the web tier is public, so the callbacks go through the existing Next.js
    `/backend/*` proxy.
  - The API's `API_ORIGIN` (`https://<host>/backend`) is no longer used for OAuth. The web
    container's own `API_ORIGIN` is the internal `http://api:8000`.
- **`TRUST_FORWARDED_FOR=true` is safe here.**
  - Caddy faces the internet directly. It ignores any client-sent `X-Forwarded-For` and
    sets it to the real peer address.
  - Next.js passes that header through, and the API is on the private network only.
- **Only 80/443 are open.** The VPC is custom with an implied deny on ingress. SSH is
  allowed only from Google's IAP range (`35.235.240.0/20`), with OS Login. Ports 8000 and
  3000 are never published.

## Monthly cost estimate (me-west1)

Source: the **Google Cloud Billing Catalog API** (`cloudbilling.googleapis.com/v1/services/*/skus`,
USD, list prices). Pulled **2026-09-30**, with `effectiveTime` 2026-09-30. A month is 730 h.

| Item | SKU (me-west1 unless noted) | Unit price | Quantity | $/month |
|---|---|---|---|---|
| VM `e2-medium` (billed as 1 vCPU + 4 GB) | E2 Instance Core running in Israel / E2 Instance Ram running in Israel | $0.023993/vCPU-h + $0.003216/GB-h = $0.036857/h | 730 h | **26.91** |
| Boot disk | Balanced PD Capacity in Israel | $0.11/GB-mo | 30 GB | 3.30 |
| Data disk | Balanced PD Capacity in Israel | $0.11/GB-mo | 20 GB | 2.20 |
| Static external IPv4, in use | External IP Charge on a Standard VM (global) | $0.005/h | 730 h | 3.65 |
| Internet egress | Network Internet Data Transfer Out from Israel to EMEA / Middle East | $0.15/GB (first TB) | ~10 GB early on | ~1.50 |
| Backups | Standard Storage Tel Aviv | $0.021/GB-mo | ~30 nightly copies × ~0.5 GB ≈ 15 GB | ~0.32 |
| Backup operations | Regional Standard Class A | $0.005 per 1,000 after 5,000 free | ~100 | 0.00 |
| Secret Manager | Secret version replica storage | $0.06/version after 6 free | 8 versions | 0.12 |
| Uptime check (optional, step 12) | Monitoring Uptime Checks | free up to 1M executions | ~52k | 0.00 |
| **Total** | | | | **≈ $38/month** |

Notes:
- **Not included: Gemini/Meta API usage.** That is the real variable cost. See "Cost note"
  in `DEPLOY.md`: images default to `gemini-3-pro-image` at 2K.
- E2 gets no sustained-use discount. A 1-year committed-use discount lowers the VM line
  (check the CUD rate on the pricing page). Decide once traffic is known.
- The catalog lists a 0–720 h tier at $0 for "External IP Charge on a Standard VM". That
  looks like the free-tier allowance, which applies only to the free-tier e2-micro in US
  regions. It is budgeted at full price here.
- Backups grow with the images: each night is a full copy of the files (see open
  decisions). 5 GB of images would be 30 × 5 GB ≈ $3.15/month.
- An unattached reserved IP costs $0.011/h ($8/month). Release it if you tear the VM down.
- Optional daily snapshot schedule (step 8b): Storage PD Snapshot in Israel at
  $0.0286/GB-mo, incremental. That is well under $1 for this disk.

## Step by step

Run these from the repo root on your Mac. The `gcloud` CLI must be logged in as the owner
of `isramarket`.

### 0. Shell variables (local only, free)

```bash
PROJECT=isramarket
REGION=me-west1
ZONE=me-west1-a
SA=isramarket-vm@isramarket.iam.gserviceaccount.com
BUCKET=isramarket-backups-952298804970      # globally unique: the project number as a suffix
ACME_EMAIL=you@example.com                  # Let's Encrypt expiry notices (replace)
REPO_REF=main                               # branch deployed on first boot (see open decisions)
```

### 1. Enable the APIs (free)

Compute and Secret Manager are already on. Storage is needed for backups, and IAP for SSH
without a public port 22.

```bash
gcloud services enable compute.googleapis.com secretmanager.googleapis.com \
  storage.googleapis.com iap.googleapis.com --project $PROJECT
```

### 2. Set a budget alert (recommended, done by the owner in the console)

Billing > Budgets & alerts > budget on project `isramarket`, for example $60 with alerts
at 50/90/100%. It costs nothing. It is left to you on purpose: nothing in this folder
touches billing.

### 3. Service account for the VM (free)

It is the VM's only identity. It can read the secrets (secrets.md step 4) and create and
read backup objects (step 7). It has no project-wide roles.

```bash
gcloud iam service-accounts create isramarket-vm --project $PROJECT \
  --display-name="IsraMarket VM (secrets read, backups write)"
```

### 4. Secrets (≈ $0.12/month, ≈ $0.30 with PayPal)

Follow `deploy/gcp/secrets.md`: create the secrets, add their values, and grant
`secretAccessor` to `$SA`. The three PayPal secrets are optional; see step 14.

### 5. Network and firewall (free: VPC, subnet and rules cost nothing)

A dedicated VPC starts with deny-all ingress. It never inherits the `default` network's
`0.0.0.0/0` SSH and RDP rules.

```bash
# The VPC, custom mode (we choose the subnets).
gcloud compute networks create isramarket-vpc --project $PROJECT --subnet-mode=custom

# One subnet in Tel Aviv.
gcloud compute networks subnets create isramarket-me-west1 --project $PROJECT \
  --network=isramarket-vpc --region=$REGION --range=10.20.0.0/24

# HTTP(S) from anywhere: Caddy, plus the ACME challenges and HTTP/3 (udp/443).
gcloud compute firewall-rules create isramarket-allow-web --project $PROJECT \
  --network=isramarket-vpc --direction=INGRESS --action=ALLOW \
  --rules=tcp:80,tcp:443,udp:443 --source-ranges=0.0.0.0/0 --target-tags=isramarket-web

# SSH only through Identity-Aware Proxy (Google's range), never from the internet.
gcloud compute firewall-rules create isramarket-allow-iap-ssh --project $PROJECT \
  --network=isramarket-vpc --direction=INGRESS --action=ALLOW \
  --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=isramarket-web
```

### 6. Static external IP (≈ $3.65/month while attached, $8/month if left unattached)

The sslip.io host name is built from this IP, so it must not change when the VM restarts.

```bash
gcloud compute addresses create isramarket-ip --project $PROJECT --region=$REGION --network-tier=PREMIUM

# Read-only: prints the IP and the resulting host name.
IP=$(gcloud compute addresses describe isramarket-ip --project $PROJECT --region=$REGION --format='value(address)')
HOST="${IP//./-}.sslip.io"; echo "$IP  ->  https://$HOST"
```

### 7. Backup bucket (≈ $0.30/month at first)

```bash
# Regional bucket in Tel Aviv, no public access possible.
gcloud storage buckets create gs://$BUCKET --project $PROJECT --location=$REGION \
  --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention

# Delete backups older than 30 days.
gcloud storage buckets update gs://$BUCKET --project $PROJECT \
  --lifecycle-file=deploy/gcp/backup-lifecycle.json

# The VM may add and read backups, but not delete or overwrite them (a compromised VM
# cannot wipe its own backups). Soft delete, the bucket default of 7 days, adds a
# second safety net.
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --project $PROJECT \
  --member=serviceAccount:$SA --role=roles/storage.objectCreator
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --project $PROJECT \
  --member=serviceAccount:$SA --role=roles/storage.objectViewer
```

### 8. Data disk (≈ $2.20/month)

```bash
gcloud compute disks create isramarket-data --project $PROJECT --zone=$ZONE \
  --size=20GB --type=pd-balanced
```

8b (optional, under $1/month). A daily snapshot of the whole data disk, kept 7 days. It
restores faster than the GCS backups for "the disk is gone" cases.

```bash
gcloud compute resource-policies create snapshot-schedule isramarket-data-daily --project $PROJECT \
  --region=$REGION --daily-schedule --start-time=00:30 --max-retention-days=7 \
  --on-source-disk-delete=keep-auto-snapshots --storage-location=$REGION
gcloud compute disks add-resource-policies isramarket-data --project $PROJECT --zone=$ZONE \
  --resource-policies=isramarket-data-daily
```

### 9. The VM (≈ $26.91/month plus the boot disk, $3.30/month)

Optional and read-only: confirm the image family exists.
`gcloud compute images describe-from-family debian-13 --project debian-cloud --format='value(name)'`

```bash
gcloud compute instances create isramarket-vm --project $PROJECT --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=debian-13 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --disk=name=isramarket-data,device-name=isramarket-data,mode=rw,boot=no,auto-delete=no \
  --subnet=isramarket-me-west1 --address=isramarket-ip --tags=isramarket-web \
  --service-account=$SA --scopes=cloud-platform \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
  --deletion-protection \
  --metadata=enable-oslogin=TRUE,acme-email=$ACME_EMAIL,backup-bucket=$BUCKET,repo-ref=$REPO_REF \
  --metadata-from-file=startup-script=deploy/gcp/startup.sh
```

- `device-name=isramarket-data` is what `startup.sh` looks for
  (`/dev/disk/by-id/google-isramarket-data`).
- `--scopes=cloud-platform` hands access control to IAM. The service account itself holds
  only the roles granted above.
- `site-host` is left out on purpose, which gives the sslip.io host. See "Switch to a real
  domain".

### 10. Watch the first boot (free)

The first boot installs Docker and builds both images, which takes about 5–10 minutes.

```bash
# Read-only: the startup script's progress lines.
gcloud compute instances get-serial-port-output isramarket-vm --project $PROJECT --zone=$ZONE \
  | grep -E 'isramarket-startup|render-env|startup-script'

# Or live, on the VM (SSH through IAP with OS Login):
gcloud compute ssh isramarket-vm --project $PROJECT --zone=$ZONE --tunnel-through-iap \
  --command 'sudo journalctl -u google-startup-scripts.service -f'
```

### 11. Verify (free)

```bash
curl -fsS "https://$HOST/backend/health"          # {"ok":true,"gemini":true,...}
curl -sI "http://$HOST/" | head -1                 # 308 -> https
curl -sI "https://$HOST/" | grep -i strict-transport
nc -vz -w 3 "$IP" 8000; nc -vz -w 3 "$IP" 3000    # both must FAIL (not reachable)

gcloud compute ssh isramarket-vm --project $PROJECT --zone=$ZONE --tunnel-through-iap --command '
  sudo isramarket-compose ps
  systemctl list-timers "isramarket-*"
  sudo systemctl start isramarket-backup.service && sudo journalctl -u isramarket-backup -n 5 --no-pager
  sudo isramarket-compose exec -T api python -m app.jobs.weekly_research --dry-run'
gcloud storage ls -r "gs://$BUCKET/nightly/" --project $PROJECT | tail -3
```

Then go through the "Before you call it live" checklist in `DEPLOY.md`.

### 12. Uptime check (optional, free at this volume)

```bash
gcloud monitoring uptime create isramarket-health --project $PROJECT \
  --resource-type=uptime-url --resource-labels=host=$HOST,project_id=$PROJECT \
  --protocol=https --path=/backend/health --period=5
```

Add an e-mail notification channel and an alert policy on it in the console
(Monitoring > Uptime checks). If this gcloud version names a flag differently, check it
with `gcloud monitoring uptime create --help`.

### 13. OAuth redirect URIs (in the Google and Meta consoles)

With `HOST` as above, or the real domain later:

| Provider | Setting | Value |
|---|---|---|
| Google (APIs & Services > Credentials > OAuth client, "Web application") | Authorized JavaScript origins | `https://$HOST` |
| | Authorized redirect URIs | `https://$HOST/backend/integrations/ga4/callback` |
| | | `https://$HOST/backend/auth/google/callback` (Google sign-in) |
| Meta (App > Facebook Login > Settings) | Valid OAuth Redirect URIs | `https://$HOST/backend/integrations/meta/callback` |
| Meta (App settings > Basic) | App domains / Site URL | `$HOST` / `https://$HOST/` |
| | Privacy Policy URL, **Terms of Service URL**, User data deletion | pages on `https://$HOST/` (`/security`, `/terms`, `/security#delete`) |

- **Why `/backend/...`.** The API builds every redirect URI as
  `{OAUTH_REDIRECT_BASE}/...`, and a blank `OAUTH_REDIRECT_BASE` means `{WEB_ORIGIN}/backend`
  (`Settings.oauth_callback_base`). The provider sends the browser there, Next.js proxies
  it to the API, and the API redirects back to the web app. Full console checklist:
  `deploy/gcp/google-oauth.md`.
- **sslip.io and Google.**
  - `sslip.io` is **not** on the Public Suffix List (checked 2026-09-30), so the
    "authorized domain" for the consent screen would be `sslip.io` itself, which we
    cannot verify.
  - That is fine for an OAuth app in **Testing** mode: at most 100 test users, whose
    refresh tokens expire after 7 days.
  - Brand and scope verification (docs/integrations-research.md §6) needs the real,
    verified domain.

### 14. PayPal subscriptions (optional; free to set up)

Until this is done, `/billing` says payment is not open yet and nothing is charged or
enforced. The owner's checklist, sandbox first, is `docs/billing.md`. In short:

1. Secrets `paypal-client-id`, `paypal-client-secret`, `paypal-webhook-id` (secrets.md).
2. `/etc/isramarket/extra.env` on the VM:
   ```
   PAYPAL_ENV=sandbox
   PAYPAL_PLAN_ID=P-...
   BILLING_ENFORCE=false
   ```
   The plan id comes from `sudo isramarket-compose exec api python -m app.jobs.paypal_setup`
   (run it once per environment; `--dry-run` first shows what it will create).
3. The webhook, in developer.paypal.com > the app > Webhooks > Add webhook:

   | Setting | Value |
   |---|---|
   | Webhook URL | `https://$HOST/backend/billing/paypal/webhook` |
   | Events | `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED` |

   Its Webhook ID is the `paypal-webhook-id` secret. The Next.js proxy forwards the raw
   body and the `PAYPAL-*` headers unchanged, and the API's origin check skips exactly
   this path; every delivery is verified with PayPal before it is read.
4. `sudo /srv/isramarket/deploy/gcp/update.sh --recreate`.

## Day 2

All of these run on the VM. Open a shell there with:
`gcloud compute ssh isramarket-vm --project isramarket --zone me-west1-a --tunnel-through-iap`

| Task | Command |
|---|---|
| Deploy the latest `repo-ref` | `sudo /srv/isramarket/deploy/gcp/update.sh` |
| Deploy a branch or commit | `sudo /srv/isramarket/deploy/gcp/update.sh ux-simplification` |
| Roll back | `sudo /srv/isramarket/deploy/gcp/update.sh <previous-sha>` (printed by every run) |
| Status | `sudo isramarket-compose ps` |
| Logs | `sudo isramarket-compose logs -f --tail=200 api` (web, caddy) |
| Run research now | `sudo systemctl start isramarket-research.service; journalctl -u isramarket-research -f` |
| Back up now | `sudo systemctl start isramarket-backup.service` |
| Timers | `systemctl list-timers 'isramarket-*'` |
| Non-secret tunables | edit `/etc/isramarket/extra.env` (e.g. `GEMINI_IMAGE_SIZE=1K`), then `sudo /srv/isramarket/deploy/gcp/update.sh --recreate` |
| A changed `startup.sh` | from the Mac: `gcloud compute instances add-metadata isramarket-vm --project isramarket --zone me-west1-a --metadata-from-file startup-script=deploy/gcp/startup.sh` |

From the Mac in one line:
`gcloud compute ssh isramarket-vm --project isramarket --zone me-west1-a --tunnel-through-iap --command 'sudo /srv/isramarket/deploy/gcp/update.sh'`

**Downtime during an update.** The images are built while the old containers keep
serving. `compose up -d` then swaps only what changed, with a few seconds per container.
Caddy holds requests for up to 30 s while `web` restarts. Requests that reach the API
during its restart of about 5–10 s fail and have to be retried by the user. A month
being generated resumes from its saved stage on API startup. Migrations run at API
startup, so every update first takes a DB-only backup to `gs://$BUCKET/pre-update/`.

**Logs.**
- Each container's logs rotate at 5 × 10 MB (json-file, set in compose and in
  `daemon.json`).
- The journal is capped at 500 MB and 30 days.
- Caddy writes **no access log** on purpose. It would record every visitor's IP,
  including taps on WhatsApp tracked links.

### Switch to a real domain

Use two stages so the new certificate works before the application origin changes.
Deploy the reviewed alias-support revision first. Record the current revision, `site-host`,
`site-aliases`, any explicit `public-base-url`, and provider URL settings for rollback.

1. Point both the apex and `www` A records to the VM IP and confirm both resolve publicly.
   A registry `serverHold` must be resolved with the registrar; changing an A record alone
   cannot activate the domain. Keep the transfer lock enabled.
2. Keep the current canonical host and add the new names as aliases:
   ```bash
   gcloud compute instances add-metadata isramarket-vm --project isramarket --zone me-west1-a \
     --metadata 'site-aliases=isramarket.co.il www.isramarket.co.il'
   gcloud compute ssh isramarket-vm --project isramarket --zone me-west1-a --tunnel-through-iap \
     --command 'sudo /srv/isramarket/deploy/gcp/update.sh <reviewed-sha>'
   ```
   Caddy obtains certificates for every host. Verify TLS for both new names and verify
   their redirects to the still-active old host, including paths and queries. Do not
   proceed if certificate verification fails.
3. Add the new HTTPS origin and callback URLs to Google and Meta (step 13), retaining
   old URLs during the transition. Only use the verified new host for policy URLs.
4. Switch the canonical host and retain the apex and old host as aliases:
   ```bash
   gcloud compute instances add-metadata isramarket-vm --project isramarket --zone me-west1-a \
     --metadata 'site-host=www.isramarket.co.il,site-aliases=isramarket.co.il 34-165-93-157.sslip.io'
   gcloud compute ssh isramarket-vm --project isramarket --zone me-west1-a --tunnel-through-iap \
     --command 'sudo /srv/isramarket/deploy/gcp/update.sh <reviewed-sha> --recreate'
   ```
   Use the VM's actual old host. `WEB_ORIGIN`, `API_ORIGIN` and the default `PUBLIC_BASE_URL`
   follow `site-host`. Update any explicit `public-base-url` or extra-environment origin
   override in the same rollout.
5. Verify public policies, health, sign-in and each integration on the new host. Verify
   aliases return 308 and preserve the path/query. Users sign in again because their
   session cookie belongs to the previous host; database integration grants remain.
   Retry sign-ins interrupted by migration.

For rollback, restore the recorded metadata/origin overrides, keeping the new names as
aliases to the old canonical host, then run the reviewed alias-support revision with
`--recreate`. Recheck TLS, health and OAuth redirects. Rolling code back alone does not
restore the origin: environment values are rendered from metadata on every update.
Old provider callback entries must remain allowlisted until the rollback window closes.

### Restore from a backup

Backups live at `gs://$BUCKET/{nightly,pre-update}/<YYYY-MM-DD>/<timestamp>/`. Each one
holds `isramarket.db.gz` and `SHA256SUMS`. Nightly backups also have `files.tar`: the
images and everything else under `/app/data` except the database.

After each successful upload, local snapshots expire at 30 days across all prefixes,
including interrupted copies; the current prefix also keeps at most three completed
copies. In Cloud Storage,
the 30-day lifecycle rule schedules deletion, then deleted objects remain recoverable
for another seven days under soft delete. Lifecycle processing is automatic, so this is
not a guarantee of permanent erasure on day 30. See [lifecycle deletion](https://docs.cloud.google.com/storage/docs/lifecycle#delete)
and [soft delete](https://docs.cloud.google.com/storage/docs/soft-delete).

```bash
# On the VM, as root (sudo -i).
BUCKET=$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/attributes/backup-bucket)
gcloud storage ls "gs://$BUCKET/nightly/"                  # pick a day, then a timestamp
SRC=gs://$BUCKET/nightly/2026-10-01/20261001T001512Z       # <- the one you picked

# 1. Download and check.
mkdir -p /mnt/disks/data/restore && cd /mnt/disks/data/restore
gcloud storage cp "$SRC/*" .
sha256sum -c SHA256SUMS
gunzip -k isramarket.db.gz && sqlite3 isramarket.db 'PRAGMA integrity_check;'   # must print: ok

# 2. Stop the app (Caddy stays up and holds requests).
isramarket-compose stop web api

# 3. Keep the current data aside. Never delete it before the restore is confirmed.
mv /mnt/disks/data/api "/mnt/disks/data/api.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir /mnt/disks/data/api
tar -xf files.tar -C /mnt/disks/data/api              # skip for a pre-update (DB-only) backup
                                                      # and copy generated/ from the aside dir instead
cp isramarket.db /mnt/disks/data/api/isramarket.db
chown -R 10001:10001 /mnt/disks/data/api

# 4. Start and check.
isramarket-compose up -d
curl -fsS --resolve "$(sed -n "s/^SITE_HOST='\(.*\)'$/\1/p" /run/isramarket/app.env):443:127.0.0.1" \
  "https://$(sed -n "s/^SITE_HOST='\(.*\)'$/\1/p" /run/isramarket/app.env)/backend/health"

# 5. Once the app looks right, clean up: rm -rf /mnt/disks/data/restore (keep api.before-restore-* a few days).
```

- **Restoring onto a new VM.** Attach the existing `isramarket-data` disk, or create a new
  empty one, then create the VM with the step 9 command. After the first boot, run the
  steps above.
- **Losing the token encryption key** makes the stored GA4/Meta tokens in any backup
  unreadable. Keep `token-encryption-key` (secrets.md).

### Troubleshooting

- **No certificate.** Look at `sudo isramarket-compose logs caddy`.
  - Ports 80/443 must be reachable (step 5), and `$HOST` must resolve to `$IP`.
  - Let's Encrypt applies its limits per registered domain, and for sslip.io that one
    domain is shared by every sslip.io user. When Let's Encrypt refuses, Caddy falls back
    to ZeroSSL on its own. A real domain removes the problem.
- **The API will not start: "bind source path does not exist".** The data disk is not
  mounted. Check with `mountpoint /mnt/disks/data` and `lsblk`. Never create the
  directory by hand on the boot disk.
- **render-env fails.** A required secret is missing, or the service account lacks
  `secretAccessor` (secrets.md step 4). Nothing restarts until that is fixed.
- **Backup upload 403.** Check the two bucket bindings in step 7. If the error names
  `storage.buckets.get`, also grant `roles/storage.bucketViewer` on the bucket.
- **The build runs out of memory.** 2 GB of swap is set up, and `next build` fits in
  e2-medium with it. If a build still dies, stop `web` during the build or build one
  service at a time (`isramarket-compose build api`).

## Open decisions

1. **Which branch goes live.** `main` does not yet have the `ux-simplification` work
   (PR #2 pending). Set `REPO_REF=ux-simplification` in step 0 until it merges, then run
   `update.sh main`.
2. **The ACME e-mail** for Let's Encrypt expiry notices (step 0).
3. **When to move to the real domain.**
   - Register `isramarket.co.il` before owners post WhatsApp links, because printed links
     keep their origin.
   - Also register it before Google OAuth verification, which cannot pass on sslip.io.
   - Also before the sslip.io certificate limit bites.
4. **Terms page.** Done: `/terms` (plus `/security` and `/security#delete`) for Meta.
5. **OAuth redirect base.** Done: Google sign-in, GA4 and Meta all use `OAUTH_REDIRECT_BASE`.
6. **Media backup growth.** Every night uploads a full `files.tar`. Once the images pass a
   few GB, switch the files part to an incremental `gcloud storage rsync` into a
   versioned prefix.
7. **Monitoring.**
   - Step 12 is optional.
   - The Ops Agent is not installed, so there are no memory or disk metrics beyond the
     VM defaults.
   - Add it if you want disk-full alerts. Its logging cost is inside the free 50 GB.
8. **Public repository.** The VM clones `github.com/shaharAka/israMArket` anonymously. If
   the repo becomes private, add a read-only deploy key as a secret and switch
   `repo-url` to SSH.
9. **Later: Cloud Run.** This needs Postgres plus object storage first (see `DEPLOY.md`).
