# IsraMarket secrets (Secret Manager)

Commands only. Nothing here has been run. Run them from your Mac with `gcloud`
authenticated as the project owner. Always pass `--project isramarket`, because the
default project on this Mac is still `signal2-479711`.

## What exists and where it goes

`deploy/gcp/render-env.sh` reads these on the VM at every boot and before every
`update.sh`. It writes them to `/run/isramarket/app.env` (tmpfs, mode 0600), and the API
container gets them from there. The web and Caddy containers never see them.

| Secret Manager name | Env var in the API | Required | What it is / how to get it |
|---|---|---|---|
| `gemini-api-key` | `GEMINI_API_KEY` | **yes** | The Gemini API key for strategy, extraction and images. Prefer a key created in project `isramarket` (APIs & Services > Credentials), restricted to the Generative Language API. |
| `jwt-secret` | `JWT_SECRET` | **yes** | Signs sessions. Generate it (below). The API refuses to boot in production with the default. Rotating it logs everyone out. |
| `token-encryption-key` | `TOKEN_ENCRYPTION_KEY` | **yes** | A Fernet key that encrypts the stored GA4/Meta OAuth tokens. Generate it (below). **Never rotate it casually:** tokens stored under the old key become undecryptable and every owner has to reconnect. Keep an offline copy. |
| `google-client-id` | `GOOGLE_CLIENT_ID` | no | OAuth client (type "Web application") in project `isramarket`. Needed for GA4/Search Console connect and, later, Google sign-in. |
| `google-client-secret` | `GOOGLE_CLIENT_SECRET` | no | Same client. |
| `meta-app-id` | `META_APP_ID` | no | Meta app > App settings > Basic. |
| `meta-app-secret` | `META_APP_SECRET` | no | Same page. |
| `meta-model-api-key` | `META_MODEL_API_KEY` | no | The Muse Spark experiment. It only has an effect if `POST_MODEL=muse-spark` is also set in `/etc/isramarket/extra.env` on the VM. |
| `paypal-client-id` | `PAYPAL_CLIENT_ID` | no | developer.paypal.com > Apps & Credentials > the app (Sandbox or Live, matching `PAYPAL_ENV`) > Client ID. Public by design (the browser's PayPal buttons use it), kept here with its secret so they rotate together. |
| `paypal-client-secret` | `PAYPAL_CLIENT_SECRET` | no | Same page > Secret. |
| `paypal-webhook-id` | `PAYPAL_WEBHOOK_ID` | no | Same app > Webhooks > the webhook for `https://<host>/backend/billing/paypal/webhook` > Webhook ID. Without it every webhook is refused (503). |

PayPal's non-secret settings go in `/etc/isramarket/extra.env` on the VM, not here:
`PAYPAL_ENV=sandbox` (or `live`), `PAYPAL_PLAN_ID=P-…` (printed by
`python -m app.jobs.paypal_setup`), and `BILLING_ENFORCE=false` until you decide to gate
generation. Sandbox and live have different client ids, secrets, plans and webhooks:
switching `PAYPAL_ENV` means replacing all four values. The full checklist is
`docs/billing.md`.

A missing optional secret renders as blank, and that integration then reports "not
configured". A missing required secret stops the render, so the old environment stays
in place and nothing restarts on bad config.

## 0. Variables used below

```bash
PROJECT=isramarket
SA=isramarket-vm@isramarket.iam.gserviceaccount.com   # created in README step 3
```

## 1. Generate the two app secrets locally

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))" > /tmp/jwt-secret
python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())" > /tmp/token-encryption-key
```

## 2. Create the secrets

Replication is pinned to `me-west1`, so the data stays in Israel and each version is
billed for one location.

```bash
for name in gemini-api-key jwt-secret token-encryption-key \
            google-client-id google-client-secret meta-app-id meta-app-secret meta-model-api-key \
            paypal-client-id paypal-client-secret paypal-webhook-id; do
  gcloud secrets create "$name" --project "$PROJECT" \
    --replication-policy=user-managed --locations=me-west1 \
    --labels=app=isramarket
done
```

## 3. Add the values (one version each)

Write each value from a file or from stdin, never as a command-line argument, so it does
not land in shell history. `printf %s` / `tr -d '\n'` drops the trailing newline.
`render-env.sh` refuses any value that contains a quote or a newline.

```bash
tr -d '\n' < /tmp/jwt-secret            | gcloud secrets versions add jwt-secret           --project "$PROJECT" --data-file=-
tr -d '\n' < /tmp/token-encryption-key  | gcloud secrets versions add token-encryption-key --project "$PROJECT" --data-file=-

# Each line waits for you to paste the value and press Enter (it is not echoed):
read -rs v && printf %s "$v" | gcloud secrets versions add gemini-api-key       --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add google-client-id     --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add google-client-secret --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add meta-app-id          --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add meta-app-secret      --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add meta-model-api-key   --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add paypal-client-id     --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add paypal-client-secret --project "$PROJECT" --data-file=- ; unset v
read -rs v && printf %s "$v" | gcloud secrets versions add paypal-webhook-id    --project "$PROJECT" --data-file=- ; unset v

# Keep an offline copy of the token encryption key (e.g. your password manager), then:
rm -P /tmp/jwt-secret /tmp/token-encryption-key
```

A secret with no version yet, such as Meta before the app exists, is treated as "not set".

## 4. Let only the VM's service account read them

```bash
for name in gemini-api-key jwt-secret token-encryption-key \
            google-client-id google-client-secret meta-app-id meta-app-secret meta-model-api-key \
            paypal-client-id paypal-client-secret paypal-webhook-id; do
  gcloud secrets add-iam-policy-binding "$name" --project "$PROJECT" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

## Rotating or changing a value

```bash
read -rs v && printf %s "$v" | gcloud secrets versions add meta-app-secret --project isramarket --data-file=- ; unset v
gcloud compute ssh isramarket-vm --zone me-west1-a --project isramarket --tunnel-through-iap \
  --command 'sudo /srv/isramarket/deploy/gcp/update.sh --recreate'
# then, once it works, disable the old version:
gcloud secrets versions list meta-app-secret --project isramarket
gcloud secrets versions disable <OLD_VERSION> --secret meta-app-secret --project isramarket
```

## Cost

Checked 2026-09-30 against the Cloud Billing Catalog (Secret Manager SKUs):

- Storage: $0.06 per active secret version per location per month, and the first 6 are free.
- Access: $0.03 per 10,000 operations, and the first 10,000 are free.

Eleven secrets with one version each (the eight above plus the three PayPal ones) come to
11 − 6 = 5 billable, about **$0.30/month**; without PayPal, 8 − 6 = 2, about $0.12.
Access is 11 reads per boot or deploy, which stays well inside the free tier.

## Where secrets are visible on the VM

- `/run/isramarket/app.env` is on tmpfs, root only, and re-rendered on every boot.
- Docker keeps each container's environment in its config, under `/var/lib/docker` on the
  boot disk. So `sudo docker inspect` shows the values. Google encrypts the disk at rest.
  Anyone with root on the VM can read the secrets, so keep SSH limited to IAP and OS Login
  (README step 5).
