#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
python_bin="$script_dir/.venv/bin/python"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
unit_file="$unit_dir/bravoforest-camera-ai.service"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "Khong tim thay systemd tren Pi nay." >&2
  exit 1
fi
if [ ! -x "$python_bin" ]; then
  echo "Chua cai camera AI. Chay: sh deploy/pi/install-controller.sh" >&2
  exit 1
fi

mkdir -p "$unit_dir"
cat > "$unit_file" <<EOF
[Unit]
Description=BravoForest RVM camera AI preview
After=default.target

[Service]
Type=simple
WorkingDirectory=$repo_root
ExecStart=/bin/sh $script_dir/start-camera-ai.sh
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now bravoforest-camera-ai.service
echo "Da bat camera AI tu dong khi tai khoan Pi dang nhap desktop."
echo "Kiem tra: systemctl --user status bravoforest-camera-ai.service"
