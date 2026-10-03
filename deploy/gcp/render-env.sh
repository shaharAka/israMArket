#!/usr/bin/env bash
# Render the container environment for IsraMarket on the GCE VM.
#
#   sudo /srv/isramarket/deploy/gcp/render-env.sh            # writes /run/isramarket/app.env
#
# Called by startup.sh on every boot and by update.sh before every deploy, so a rotated
# secret or a changed instance-metadata value takes effect on the next `update.sh`.
#
# Sources, in order:
#   1. Instance metadata (non-secret): site-host, site-aliases, acme-email, public-base-url.
#      site-host empty => "<external-ip-with-dashes>.sslip.io". Switching to a real
#      domain is ONE metadata value: site-host=isramarket.co.il (see README.md).
#   2. Secret Manager (secrets), read with the VM's service account.
#   3. /etc/isramarket/extra.env (optional, non-secret tunables such as
#      GEMINI_IMAGE_MODEL=...), appended last so it can override defaults.
#
# The output lives on tmpfs (/run), mode 0600, root only. Values are written single-
# quoted, which Docker Compose's env-file parser takes literally.
set -euo pipefail

OUT_DIR=${ISRAMARKET_RUN_DIR:-/run/isramarket}
OUT_FILE="$OUT_DIR/app.env"
EXTRA_FILE=${ISRAMARKET_EXTRA_ENV:-/etc/isramarket/extra.env}
DATA_DIR=${DATA_DIR:-/mnt/disks/data}
MD=http://metadata.google.internal/computeMetadata/v1

log() { echo "render-env: $*" >&2; }

metadata() {
  # Prints the value, or nothing when the key does not exist (HTTP 404).
  curl -fsS -H "Metadata-Flavor: Google" "$MD/$1" 2>/dev/null || true
}

PROJECT_ID=$(metadata project/project-id)
[[ -n "$PROJECT_ID" ]] || { log "not on GCE (no metadata server)"; exit 1; }

SITE_HOST=$(metadata instance/attributes/site-host)
if [[ -z "$SITE_HOST" ]]; then
  ip=$(metadata instance/network-interfaces/0/access-configs/0/external-ip)
  [[ -n "$ip" ]] || { log "no site-host metadata and no external IP"; exit 1; }
  SITE_HOST="${ip//./-}.sslip.io"
fi
# Optional space-separated DNS names which Caddy redirects to the canonical host.
# Validate before Caddyfile substitution: metadata must not inject Caddy directives.
SITE_ALIASES=$(metadata instance/attributes/site-aliases)
read -r -a redirect_hosts <<< "$SITE_ALIASES"
for alias in "${redirect_hosts[@]-}"; do
  [[ -n "$alias" ]] || continue
  if [[ ! "$alias" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
    log "site-aliases must contain space-separated lowercase DNS names"
    exit 1
  fi
done
[[ "$SITE_ALIASES" != *$'\n'* && "$SITE_ALIASES" != *$'\r'* ]] || { log "site-aliases must be one line"; exit 1; }
ACME_EMAIL=$(metadata instance/attributes/acme-email)
[[ -n "$ACME_EMAIL" ]] || { log "set the acme-email instance metadata (Let's Encrypt account)"; exit 1; }
PUBLIC_BASE_URL=$(metadata instance/attributes/public-base-url)
PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://$SITE_HOST}

secret() {
  # $1 = Secret Manager name, $2 = required|optional
  local value
  if value=$(gcloud secrets versions access latest --secret="$1" --project="$PROJECT_ID" 2>/dev/null); then
    printf '%s' "$value"
  elif [[ "$2" == required ]]; then
    log "required secret '$1' is missing or unreadable (see deploy/gcp/secrets.md)"
    return 1
  else
    log "optional secret '$1' not set; leaving it blank"
  fi
}

line() {
  # KEY='value' — refuse values that would break single-quoting.
  local key=$1 value=$2
  if [[ "$value" == *"'"* || "$value" == *$'\n'* ]]; then
    log "value for $key contains a quote or newline; refusing to write it"
    return 1
  fi
  printf "%s='%s'\n" "$key" "$value"
}

umask 077
mkdir -p "$OUT_DIR"
tmp=$(mktemp "$OUT_DIR/.app.env.XXXXXX")
trap 'rm -f "$tmp"' EXIT

{
  echo "# Rendered by deploy/gcp/render-env.sh at $(date -u +%FT%TZ). Do not edit; re-run it."
  # Used by docker-compose.prod.yml interpolation and by the scripts.
  line PROJECT_ID "$PROJECT_ID"
  line SITE_HOST "$SITE_HOST"
  line SITE_ALIASES "$SITE_ALIASES"
  line ACME_EMAIL "$ACME_EMAIL"
  line DATA_DIR "$DATA_DIR"
  # The browser-facing origin: CORS, the CSRF origin check, cookies, OAuth return pages.
  line WEB_ORIGIN "https://$SITE_HOST"
  # Only the web tier is public, so the API is addressed through the Next.js proxy.
  # OAuth redirect URIs are built from WEB_ORIGIN + /backend (Settings.oauth_callback_base):
  # https://$SITE_HOST/backend/auth/google/callback, .../integrations/{ga4,meta}/callback.
  line API_ORIGIN "https://$SITE_HOST/backend"
  # WhatsApp tracked links: {PUBLIC_BASE_URL}/r/{code}. Links already posted keep the
  # origin they were printed with, so set the final domain before owners post.
  line PUBLIC_BASE_URL "$PUBLIC_BASE_URL"

  line GEMINI_API_KEY "$(secret gemini-api-key required)"
  line JWT_SECRET "$(secret jwt-secret required)"
  line TOKEN_ENCRYPTION_KEY "$(secret token-encryption-key required)"
  line META_MODEL_API_KEY "$(secret meta-model-api-key optional)"
  line GOOGLE_CLIENT_ID "$(secret google-client-id optional)"
  line GOOGLE_CLIENT_SECRET "$(secret google-client-secret optional)"
  line META_APP_ID "$(secret meta-app-id optional)"
  line META_APP_SECRET "$(secret meta-app-secret optional)"
  # PayPal subscription billing (docs/billing.md). Blank = "payment not open yet".
  # Non-secret companions go in $EXTRA_FILE: PAYPAL_ENV (sandbox|live), PAYPAL_PLAN_ID,
  # BILLING_ENFORCE (default false).
  line PAYPAL_CLIENT_ID "$(secret paypal-client-id optional)"
  line PAYPAL_CLIENT_SECRET "$(secret paypal-client-secret optional)"
  line PAYPAL_WEBHOOK_ID "$(secret paypal-webhook-id optional)"

  if [[ -f "$EXTRA_FILE" ]]; then
    echo "# --- $EXTRA_FILE"
    grep -Ev '^[[:space:]]*(#|$)' "$EXTRA_FILE" || true
  fi
} >"$tmp"

# `secret ... required` failing inside $(...) does not stop the block; check explicitly.
for key in GEMINI_API_KEY JWT_SECRET TOKEN_ENCRYPTION_KEY; do
  if grep -q "^$key=''$" "$tmp"; then
    log "$key is empty; refusing to render an environment the API would reject"
    exit 1
  fi
done

chmod 600 "$tmp"
mv -f "$tmp" "$OUT_FILE"
trap - EXIT
log "wrote $OUT_FILE for https://$SITE_HOST"
