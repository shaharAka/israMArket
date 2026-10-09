#!/usr/bin/env bash
# IsraMarket VM bootstrap: the GCE startup-script (runs as root on EVERY boot).
#
# Passed at VM creation with --metadata-from-file startup-script=deploy/gcp/startup.sh.
# It is idempotent: the first boot installs and deploys; later boots only re-check,
# re-render the environment from Secret Manager and `compose up -d` (no rebuild, no
# git pull; code changes go through update.sh). If you change this file, re-apply it:
#   gcloud compute instances add-metadata isramarket-vm --zone me-west1-a \
#     --project isramarket --metadata-from-file startup-script=deploy/gcp/startup.sh
#
# Instance metadata it reads (README.md, step 9):
#   site-host        optional; empty => <external-ip-with-dashes>.sslip.io
#   acme-email       required; Let's Encrypt account e-mail
#   backup-bucket    required; e.g. isramarket-backups-952298804970
#   repo-url         optional; default https://github.com/shaharAka/israMArket.git
#   repo-ref         optional; branch deployed on first boot, default main
#
# Logs: sudo journalctl -u google-startup-scripts.service   (also on the serial console)
set -euo pipefail

REPO_DIR=/srv/isramarket
HERE="$REPO_DIR/deploy/gcp"
DATA_DIR=/mnt/disks/data
DATA_DEV=/dev/disk/by-id/google-isramarket-data # device-name=isramarket-data
APP_UID=10001                                    # the API container's user
MD=http://metadata.google.internal/computeMetadata/v1

log() { echo "isramarket-startup: $*"; }
metadata() { curl -fsS -H "Metadata-Flavor: Google" "$MD/$1" 2>/dev/null || true; }

# --- 1. Data disk -------------------------------------------------------------------
# SQLite, card images, local backups and Caddy's certificates live on a separate
# persistent disk, so the boot disk (OS, Docker images) stays disposable.
for _ in $(seq 1 30); do [[ -e "$DATA_DEV" ]] && break; sleep 2; done
[[ -e "$DATA_DEV" ]] || { log "data disk $DATA_DEV not attached; refusing to start the app"; exit 1; }

if ! mountpoint -q "$DATA_DIR"; then
  if [[ -z "$(blkid -o value -s TYPE "$DATA_DEV" || true)" ]]; then
    log "formatting the new data disk (first boot only: it has no filesystem)"
    mkfs.ext4 -q -m 0 -L isramarket-data -E lazy_itable_init=0,lazy_journal_init=0,discard "$DATA_DEV"
  fi
  mkdir -p "$DATA_DIR"
  # Immutable while unmounted, so nothing can write app data onto the boot disk.
  chattr +i "$DATA_DIR" 2>/dev/null || true
  uuid=$(blkid -o value -s UUID "$DATA_DEV")
  grep -q "$uuid" /etc/fstab || echo "UUID=$uuid $DATA_DIR ext4 discard,defaults,nofail 0 2" >>/etc/fstab
  mount "$DATA_DIR"
fi
mountpoint -q "$DATA_DIR" || { log "$DATA_DIR failed to mount"; exit 1; }
mkdir -p "$DATA_DIR/api" "$DATA_DIR/caddy/data" "$DATA_DIR/caddy/config" "$DATA_DIR/backups"
chown "$APP_UID:$APP_UID" "$DATA_DIR/api"
# 711: the API user (backup.sh snapshots as that user) must traverse it; nobody can list it.
chmod 711 "$DATA_DIR/backups"

# --- 2. Swap (next build + Chrome on 4 GB) -------------------------------------------
if [[ ! -f /swapfile ]]; then
  log "creating 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile
  echo "/swapfile none swap sw 0 0" >>/etc/fstab
  echo "vm.swappiness=10" >/etc/sysctl.d/90-isramarket-swap.conf
  sysctl -q -p /etc/sysctl.d/90-isramarket-swap.conf
fi
grep -qs '^/swapfile ' /proc/swaps || swapon /swapfile

# --- 3. Packages (first boot) --------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  log "installing Docker Engine + Compose plugin from download.docker.com"
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $codename stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
need=()
for pkg in git sqlite3 unattended-upgrades; do dpkg -s "$pkg" >/dev/null 2>&1 || need+=("$pkg"); done
if (( ${#need[@]} )); then apt-get update -q; apt-get install -y -q "${need[@]}"; fi
if ! command -v gcloud >/dev/null; then
  # Debian images from debian-cloud ship google-cloud-cli; this is only a fallback.
  log "installing google-cloud-cli"
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor --yes -o /etc/apt/keyrings/cloud.google.gpg
  echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    >/etc/apt/sources.list.d/google-cloud-sdk.list
  apt-get update -q && apt-get install -y -q google-cloud-cli
fi
# Debian security updates install themselves (the default unattended-upgrades origins).
echo 'APT::Periodic::Update-Package-Lists "1"; APT::Periodic::Unattended-Upgrade "1";' \
  >/etc/apt/apt.conf.d/20auto-upgrades

# --- 4. Docker daemon + journald limits ----------------------------------------------
daemon_json='{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}'
if [[ "$(cat /etc/docker/daemon.json 2>/dev/null)" != "$daemon_json" ]]; then
  log "configuring dockerd (log rotation, live-restore)"
  mkdir -p /etc/docker
  printf '%s\n' "$daemon_json" >/etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

mkdir -p /etc/systemd/journald.conf.d
journald_conf=$'[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=30day'
if [[ "$(cat /etc/systemd/journald.conf.d/isramarket.conf 2>/dev/null)" != "$journald_conf" ]]; then
  printf '%s\n' "$journald_conf" >/etc/systemd/journald.conf.d/isramarket.conf
  systemctl restart systemd-journald
fi

# --- 5. Code (first boot clones; later boots leave the checkout alone) ---------------
if [[ ! -d "$REPO_DIR/.git" ]]; then
  repo_url=$(metadata instance/attributes/repo-url)
  repo_ref=$(metadata instance/attributes/repo-ref)
  log "cloning ${repo_url:-default repo} (${repo_ref:-main})"
  git clone --quiet "${repo_url:-https://github.com/shaharAka/israMArket.git}" "$REPO_DIR"
  git -C "$REPO_DIR" checkout --quiet --detach "origin/${repo_ref:-main}"
fi

# --- 6. Environment (every boot: picks up rotated secrets and metadata) --------------
mkdir -p /etc/isramarket
DATA_DIR="$DATA_DIR" "$HERE/render-env.sh"

# --- 7. Operator wrapper, timers -----------------------------------------------------
cat >/usr/local/bin/isramarket-compose <<EOF
#!/bin/sh
# docker compose for the IsraMarket production stack (installed by startup.sh).
exec docker compose -p isramarket -f $HERE/docker-compose.prod.yml --env-file /run/isramarket/app.env "\$@"
EOF
chmod 755 /usr/local/bin/isramarket-compose

cat >/etc/systemd/system/isramarket-backup.service <<EOF
[Unit]
Description=IsraMarket nightly backup (SQLite + files) to Cloud Storage
After=docker.service network-online.target
Wants=network-online.target
RequiresMountsFor=$DATA_DIR

[Service]
Type=oneshot
Environment=DATA_DIR=$DATA_DIR
ExecStart=$HERE/backup.sh
EOF
cat >/etc/systemd/system/isramarket-backup.timer <<'EOF'
[Unit]
Description=IsraMarket nightly backup, 03:15 Israel time

[Timer]
OnCalendar=*-*-* 03:15:00 Asia/Jerusalem
RandomizedDelaySec=10min
# Runs at the next boot if the VM was off at 03:15.
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/isramarket-research.service <<'EOF'
[Unit]
Description=IsraMarket weekly research job (python -m app.jobs.weekly_research)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
# Skips any business researched in the last 6 days; exit 1 = at least one failed
# (the unit then shows as failed: systemctl status isramarket-research).
ExecStart=/usr/local/bin/isramarket-compose exec -T api python -m app.jobs.weekly_research
TimeoutStartSec=3h
EOF
cat >/etc/systemd/system/isramarket-research.timer <<'EOF'
[Unit]
Description=IsraMarket weekly research, Sundays 06:00 Israel time

[Timer]
OnCalendar=Sun *-*-* 06:00:00 Asia/Jerusalem
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now isramarket-backup.timer isramarket-research.timer >/dev/null

"$HERE/install-story-capture.sh"

# --- 8. Start the stack ----------------------------------------------------------------
# First boot builds the images (~5-10 min on e2-medium). Later boots reuse them; Docker's
# restart policy has usually restarted the containers already and this is a no-op.
if ! docker image inspect isramarket-api isramarket-web >/dev/null 2>&1; then
  log "building images (first boot)"
  /usr/local/bin/isramarket-compose build --pull
fi
/usr/local/bin/isramarket-compose up -d --remove-orphans
log "up: https://$(sed -n "s/^SITE_HOST='\(.*\)'$/\1/p" /run/isramarket/app.env)/"
