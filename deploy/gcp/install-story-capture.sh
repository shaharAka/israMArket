#!/usr/bin/env bash
# Install the hourly, model-free read of authorized Instagram Stories.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
cat >/etc/systemd/system/isramarket-stories.service <<'UNIT'
[Unit]
Description=Capture authorized Instagram Story observations (no AI or publishing)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/isramarket-compose exec -T api python -m app.jobs.capture_stories
TimeoutStartSec=50min
UNIT
cat >/etc/systemd/system/isramarket-stories.timer <<'UNIT'
[Unit]
Description=Hourly capture before Instagram Stories expire

[Timer]
OnBootSec=20min
OnUnitActiveSec=1h
RandomizedDelaySec=2min

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now isramarket-stories.timer >/dev/null
