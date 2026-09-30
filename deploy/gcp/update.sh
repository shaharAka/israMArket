#!/usr/bin/env bash
# Deploy a new version of IsraMarket on the VM.
#
#   sudo /srv/isramarket/deploy/gcp/update.sh                 # latest of the repo-ref metadata branch
#   sudo /srv/isramarket/deploy/gcp/update.sh main            # a branch
#   sudo /srv/isramarket/deploy/gcp/update.sh 3fa035c         # a commit (also how you roll back)
#   sudo /srv/isramarket/deploy/gcp/update.sh --recreate      # same code, recreate containers
#                                                             # (after changing site-host or a secret)
#   options: --skip-backup (not recommended)
#
# "Zero-downtime enough": the new images are built while the old containers keep
# serving; `compose up -d` then replaces only the containers whose image or config
# changed (a few seconds each), and Caddy holds requests while `web` restarts. A month
# being generated when the API restarts resumes from its saved stage on startup
# (services/generation_jobs.py). Migrations run at API startup, so a DB-only backup is
# taken first; roll back by running this script with the previous commit (printed).
#
# The whole script is one function called on the last line: `git checkout` below may
# rewrite this very file, and bash would otherwise keep reading the new version mid-run.
set -euo pipefail

main() {
  local REPO_DIR=/srv/isramarket
  local HERE="$REPO_DIR/deploy/gcp"
  local ENV_FILE=/run/isramarket/app.env
  local ref="" recreate=false skip_backup=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --recreate) recreate=true ;;
      --skip-backup) skip_backup=true ;;
      -h|--help) sed -n '2,20p' "$0"; return 0 ;;
      -*) echo "update: unknown option $1" >&2; return 2 ;;
      *) ref=$1 ;;
    esac
    shift
  done

  [[ $EUID -eq 0 ]] || { echo "update: run with sudo" >&2; return 1; }
  log() { echo "update: $*" >&2; }

  if [[ -z "$ref" ]]; then
    ref=$(curl -fsS -H "Metadata-Flavor: Google" \
      http://metadata.google.internal/computeMetadata/v1/instance/attributes/repo-ref 2>/dev/null || true)
    ref=${ref:-main}
  fi

  cd "$REPO_DIR"
  local prev target
  prev=$(git rev-parse HEAD)
  log "fetching (current $prev)"
  git fetch --prune --quiet origin
  if target=$(git rev-parse --verify --quiet "origin/$ref^{commit}"); then :;
  elif target=$(git rev-parse --verify --quiet "$ref^{commit}"); then :;
  else log "unknown ref '$ref'"; return 1; fi
  git checkout --quiet --detach "$target"
  log "checked out $ref = $(git log -1 --format='%h %s')"

  if ! "$HERE/render-env.sh"; then
    log "rendering the environment failed; nothing was built or restarted. Restoring $prev."
    git checkout --quiet --detach "$prev"
    return 1
  fi
  local compose=(docker compose -p isramarket -f "$HERE/docker-compose.prod.yml" --env-file "$ENV_FILE")

  # Nothing has been restarted yet: put the checkout back and rebuild the running
  # version (from cache), so a later `up -d` (startup.sh runs one on every boot) cannot
  # pick up half-built new images.
  abort_before_restart() {
    log "$1; nothing was restarted. Restoring $prev."
    git checkout --quiet --detach "$prev"
    "${compose[@]}" build >/dev/null || log "rebuilding $prev failed too; run: sudo $HERE/update.sh $prev"
  }

  log "building images (the running containers keep serving)"
  "${compose[@]}" build --pull || { abort_before_restart "build failed"; return 1; }

  if [[ "$skip_backup" == false ]]; then
    log "pre-update database backup"
    "$HERE/backup.sh" --db-only --prefix pre-update || { abort_before_restart "backup failed"; return 1; }
  fi

  log "replacing changed containers"
  local up_args=(up -d --remove-orphans)
  [[ "$recreate" == true ]] && up_args+=(--force-recreate)
  "${compose[@]}" "${up_args[@]}"

  log "waiting for health"
  local site_host deadline status_api status_web
  site_host=$(sed -n "s/^SITE_HOST='\(.*\)'$/\1/p" "$ENV_FILE")
  deadline=$((SECONDS + 180))
  while :; do
    status_api=$(docker inspect -f '{{.State.Health.Status}}' "$("${compose[@]}" ps -q api)" 2>/dev/null || echo missing)
    status_web=$(docker inspect -f '{{.State.Health.Status}}' "$("${compose[@]}" ps -q web)" 2>/dev/null || echo missing)
    if [[ "$status_api" == healthy && "$status_web" == healthy ]] &&
      curl -fsS --max-time 10 --resolve "$site_host:443:127.0.0.1" \
        "https://$site_host/backend/health" >/dev/null 2>&1; then
      break
    fi
    if (( SECONDS > deadline )); then
      log "NOT HEALTHY after 180s (api=$status_api web=$status_web)."
      log "Inspect: sudo isramarket-compose logs --tail=200 api web caddy"
      log "Roll back: sudo $HERE/update.sh $prev"
      return 1
    fi
    sleep 5
  done
  log "healthy: https://$site_host/backend/health"

  # Old images and build cache pile up on a 30 GB boot disk.
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null
  log "done. Previous version was $prev (roll back: sudo $HERE/update.sh $prev)"
}

main "$@"
exit $?
