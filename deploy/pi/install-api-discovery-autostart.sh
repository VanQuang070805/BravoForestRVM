#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/bravoforest-api-discovery.service"
mkdir -p "$unit_dir"

cat > "$unit_file" <<EOF
[Unit]
Description=BravoForest API address discovery
After=default.target

[Service]
Type=simple
ExecStart=/bin/sh $script_dir/watch-api-host.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now bravoforest-api-discovery.service
echo "Da bat tu dong tim API tai $unit_file"
