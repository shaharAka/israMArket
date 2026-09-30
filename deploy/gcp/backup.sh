#!/usr/bin/env bash
# Back up IsraMarket's SQLite database and files to Cloud Storage.
#
#   sudo /srv/isramarket/deploy/gcp/backup.sh                # nightly: DB + files
#   sudo /srv/isramarket/deploy/gcp/backup.sh --db-only --prefix pre-update
#
# Runs nightly from isramarket-backup.timer (installed by startup.sh) and before every
# deploy from update.sh. Safe while the app is running:
#   - the database is copied with SQLite's online backup API (`.backup`), which yields a
#     consistent snapshot even mid-write, then checked with PRAGMA integrity_check;
#   - everything else under the data dir (generated card images, uploads) is tarred.
#
# Objects: gs://<bucket>/<prefix>/<YYYY-MM-DD>/<timestamp>/{isramarket.db.gz,files.tar,SHA256SUMS}
# Retention: the bucket's lifecycle rule deletes objects older than 30 days
# (backup-lifecycle.json). The last 3 local copies stay on the data disk as well.
#
# Restore: README.md, "Restore from a backup".
set -euo pipefail

DATA_DIR=${DATA_DIR:-/mnt/disks/data}
API_DATA="$DATA_DIR/api"
LOCAL_DIR="$DATA_DIR/backups"
KEEP_LOCAL=3
APP_UID=10001 # the API container's user (api/Dockerfile)
PREFIX=nightly
DB_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only) DB_ONLY=true ;;
    --prefix) PREFIX=${2:?--prefix needs a value}; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "backup: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "backup: $*" >&2; }

metadata() {
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/$1" 2>/dev/null || true
}

BUCKET=${BACKUP_BUCKET:-$(metadata instance/attributes/backup-bucket)}
[[ -n "$BUCKET" ]] || { log "no bucket: set the backup-bucket instance metadata or BACKUP_BUCKET"; exit 1; }
mountpoint -q "$DATA_DIR" || { log "$DATA_DIR is not mounted; refusing to back up the boot disk"; exit 1; }
[[ -f "$API_DATA/isramarket.db" ]] || { log "no database at $API_DATA/isramarket.db"; exit 1; }

ts=$(date -u +%Y%m%dT%H%M%SZ)
day=$(date -u +%Y-%m-%d)
work="$LOCAL_DIR/$PREFIX-$ts"
mkdir -p "$work"
# The snapshot runs as the app user, which must traverse LOCAL_DIR (711: no listing)
# to reach its own work dir (700).
chmod 711 "$LOCAL_DIR"
# Read the database as the app's own user, so SQLite never creates a root-owned journal
# or -shm file next to it that the API could then not write.
chown "$APP_UID:$APP_UID" "$work"
chmod 700 "$work"

log "database snapshot"
setpriv --reuid="$APP_UID" --regid="$APP_UID" --clear-groups \
  sqlite3 "$API_DATA/isramarket.db" ".timeout 30000" ".backup '$work/isramarket.db'"
check=$(sqlite3 "$work/isramarket.db" "PRAGMA integrity_check;")
[[ "$check" == "ok" ]] || { log "integrity_check failed on the copy: $check"; exit 1; }
gzip -6 "$work/isramarket.db"

if [[ "$DB_ONLY" == false ]]; then
  log "files archive"
  # PNG/JPEG do not compress; a plain tar is as small and much faster.
  # Exit status 1 from GNU tar means "a file changed while being read" (a card being
  # written right now); that file will be complete in tomorrow's archive.
  set +e
  tar -C "$API_DATA" --exclude='./isramarket.db' --exclude='./isramarket.db-*' \
    --warning=no-file-changed -cf "$work/files.tar" .
  status=$?
  set -e
  [[ $status -le 1 ]] || { log "tar failed ($status)"; exit 1; }
fi

(cd "$work" && sha256sum -- * >SHA256SUMS)

dest="gs://$BUCKET/$PREFIX/$day/$ts/"
log "upload to $dest"
gcloud storage cp --no-user-output-enabled "$work"/* "$dest"

# Keep only the newest local copies of this prefix.
find "$LOCAL_DIR" -mindepth 1 -maxdepth 1 -type d -name "$PREFIX-*" -printf '%f\n' \
  | sort -r | tail -n +$((KEEP_LOCAL + 1)) \
  | while read -r old; do rm -rf -- "${LOCAL_DIR:?}/$old"; done

log "done: $dest ($(du -sh "$work" | cut -f1))"
